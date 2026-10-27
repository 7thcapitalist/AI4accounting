import { openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import {
  compareRegimes,
  excessConsequence,
  fatorR,
  type MonthAmount,
  projectRba,
  projectRbt12,
} from "./engine";
import { RegimeAgent, type RegimeContext, StaticRegimeContext } from "./index";

const MIL = 100_000; // R$ 1.000,00 in centavos

/** 12 months ending at `last`, amounts oldest first. */
function months(last: string, amounts: number[]): MonthAmount[] {
  const out: MonthAmount[] = [];
  let [y, m] = [Number(last.slice(0, 4)), Number(last.slice(5))];
  for (let i = amounts.length - 1; i >= 0; i--) {
    out.unshift({
      competencia: `${y}-${String(m).padStart(2, "0")}`,
      amount: (amounts[i] ?? 0) * MIL,
    });
    if (--m === 0) [y, m] = [y - 1, 12];
  }
  return out;
}

describe("projection (hand-computed)", () => {
  it("ceiling: 9 months of R$ 380 mil + 3 of R$ 440 mil crosses R$ 4,8 mi two months later", () => {
    // RBT12 = 9x380 + 3x440 = 4.740 mil; run-rate 440; +60 per month dropped 380:
    // 2027-01 = 4.800 (not above), 2027-02 = 4.860 (crosses); after 9 drops of 380: 4.740 + 540 = 5.280.
    const rev = months("2026-12", [...Array(9).fill(380), 440, 440, 440]);
    const p = projectRbt12(rev, 480_000_000);
    expect(p.alreadyAbove).toBe(false);
    expect(p.month).toBe("2027-02");
    expect(p.atEnd).toBe(5_280_000 * 100);
    expect(excessConsequence(p.atEnd, 480_000_000)).toBe("next_year"); // 110% of the ceiling
  });

  it("excess above 20% takes effect right away", () => {
    expect(excessConsequence(576_000_001, 480_000_000)).toBe("from_excess_month");
    expect(excessConsequence(576_000_000, 480_000_000)).toBe("next_year");
  });

  it("sublimit: R$ 350 mil a month crosses R$ 3,6 mi in November", () => {
    // Jan-Jun = 2.100 mil; Jul 2.450, Aug 2.800, Sep 3.150, Oct 3.500, Nov 3.850 (crosses), Dec 4.200.
    const p = projectRba(2_100_000 * 100, "2026-06", 350 * MIL, 360_000_000);
    expect(p.month).toBe("2026-11");
    expect(p.atEnd).toBe(4_200_000 * 100);
    expect(excessConsequence(p.atEnd, 360_000_000)).toBe("next_year"); // 116,7%
  });

  it("flat revenue under the limits raises nothing", () => {
    const rev = months("2026-12", Array(12).fill(200));
    expect(projectRbt12(rev, 480_000_000).month).toBeUndefined();
  });

  it("fator R: payroll of R$ 1.000 mil on RBT12 R$ 4.200 mil is 23,80% and needs R$ 1.176 mil", () => {
    const fr = fatorR(1_000_000 * 100, 4_200_000 * 100);
    expect(fr).toEqual({
      ratioPct: 23.8,
      annex: "V",
      payrollNeeded: 1_176_000 * 100,
      payrollGap: 176_000 * 100,
    });
    expect(fatorR(1_176_000 * 100, 4_200_000 * 100).annex).toBe("III");
  });
});

describe("Simples x Lucro Presumido (hand-computed)", () => {
  it("R$ 1,2 mi of services, no ISS", () => {
    const c = compareRegimes({
      annualRevenue: 1_200_000 * 100,
      payroll12: 400_000 * 100,
      annex: "FATOR_R",
      activity: "servicos_geral",
      issRateBp: 0,
      year: 2026,
    });
    // Presumido: PIS 0,65% = 7.800; COFINS 3% = 36.000; per quarter of R$ 300 mil the IRPJ base is
    // 32% = 96.000 -> 15% = 14.400 + 10% x (96.000 - 60.000) = 3.600 -> 18.000 (x4 = 72.000);
    // CSLL 9% x 96.000 = 8.640 (x4 = 34.560). Total 150.360.
    expect(c.presumido).toMatchObject({
      pis: 780_000,
      cofins: 3_600_000,
      irpj: 7_200_000,
      csll: 3_456_000,
      total: 15_036_000,
    });
    // Simples Annex III (fator R 33%), band 4: (1.200.000 x 16% - 35.640) / 1.200.000 x 1.200.000 = 156.360.
    expect(c.simples.annex).toBe("III");
    expect(c.simples.total).toBe(15_636_000);
    expect(c.simplesAdvantage).toBe(-600_000);
  });
});

async function runAgent(ctx: RegimeContext, regime = "simples") {
  const st = await openStore(":memory:");
  await st.client.batch([
    "INSERT INTO firms VALUES ('f','F')",
    `INSERT INTO clients VALUES ('cl','f','C','11111111000191','${regime}')`,
    "INSERT INTO competencias VALUES ('c1','cl','2026-06')",
  ]);
  const res = await new RegimeAgent({
    store: st,
    context: new StaticRegimeContext({ "11111111000191": ctx }),
  }).run({ taskId: "t", competenciaId: "c1", phase: "apuracao" });
  st.close();
  return res;
}

const base = {
  annex: "FATOR_R",
  activity: "servicos_geral",
  issRateBp: 0,
} as const;

describe("RegimeAgent", () => {
  it("flags the sublimit crossing and the lost fator R for a simulated company", async () => {
    // Jan-Jun 2026 at R$ 350 mil: ytd 2.100 mil; RBT12 4.200 mil (2025-07..2026-06 all 350).
    const r = await runAgent({
      ...base,
      revenue: months("2026-06", Array(12).fill(350)),
      payroll12: 1_000_000 * 100,
    });
    const msgs = r.findings.map((f) => f.message);
    expect(msgs.some((m) => m.includes("sublimite") && m.includes("11/2026"))).toBe(true);
    expect(msgs.some((m) => m.includes("Fator R de 23,80%") && m.includes("R$ 1.176.000,00"))).toBe(
      true,
    );
    expect(r.findings.some((f) => f.message.includes("teto do Simples"))).toBe(false);
    expect(r.findings.every((f) => f.severity !== "blocker" && f.source)).toBe(true);
    expect(r.events.some((e) => e.kind === "regime.comparison")).toBe(true);
  });

  it("flags a projected ceiling crossing", async () => {
    const r = await runAgent({
      ...base,
      revenue: months("2026-06", [...Array(9).fill(380), 440, 440, 440]),
      payroll12: 2_000_000 * 100,
    });
    const f = r.findings.find((x) => x.message.includes("teto do Simples"));
    expect(f?.severity).toBe("warning");
    expect(f?.message).toContain("08/2026");
  });

  it("blocks when RBT12 is already above the ceiling and skips the comparison", async () => {
    const r = await runAgent({
      ...base,
      revenue: months("2026-06", Array(12).fill(420)),
      payroll12: 2_000_000 * 100,
    });
    expect(r.findings.some((f) => f.severity === "blocker")).toBe(true);
    expect(r.events.some((e) => e.kind === "regime.comparison")).toBe(false);
  });

  it("warns instead of guessing when the history is short", async () => {
    const r = await runAgent({ ...base, revenue: months("2026-06", [100, 100]), payroll12: 0 });
    expect(r.findings[0]?.message).toContain("Historico de receita insuficiente");
  });

  it("only compares for a Presumido client", async () => {
    const r = await runAgent(
      { ...base, revenue: months("2026-06", Array(12).fill(100)), payroll12: 300_000 * 100 },
      "presumido",
    );
    expect(r.events.map((e) => e.kind)).toEqual(["regime.snapshot", "regime.comparison"]);
  });
});
