import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@ai4a/db";
import { DEFAULT_MONTHS, expectedMonthlyTax, generatePortfolio } from "@ai4a/simulator";
import { describe, expect, it } from "vitest";
import { CaptureAgent, SimulatorProvider } from "../capture";
import { SimulatorTaxContext, TaxAgent } from "./index";

async function runTax(seed: number, cnpj: string, regime: string, month: string) {
  const st = await openStore(":memory:");
  await st.client.batch([
    "INSERT INTO firms VALUES ('f','F')",
    `INSERT INTO clients VALUES ('cl','f','C','${cnpj}','${regime}')`,
    `INSERT INTO competencias VALUES ('c1','cl','${month}')`,
  ]);
  const dataDir = mkdtempSync(join(tmpdir(), "ai4a-tax-"));
  const base = { taskId: "t", competenciaId: "c1" } as const;
  await new CaptureAgent({ store: st, provider: new SimulatorProvider(seed), dataDir }).run({
    ...base,
    phase: "captura",
  });
  const res = await new TaxAgent({ store: st, context: new SimulatorTaxContext(seed) }).run({
    ...base,
    phase: "apuracao",
  });
  st.close();
  return res;
}

const drafts = (r: Awaited<ReturnType<typeof runTax>>) =>
  r.events.filter((e) => e.kind === "tax.draft").map((e) => e.payload as Record<string, unknown>);
const amount = (r: Awaited<ReturnType<typeof runTax>>, code: string) =>
  drafts(r).find((d) => d.code === code)?.amountCentavos;

describe("TaxAgent on clean simulated months", () => {
  for (const seed of [1, 7, 42]) {
    it(`matches the engines to the centavo for every company-month (seed ${seed})`, async () => {
      const { companies } = generatePortfolio(seed, DEFAULT_MONTHS);
      let checked = 0;
      for (const { company, months } of companies) {
        for (const m of months) {
          const r = await runTax(seed, company.cnpj, company.profile.regime, m.competencia);
          const label = `${company.id} ${m.competencia}`;
          expect(
            r.findings.filter((f) => f.severity !== "info"),
            label,
          ).toEqual([]);
          const summary = r.events.find((e) => e.kind === "tax.summary")?.payload as {
            monthlyTax: number;
            revenue: number;
          };
          expect(summary.revenue, label).toBe(m.expected.revenue);
          expect(summary.monthlyTax, label).toBe(expectedMonthlyTax(m.expected));
          const e = m.expected;
          if (e.das) expect(drafts(r)[0]?.amountCentavos, label).toBe(e.das.total);
          if (e.presumidoMes) {
            expect(amount(r, "8109"), label).toBe(e.presumidoMes.pis.aPagar);
            expect(amount(r, "2172"), label).toBe(e.presumidoMes.cofins.aPagar);
          }
          if (e.presumidoTrimestre) {
            expect(amount(r, "2089"), label).toBe(e.presumidoTrimestre.irpj.aPagar);
            expect(amount(r, "2372"), label).toBe(e.presumidoTrimestre.csll.aPagar);
          } else {
            expect(amount(r, "2089"), label).toBeUndefined();
          }
          checked++;
        }
      }
      expect(checked).toBe(45);
    });
  }

  it("traces the revenue to one event per issued document", async () => {
    const { company, months } = generatePortfolio(3, ["2026-09"]).companies[0] ?? {};
    const sim = months?.[0];
    if (!company || !sim) throw new Error("empty portfolio");
    const r = await runTax(3, company.cnpj, company.profile.regime, "2026-09");
    const lines = r.events.filter((e) => e.kind === "tax.revenue");
    expect(lines).toHaveLength(sim.documents.filter((d) => d.role === "saida").length);
    expect(lines.every((l) => l.documentId)).toBe(true);
  });

  it("blocks a regime outside the scope", async () => {
    const { company } = generatePortfolio(3, ["2026-09"]).companies[0] ?? {};
    if (!company) throw new Error("empty portfolio");
    const r = await runTax(3, company.cnpj, "mei", "2026-09");
    expect(r.findings[0]?.severity).toBe("blocker");
  });
});
