import { describe, expect, it } from "vitest";
import {
  ANNEX_TABLES,
  type Annex,
  annexByFatorR,
  annualize,
  calculateDas,
  effectiveRate,
} from "./simples-nacional";

const R = (reais: number) => reais * 100;

// Hand-computed: effective = (RBT12 x Aliq - PD) / RBT12 (LC 123/2006 art. 18 par. 1-A), 4 decimals
// (millionths), DAS = round(revenue x effective). Expected values re-derived with exact fractions.
const GOLDEN: [string, Annex, number, number, number, number][] = [
  // [label, annex, rbt12, revenue, effective (millionths), DAS reais]
  // I-1: 4,00% x 12.000 = 480,00
  ["I band 1", "I", 150_000, 12_000, 40_000, 480],
  // I-2: (300.000 x 7,3% - 5.940) / 300.000 = 15.960 / 300.000 = 5,32%
  ["I band 2", "I", 300_000, 25_000, 53_200, 1_330],
  // I-6: (4.000.000 x 19% - 378.000) / 4.000.000 = 9,55%
  ["I band 6", "I", 4_000_000, 330_000, 95_500, 31_515],
  // II-4: (1.000.000 x 11,2% - 22.500) / 1.000.000 = 8,95%
  ["II band 4", "II", 1_000_000, 90_000, 89_500, 8_055],
  // II-6: (4.000.000 x 30% - 720.000) / 4.000.000 = 12,00%
  ["II band 6", "II", 4_000_000, 350_000, 120_000, 42_000],
  // III-3: (500.000 x 13,5% - 17.640) / 500.000 = 9,972% -> 40.000 x 9,972% = 3.988,80
  ["III band 3", "III", 500_000, 40_000, 99_720, 3_988.8],
  // III-5: (2.000.000 x 21% - 125.640) / 2.000.000 = 14,718%
  ["III band 5", "III", 2_000_000, 150_000, 147_180, 22_077],
  // III-6: (4.800.000 x 33% - 648.000) / 4.800.000 = 19,50%
  ["III band 6", "III", 4_800_000, 400_000, 195_000, 78_000],
  // IV-4: (800.000 x 14% - 39.780) / 800.000 = 9,0275%
  ["IV band 4", "IV", 800_000, 60_000, 90_275, 5_416.5],
  // IV-1: 4,5% x 8.000 = 360,00
  ["IV band 1", "IV", 100_000, 8_000, 45_000, 360],
  // V-2: (300.000 x 18% - 4.500) / 300.000 = 16,50%
  ["V band 2", "V", 300_000, 20_000, 165_000, 3_300],
  // V-5: (3.000.000 x 23% - 62.100) / 3.000.000 = 20,93%
  ["V band 5", "V", 3_000_000, 250_000, 209_300, 52_325],
];

describe("Simples Nacional golden cases", () => {
  it.each(GOLDEN)("%s", (_label, annex, rbt12, revenue, rate, das) => {
    expect(effectiveRate(annex, R(rbt12))).toBe(rate);
    const result = calculateDas({
      annex,
      rbt12: R(rbt12),
      revenue: R(revenue),
      icmsIssBarred: rbt12 > 3_600_000 ? true : undefined,
    });
    expect(result.total).toBe(Math.round(das * 100));
    expect(Object.values(result.taxes).reduce((a, b) => a + b, 0)).toBe(result.total);
  });

  it("splits taxes with largest remainder (Annex III band 3, 40.000 revenue)", () => {
    // DAS 3.988,80 = 398.880 centavos; ISS 32,5% = 129.636,0; CPP 43,4% = 173.113,92 -> 173.114
    const r = calculateDas({ annex: "III", rbt12: R(500_000), revenue: R(40_000) });
    expect(r.taxes.ISS).toBe(129_636);
    expect(r.taxes.CPP).toBe(173_114);
    expect(r.taxes.IRPJ).toBe(15_955);
    expect(r.taxes.CSLL).toBe(13_961);
    expect(r.taxes.COFINS).toBe(54_407);
    expect(r.taxes.PIS).toBe(11_807);
  });

  it("caps ISS at 5% of revenue and moves the excess to federal taxes (art. 18 par. 1-B, I)", () => {
    // Annex III, RBT12 3.600.000: effective 17,51%, ISS would be 33,5% x 17,51% = 5,866% > 5%.
    const r = calculateDas({ annex: "III", rbt12: R(3_600_000), revenue: R(300_000) });
    expect(r.total).toBe(R(52_530));
    expect(r.taxes).toEqual({
      IRPJ: 225_745,
      CSLL: 197_526,
      COFINS: 723_511,
      PIS: 156_892,
      CPP: 2_449_326,
      ISS: R(15_000),
    });
  });

  it("does not cap ISS below 5% (Annex III band 5, 14,718% x 33,5% = 4,93%)", () => {
    const r = calculateDas({ annex: "III", rbt12: R(2_000_000), revenue: R(150_000) });
    // 220.770,00 x 33,5% = 739.579,5 centavos: tie broken by table order (CSLL, then CPP, get the extra centavos)
    expect(r.taxes.ISS).toBe(739_579);
  });
});

