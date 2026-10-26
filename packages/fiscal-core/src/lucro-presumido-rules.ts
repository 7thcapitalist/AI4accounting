/**
 * Versioned, dated constants for the Lucro Presumido engine. Rates are in basis points
 * (1 bp = 0.01%), so 8% = 800. Nothing here is guessed: each field cites its source.
 * When a law changes, add a new entry to LUCRO_PRESUMIDO_RULES with a later `effectiveFrom`;
 * never edit a past entry (past competencias must keep recomputing to the same value).
 */

export type PresumidoActivity =
  /** Venda de mercadorias, industria, e demais atividades do art. 15 caput. */
  | "comercio_industria"
  /** Revenda, para consumo, de combustiveis derivados de petroleo, alcool e gas natural. */
  | "revenda_combustiveis"
  | "transporte_cargas"
  | "transporte_passageiros"
  /** Servicos em geral, incluindo consultas de profissionais, intermediacao, locacao/administracao. */
  | "servicos_geral"
  /**
   * Servicos hospitalares and the clinics/ambulatorios that meet the Anvisa requirements
   * (Lei 9.249/1995 art. 15 par. 1 III "a", as amended by Lei 11.727/2008). The caller must
   * only use this when the company qualifies; otherwise use "servicos_geral".
   */
  | "servicos_hospitalares";

export interface PresumidoRules {
  /** First competencia (YYYY-MM) this version applies to. */
  effectiveFrom: string;
  /** Presumption % of gross revenue to get the IRPJ base. Lei 9.249/1995 art. 15. */
  irpjPresumptionBp: Record<PresumidoActivity, number>;
  /** Presumption % to get the CSLL base. Lei 9.249/1995 art. 20 (12%; 32% for art. 15 par. 1 III services). */
  csllPresumptionBp: Record<PresumidoActivity, number>;
  /** IRPJ rate on the quarterly base. Lei 9.249/1995 art. 3. */
  irpjRateBp: number;
  /** Additional IRPJ rate on the base above the threshold. Lei 9.249/1995 art. 3 par. 1. */
  irpjAdditionalRateBp: number;
  /** Additional IRPJ threshold per quarter: R$ 20.000 x 3 months. Lei 9.249/1995 art. 3 par. 1; Lei 9.430/1996 art. 1. */
  irpjAdditionalQuarterlyThreshold: number;
  /** CSLL rate. Lei 7.689/1988 art. 3 I (general companies). */
  csllRateBp: number;
  /** PIS cumulative. Lei 9.718/1998 art. 8 I; Lei 10.637/2002 art. 8 II keeps it cumulative. */
  pisRateBp: number;
  /** COFINS cumulative. Lei 9.718/1998 art. 8; Lei 10.833/2003 art. 10 II keeps it cumulative. */
  cofinsRateBp: number;
  /** IRRF on services between companies. Decreto 9.580/2018 (RIR/2018) arts. 714 ff. */
  irrfServiceRateBp: number;
  /** CSRF (CSLL 1% + COFINS 3% + PIS 0,65% = 4,65%). Lei 10.833/2003 art. 30. */
  csrfRatesBp: { csll: number; cofins: number; pis: number };
  /** Municipal ISS must be within this range. LC 116/2003 art. 8-A (min 2%) and art. 8 II (max 5%). */
  issRateRangeBp: { min: number; max: number };
}

export const LUCRO_PRESUMIDO_RULES: readonly PresumidoRules[] = [
  {
    effectiveFrom: "2009-01",
    irpjPresumptionBp: {
      comercio_industria: 800,
      revenda_combustiveis: 160,
      transporte_cargas: 800,
      transporte_passageiros: 1600,
      servicos_geral: 3200,
      servicos_hospitalares: 800,
    },
    csllPresumptionBp: {
      comercio_industria: 1200,
      revenda_combustiveis: 1200,
      transporte_cargas: 1200,
      transporte_passageiros: 1200,
      servicos_geral: 3200,
      servicos_hospitalares: 1200,
    },
    irpjRateBp: 1500,
    irpjAdditionalRateBp: 1000,
    irpjAdditionalQuarterlyThreshold: 6_000_000, // centavos: R$ 60.000,00
    csllRateBp: 900,
    pisRateBp: 65,
    cofinsRateBp: 300,
    irrfServiceRateBp: 150,
    csrfRatesBp: { csll: 100, cofins: 300, pis: 65 },
    issRateRangeBp: { min: 200, max: 500 },
  },
];

/** Returns the rule version in force for a competencia (YYYY-MM). */
export function presumidoRulesFor(competencia: string): PresumidoRules {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    throw new Error(`Invalid competencia: "${competencia}"`);
  }
  const hit = LUCRO_PRESUMIDO_RULES.filter((r) => r.effectiveFrom <= competencia).at(-1);
  if (!hit) throw new Error(`No Lucro Presumido rules for competencia ${competencia}`);
  return hit;
}
