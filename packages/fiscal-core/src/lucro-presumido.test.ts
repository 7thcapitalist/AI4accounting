import { describe, expect, it } from "vitest";
import {
  apurarMesPresumido,
  apurarTrimestrePresumido,
  presumidoRulesFor,
  retencoesServico,
  somarRetencoes,
} from "./lucro-presumido";

// All amounts in centavos. Expected values were computed by hand from the cited rates.
const R = (reais: number) => reais * 100;

describe("rules versioning", () => {
  it("returns the rule set in force and rejects dates before it", () => {
    expect(presumidoRulesFor("2026-10").irpjRateBp).toBe(1500);
    expect(() => presumidoRulesFor("2008-12")).toThrow();
    expect(() => presumidoRulesFor("2026-13")).toThrow();
  });
});

describe("quarterly IRPJ and CSLL", () => {
  it("commerce, R$ 1.000.000: base 8% / 12%, with the 10% additional", () => {
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-03",
      receitas: [{ activity: "comercio_industria", receitaBruta: R(1_000_000) }],
    });
    expect(q.baseIrpj).toBe(R(80_000));
    expect(q.irpjNormal).toBe(R(12_000));
    expect(q.irpjAdicional).toBe(R(2_000)); // 10% x (80.000 - 60.000)
    expect(q.irpj.aPagar).toBe(R(14_000));
    expect(q.baseCsll).toBe(R(120_000));
    expect(q.csll.aPagar).toBe(R(10_800));
  });

  it("commerce under the threshold has no additional", () => {
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-06",
      receitas: [{ activity: "comercio_industria", receitaBruta: R(750_000) }], // base exactly 60.000
    });
    expect(q.baseIrpj).toBe(R(60_000));
    expect(q.irpjAdicional).toBe(0);
    expect(q.irpj.aPagar).toBe(R(9_000));
  });

  it("general services, R$ 600.000: base 32% for both", () => {
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-09",
      receitas: [{ activity: "servicos_geral", receitaBruta: R(600_000) }],
    });
    expect(q.baseIrpj).toBe(R(192_000));
    expect(q.irpjNormal).toBe(R(28_800));
    expect(q.irpjAdicional).toBe(R(13_200)); // 10% x 132.000
    expect(q.csll.aPagar).toBe(R(17_280));
  });

  it("medical clinic (hospitalar), R$ 600.000: IRPJ base 8%, CSLL base 12%", () => {
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-12",
      receitas: [{ activity: "servicos_hospitalares", receitaBruta: R(600_000) }],
    });
    expect(q.baseIrpj).toBe(R(48_000));
    expect(q.irpj.aPagar).toBe(R(7_200));
    expect(q.baseCsll).toBe(R(72_000));
    expect(q.csll.aPagar).toBe(R(6_480));
  });

  it("mixed activities and financial income at 100%", () => {
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-03",
      receitas: [
        { activity: "comercio_industria", receitaBruta: R(100_000) },
        { activity: "servicos_geral", receitaBruta: R(50_000) },
        { activity: "revenda_combustiveis", receitaBruta: R(100_000) },
      ],
      outrasReceitas: R(1_000),
    });
    // 8.000 + 16.000 + 1.600 + 1.000
    expect(q.baseIrpj).toBe(R(26_600));
    // 12.000 + 16.000 + 12.000 + 1.000
    expect(q.baseCsll).toBe(R(41_000));
    expect(q.irpj.aPagar).toBe(R(3_990));
    expect(q.csll.aPagar).toBe(R(3_690));
  });

  it("rounds each base to the centavo, half up", () => {
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-03",
      receitas: [
        { activity: "servicos_geral", receitaBruta: 1_234_567 }, // 395061,44 -> 395061
        { activity: "revenda_combustiveis", receitaBruta: 100_050 }, // 1600,8 -> 1601
      ],
    });
    expect(q.baseIrpj).toBe(395_061 + 1_601);
  });

  it("withholdings offset IRPJ and CSLL; the excess stays as credit", () => {
    const ret = somarRetencoes([
      retencoesServico(R(100_000), "2026-01"),
      retencoesServico(R(100_000), "2026-02"),
    ]);
    expect(ret).toEqual({ irrf: R(3_000), csll: R(2_000), pis: R(1_300), cofins: R(6_000) });
    const q = apurarTrimestrePresumido({
      competenciaFim: "2026-03",
      receitas: [{ activity: "servicos_geral", receitaBruta: R(600_000) }],
      retencoes: ret,
    });
    expect(q.irpj).toEqual({
      devido: R(42_000),
      retido: R(3_000),
      aPagar: R(39_000),
      saldoCredor: 0,
    });
    expect(q.csll.aPagar).toBe(R(15_280));

    const small = apurarTrimestrePresumido({
      competenciaFim: "2026-03",
      receitas: [{ activity: "comercio_industria", receitaBruta: R(10_000) }],
      retencoes: { irrf: R(500), csll: 0, pis: 0, cofins: 0 },
    });
    expect(small.irpj).toEqual({ devido: R(120), retido: R(120), aPagar: 0, saldoCredor: R(380) });
  });

  it("rejects a month that does not end a quarter", () => {
    expect(() => apurarTrimestrePresumido({ competenciaFim: "2026-04", receitas: [] })).toThrow();
  });
});

describe("monthly PIS, COFINS and ISS", () => {
  it("commerce: PIS 0,65% and COFINS 3% cumulative", () => {
    const m = apurarMesPresumido({
      competencia: "2026-01",
      receitas: [{ activity: "comercio_industria", receitaBruta: 33_333_333 }],
    });
    expect(m.pis.aPagar).toBe(216_667); // 216.666,66 centavos
    expect(m.cofins.aPagar).toBe(1_000_000); // 999.999,99 centavos
    expect(m.iss.devido).toBe(0);
  });

  it("services: ISS per municipality, CSRF and ISS withheld reduce the guias", () => {
    const m = apurarMesPresumido({
      competencia: "2026-02",
      receitas: [{ activity: "servicos_geral", receitaBruta: R(200_000) }],
      retencoes: retencoesServico(R(100_000), "2026-02"),
      issRateBp: 300,
      issRetido: R(1_000),
    });
    expect(m.pis).toEqual({ devido: R(1_300), retido: R(650), aPagar: R(650), saldoCredor: 0 });
    expect(m.cofins).toEqual({
      devido: R(6_000),
      retido: R(3_000),
      aPagar: R(3_000),
      saldoCredor: 0,
    });
    expect(m.iss).toEqual({ devido: R(6_000), retido: R(1_000), aPagar: R(5_000), saldoCredor: 0 });
  });

  it("ISS applies only to service revenue and its rate is validated", () => {
    const m = apurarMesPresumido({
      competencia: "2026-02",
      receitas: [
        { activity: "comercio_industria", receitaBruta: R(100_000) },
        { activity: "servicos_hospitalares", receitaBruta: R(50_000) },
      ],
      issRateBp: 500,
    });
    expect(m.iss.devido).toBe(R(2_500));
    expect(() =>
      apurarMesPresumido({ competencia: "2026-02", receitas: [], issRateBp: 600 }),
    ).toThrow();
    expect(() =>
      apurarMesPresumido({ competencia: "2026-02", receitas: [], issRateBp: 100 }),
    ).toThrow();
  });

  it("rejects non-integer or negative amounts", () => {
    expect(() =>
      apurarMesPresumido({
        competencia: "2026-02",
        receitas: [{ activity: "servicos_geral", receitaBruta: 10.5 }],
      }),
    ).toThrow();
  });
});
