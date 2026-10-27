import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents, openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import {
  type CapturedFile,
  type CaptureProvider,
  type CaptureRequest,
  runSimMonth,
  SimulatedClient,
  SimulatorProvider,
} from "../index";
import { draftCollectionMessage } from "./message";

/** Capture that loses the first NF-e/NFS-e of every client, like a client who forgot to send it. */
class LossyProvider implements CaptureProvider {
  readonly name = "lossy";
  lost: string[] = [];
  constructor(private inner: CaptureProvider) {}
  async capture(req: CaptureRequest) {
    const r = await this.inner.capture(req);
    const i = r.files.findIndex((f) => f.key);
    const [gone] = r.files.splice(i, 1);
    if (gone?.key) this.lost.push(gone.key);
    return r;
  }
}

const tmp = () => mkdtempSync(join(tmpdir(), "ai4a-collection-"));

describe("collection agent", () => {
  it("drafts a message, never sends it, and the simulated client completes the month", async () => {
    const st = await openStore(":memory:");
    const lossy = new LossyProvider(new SimulatorProvider(5));
    const { outcomes } = await runSimMonth(st, 5, { provider: lossy, dataDir: tmp() });
    expect(Object.values(outcomes).every((o) => o.status === "closed")).toBe(true);
    expect(lossy.lost).toHaveLength(3);

    const ev = await st.listEvents();
    const drafts = ev.filter((e) => e.kind === "collection.message.drafted");
    expect(drafts).toHaveLength(3);
    for (const d of drafts) {
      const p = JSON.parse(d.payload);
      expect(p.sent).toBe(false);
      expect(p.text).toContain("Olá");
      expect(p.text).toContain("faltando");
    }
    expect(ev.some((e) => e.kind === "finding.created" && e.agent === "collection")).toBe(false);
    const keys = new Set((await st.db.select().from(documents)).map((r) => r.key));
    for (const k of lossy.lost) expect(keys.has(k)).toBe(true);
    st.close();
  });

  it("does nothing when the month is complete", async () => {
    const st = await openStore(":memory:");
    await runSimMonth(st, 5, { dataDir: tmp() });
    const ev = await st.listEvents();
    expect(ev.some((e) => e.kind === "collection.message.drafted")).toBe(false);
    expect(ev.some((e) => e.kind === "collection.nothing_missing")).toBe(true);
    st.close();
  });

  it("raises a warning when the client does not answer", async () => {
    const st = await openStore(":memory:");
    const silent = { name: "silent", reply: async (): Promise<CapturedFile[]> => [] };
    await runSimMonth(st, 5, {
      provider: new LossyProvider(new SimulatorProvider(5)),
      responder: silent,
      dataDir: tmp(),
      nClients: 1,
    });
    const ev = await st.listEvents();
    const f = ev.filter((e) => e.kind === "finding.created" && e.agent === "collection");
    expect(f).toHaveLength(1);
    expect(JSON.parse(f[0]?.payload ?? "{}").severity).toBe("warning");
    st.close();
  });

  it("SimulatedClient only returns what was asked", async () => {
    const src = new SimulatorProvider(5);
    const { files } = await src.capture({
      cnpj: (await import("@ai4a/simulator")).generatePortfolio(5, ["2026-09"]).companies[0]
        ?.company.cnpj as string,
      month: "2026-09",
    });
    const target = files.find((f) => f.key);
    expect(target).toBeDefined();
    const got = await new SimulatedClient(src).reply({
      cnpj: (await import("@ai4a/simulator")).generatePortfolio(5, ["2026-09"]).companies[0]
        ?.company.cnpj as string,
      month: "2026-09",
      missing: [
        { ref: target?.key as string, date: "2026-09-01", counterpart: "X", amountCentavos: 1 },
      ],
    });
    expect(got.map((f) => f.key)).toEqual([target?.key]);
  });

  it("formats the message in pt-BR", () => {
    const t = draftCollectionMessage("Aurora Ltda", "2026-09", [
      { ref: "123", date: "2026-09-03", counterpart: "Fornecedor", amountCentavos: 123456 },
    ]);
    expect(t).toContain("09/2026");
    expect(t).toContain("03/09/2026");
    expect(t).toContain("1 nota");
    expect(t).toMatch(/R\$\s?1\.234,56/);
  });
});
