import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents, openStore } from "@ai4a/db";
import { IntegraContadorClient } from "@ai4a/integra-contador";
import { describe, expect, it } from "vitest";
import { runSimMonth } from "../month";
import { type DasIssuer, IntegraDasIssuer } from "./issuer";

const tmp = () => mkdtempSync(join(tmpdir(), "ai4a-delivery-"));
const FIRM = "11444777000161";

function clientReturning(body: unknown, status = 200) {
  return new IntegraContadorClient({
    accessToken: "token-placeholder",
    jwtToken: "jwt-placeholder",
    contratante: FIRM,
    autorPedidoDados: FIRM,
    fetch: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch,
  });
}

describe("delivery agent", () => {
  it("ends an approved simulated month in Entrega with a DAS document", async () => {
    const st = await openStore(":memory:");
    const dataDir = tmp();
    const { outcomes } = await runSimMonth(st, 5, { dataDir });
    expect(Object.values(outcomes).every((o) => o.status === "closed")).toBe(true);

    const ev = await st.listEvents();
    const simples = ev
      .filter((e) => e.kind === "tax.draft")
      .filter((e) => JSON.parse(e.payload).guide === "PGDAS-D");
    const issued = ev.filter((e) => e.kind === "delivery.das.issued");
    expect(simples.length).toBeGreaterThan(0);
    expect(issued).toHaveLength(simples.length);

    const das = (await st.db.select().from(documents)).filter((d) => d.kind === "das");
    expect(das).toHaveLength(simples.length);
    for (const d of das) expect(readFileSync(d.storagePath ?? "", "utf8")).toContain("%PDF");

    const drafts = ev.filter((e) => e.kind === "delivery.message.drafted");
    expect(drafts).toHaveLength(issued.length);
    for (const m of drafts) {
      const p = JSON.parse(m.payload);
      expect(p.sent).toBe(false);
      expect(p.text).toContain("DAS");
    }
    const entrega = ev.filter(
      (e) => e.kind === "phase.changed" && JSON.parse(e.payload).phase === "entrega",
    );
    expect(entrega.at(-1) && JSON.parse(entrega.at(-1)?.payload ?? "{}").to).toBe("done");
  });

  it("blocks the month when the accountant sent it back (no DAS issued)", async () => {
    const st = await openStore(":memory:");
    const { outcomes } = await runSimMonth(st, 5, {
      dataDir: tmp(),
      approver: { decide: async () => ({ decision: "sent_back", by: "t" }) },
    });
    expect(Object.values(outcomes).every((o) => o.status === "blocked")).toBe(true);
    expect((await st.listEvents()).some((e) => e.kind === "delivery.das.issued")).toBe(false);
  });

  it("blocks when the issued DAS differs from the Tax agent's draft", async () => {
    const st = await openStore(":memory:");
    const wrong: DasIssuer = {
      name: "wrong",
      issue: async ({ expectedCentavos }) => ({
        numeroDas: "X",
        amountCentavos: expectedCentavos + 1,
        pdf: Buffer.from("%PDF"),
      }),
    };
    const { outcomes } = await runSimMonth(st, 5, { dataDir: tmp(), dasIssuer: wrong });
    expect(Object.values(outcomes).some((o) => o.status === "blocked")).toBe(true);
    expect((await st.db.select().from(documents)).some((d) => d.kind === "das")).toBe(false);
  });
});

describe("IntegraDasIssuer", () => {
  it("parses the recorded GERARDAS12 response (reais -> centavos)", async () => {
    // Same shape as the recorded fixture in packages/integra-contador (synthetic data).
    const fx = {
      status: 200,
      mensagens: [{ codigo: "[Sucesso-PGDASD]", texto: "DAS gerado." }],
      dados:
        '[{"detalhamento":{"numeroDas":"07202500000000000","valorTotalDas":1234},"pdf":"U1lOVEhFVElD"}]',
    };
    const r = await new IntegraDasIssuer(clientReturning(fx)).issue({
      cnpj: "11222333000181",
      month: "2025-07",
      expectedCentavos: 123400,
    });
    expect(r.numeroDas).toBe("07202500000000000");
    expect(r.amountCentavos).toBe(123400);
    expect(r.pdf.toString()).toBe("SYNTHETIC");
  });

  it("surfaces an error response as a blocker, not a crash", async () => {
    const body = { status: 403, mensagens: [{ codigo: "x", texto: "Sem procuracao" }] };
    const issuer = new IntegraDasIssuer(clientReturning(body, 403));
    await expect(
      issuer.issue({ cnpj: "11222333000181", month: "2025-07", expectedCentavos: 1 }),
    ).rejects.toThrow("Sem procuracao");
  });
});
