import { openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import {
  compareRegimes,
  excessConsequence,
  fatorR,
  type MonthAmount,
  projectRba,
  runRate,
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
  it("ceiling: calendar-year revenue (RBA) crosses R$ 4,8 mi in December, not earlier", () => {
    // 2026: Jan-Mar 380, Apr-Jun 440 -> ytd 2.460 mil; run-rate 440: Jul 2.900, Aug 3.340, Sep 3.780,
    // Oct 4.220, Nov 4.660, Dec 5.100 (crosses). The rolling RBT12 would cross earlier: not the legal basis.
    const rev = months("2026-06", [...Array(9).fill(380), 440, 440, 440]);
    const ytd = rev
      .filter((m) => m.competencia.startsWith("2026"))
      .reduce((a, m) => a + m.amount, 0);
    expect(ytd).toBe(2_460_000 * 100);
    const p = projectRba(ytd, "2026-06", runRate(rev), 480_000_000);
    expect(p.alreadyAbove).toBe(false);
    expect(p.month).toBe("2026-12");
    expect(p.atEnd).toBe(5_100_000 * 100);
    expect(excessConsequence(p.atEnd, 480_000_000)).toBe("next_year"); // 106,25%
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
    expect(projectRba(2_400_000 * 100, "2026-12", 200 * MIL, 480_000_000).month).toBeUndefined();
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

describe("comparison honours the configured sublimit", () => {
  it("R$ 2 mi of revenue: R$ 1,8 mi sublimit takes ICMS/ISS out of the DAS", () => {
    const input = {
      annualRevenue: 2_000_000 * 100,
      payroll12: 800_000 * 100,
      annex: "III",
      activity: "servicos_geral",
      issRateBp: 500,
      year: 2026,
    } as const;
    const def = compareRegimes(input);
    const low = compareRegimes({ ...input, sublimit: 1_800_000 * 100 });
    expect(low.simples.total).toBeLessThan(def.simples.total);
    expect(compareRegimes({ ...input, sublimit: 3_600_000 * 100 })).toEqual(def);
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

  it("flags a projected ceiling crossing on the calendar-year revenue", async () => {
    const r = await runAgent({
      ...base,
      revenue: months("2026-06", [...Array(9).fill(380), 440, 440, 440]),
      payroll12: 2_000_000 * 100,
    });
    const f = r.findings.find((x) => x.message.includes("teto do Simples"));
    expect(f?.severity).toBe("warning");
    expect(f?.message).toContain("12/2026");
    expect(f?.message).not.toContain("08/2026");
  });

  it("RBT12 above the ceiling but RBA still below: warning, not a blocker; comparison skipped", async () => {
    const r = await runAgent({
      ...base,
      revenue: months("2026-06", Array(12).fill(420)),
      payroll12: 2_000_000 * 100,
    });
    expect(r.findings.some((f) => f.severity === "blocker")).toBe(false);
    expect(r.findings.find((f) => f.message.includes("teto do Simples"))?.message).toContain(
      "12/2026",
    );
    expect(r.events.some((e) => e.kind === "regime.comparison")).toBe(false);
  });

  it("blocks when the calendar-year revenue is already above the ceiling", async () => {
    const r = await runAgent({
      ...base,
      revenue: months("2026-06", Array(12).fill(900)),
      payroll12: 2_000_000 * 100,
    });
    expect(r.findings.some((f) => f.severity === "blocker")).toBe(true);
  });

  it("passes ctx.sublimit to the comparison", async () => {
    const rev = months("2026-06", Array(12).fill(166)); // RBT12 R$ 1.992 mil
    const cmp = async (sublimit?: number) => {
      const r = await runAgent({
        ...base,
        annex: "III",
        issRateBp: 500,
        revenue: rev,
        payroll12: 800_000 * 100,
        ...(sublimit ? { sublimit } : {}),
      });
      return r.events.find((e) => e.kind === "regime.comparison")?.payload as {
        simples: { total: number };
      };
    };
    expect((await cmp(1_800_000 * 100)).simples.total).toBeLessThan((await cmp()).simples.total);
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