describe("RBT12 for young companies (CGSN 140/2018 art. 16)", () => {
  it("opening month: current month x 12", () => {
    expect(annualize([], R(10_000))).toBe(R(120_000));
    expect(
      calculateDas({ annex: "I", rbt12: annualize([], R(10_000)), revenue: R(10_000) }).total,
    ).toBe(R(400));
  });
  it("1 to 11 prior months: mean x 12", () => {
    expect(annualize([R(10_000), R(20_000), R(30_000)], 0)).toBe(R(240_000));
    expect(annualize([100, 100, 101], 0)).toBe(1_204); // 301 x 12 / 3
  });
  it("12 or more prior months: sum of the last 12", () => {
    const months = [R(999_999), ...Array.from({ length: 12 }, (_, i) => R(1_000 * (i + 1)))];
    expect(annualize(months, 0)).toBe(R(78_000));
  });
});

describe("fator R (LC 123/2006 art. 18 par. 5-J and 5-M)", () => {
  it("28% exactly goes to Annex III", () => {
    expect(annexByFatorR(R(280_000), R(1_000_000))).toBe("III");
  });
  it("just below 28% goes to Annex V", () => {
    expect(annexByFatorR(R(280_000) - 1, R(1_000_000))).toBe("V");
  });
  it("calculateDas resolves the annex from payroll", () => {
    const iii = calculateDas({
      annex: "FATOR_R",
      rbt12: R(300_000),
      revenue: R(20_000),
      payroll12: R(90_000),
    });
    expect(iii.annex).toBe("III");
    expect(iii.effectiveRate).toBe(effectiveRate("III", R(300_000)));
    const v = calculateDas({
      annex: "FATOR_R",
      rbt12: R(300_000),
      revenue: R(20_000),
      payroll12: R(50_000),
    });
    expect(v.annex).toBe("V");
    expect(v.total).toBe(R(3_300));
  });
});

describe("exact DAS fraction (CGSN 140/2018 art. 21; Manual PGDAS-D sec. 12: all decimals)", () => {
  it("does not truncate the effective rate before multiplying by the revenue", () => {
    // Annex I, RBT12 180.001,38, revenue 123.456,78: rate = 4,000055...%; truncated to 4 decimals
    // (4,0000%) gave 4.938,27; the exact fraction gives 4.938,30.
    const r = calculateDas({ annex: "I", rbt12: 18_000_138, revenue: 12_345_678 });
    expect(r.total).toBe(493_830);
    expect(Object.values(r.taxes).reduce((a, b) => a + b, 0)).toBe(493_830);
  });
});

describe("RBT12 above R$ 3,6 mi (CGSN 140/2018 art. 21, III, b; Manual sec. 12, ex. 8)", () => {
  const base = { annex: "III", rbt12: R(4_500_000), revenue: R(600_000) } as const;

  it("requires the explicit sublimit state", () => {
    expect(() => calculateDas(base)).toThrow(/icmsIssBarred/);
  });

  it("not barred: federal by the 6th band, ISS by the 5th band formula, capped at 5%", () => {
    // Official example (P1 = 600.000): 600.000 x 24,69968% = 148.198,08.
    const r = calculateDas({ ...base, icmsIssBarred: false });
    expect(r.total).toBe(14_819_808);
    // The manual rounds each percentage to 5 decimals for teaching (federal taxes differ by up to
    // R$ 0,21); the PGDAS-D uses all decimals, so the split below is the exact fraction.
    expect(r.taxes).toEqual({
      IRPJ: 3_945_688,
      CSLL: 1_708_727,
      COFINS: 1_916_147,
      PIS: 414_835,
      CPP: 3_834_411,
      ISS: R(30_000),
    });
  });

  it("barred: only the federal taxes of the 6th band (18,60% x 600.000 = 111.600,00)", () => {
    const r = calculateDas({ ...base, icmsIssBarred: true });
    expect(r.total).toBe(R(111_600));
    expect(r.taxes.ISS).toBeUndefined();
    expect(Object.values(r.taxes).reduce((a, b) => a + b, 0)).toBe(R(111_600));
  });

  it("Annex I not barred adds the 5th band ICMS share (33,5% x 9,935%)", () => {
    // Annex I 6th band, RBT12 4.000.000: 9,55% federal + ICMS from the 5th band:
    // (4.000.000 x 14,3% - 87.300) / 4.000.000 = 12,1175% x 33,5% = 4,05936...%
    const open = calculateDas({
      annex: "I",
      rbt12: R(4_000_000),
      revenue: R(100_000),
      icmsIssBarred: false,
    });
    const barred = calculateDas({
      annex: "I",
      rbt12: R(4_000_000),
      revenue: R(100_000),
      icmsIssBarred: true,
    });
    expect(barred.total).toBe(R(9_550));
    expect(open.taxes.ICMS).toBe(405_936); // 100.000 x 12,1175% x 33,5% = 4.059,36
    expect(open.total).toBe(R(9_550) + 405_936);
  });

  it("barred below R$ 3,6 mi leaves ICMS/ISS out and keeps the federal values", () => {
    const full = calculateDas({ annex: "I", rbt12: R(300_000), revenue: R(25_000) });
    const barred = calculateDas({
      annex: "I",
      rbt12: R(300_000),
      revenue: R(25_000),
      icmsIssBarred: true,
    });
    expect(barred.taxes.ICMS).toBeUndefined();
    expect(barred.taxes.CPP).toBe(full.taxes.CPP);
    expect(barred.total).toBe(full.total - (full.taxes.ICMS as number));
  });
});

describe("zero denominators (Manual PGDAS-D sec. 8.2 / 8.1)", () => {
  it("FS12 = 0 and RBT12 = 0 gives Annex V (fator r 0,01)", () => {
    expect(annexByFatorR(0, 0)).toBe("V");
  });
  it("FS12 = 0 and RBT12 > 0 gives Annex V", () => {
    expect(annexByFatorR(0, R(100_000))).toBe("V");
  });
  it("FS12 > 0 and RBT12 = 0 gives Annex III (fator r 0,28)", () => {
    expect(annexByFatorR(1, 0)).toBe("III");
  });
  it("rejects negative or non integer payroll and RBT12", () => {
    expect(() => annexByFatorR(-1, R(1_000))).toThrow();
    expect(() => annexByFatorR(1.5, R(1_000))).toThrow();
    expect(() => annexByFatorR(1, -1)).toThrow();
    expect(() => annexByFatorR(1, 0.5)).toThrow();
  });
  it("fator r is truncated to 2 decimals: 0,2774 is Annex V", () => {
    expect(annexByFatorR(R(277_400), R(1_000_000))).toBe("V");
  });
  it("effective rate with RBT12 = 0 uses R$ 1,00 (band 1, 4% Annex I)", () => {
    expect(effectiveRate("I", 0)).toBe(40_000);
    expect(calculateDas({ annex: "I", rbt12: 0, revenue: R(1_000) }).total).toBe(R(40));
    expect(
      calculateDas({ annex: "FATOR_R", rbt12: 0, revenue: R(1_000), payroll12: 1 }).annex,
    ).toBe("III");
  });
});

describe("limits and table integrity", () => {
  it("rejects RBT12 above the R$ 4.8M ceiling", () => {
    expect(() => effectiveRate("I", R(4_800_000) + 1)).toThrow();
  });
  it("band boundary is inclusive", () => {
    expect(effectiveRate("I", R(180_000))).toBe(40_000);
  });
  it("every table row shares sum to 100%", () => {
    for (const bands of Object.values(ANNEX_TABLES)) {
      for (const b of bands) {
        expect(Object.values(b.shares).reduce((a, c) => a + (c ?? 0), 0)).toBe(10_000);
      }
    }
  });
});
