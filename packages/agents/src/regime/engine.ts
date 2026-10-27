import {
  type Annex,
  annexByFatorR,
  apurarMesPresumido,
  apurarTrimestrePresumido,
  type Centavos,
  calculateDas,
  type PresumidoActivity,
  SIMPLES_CEILING,
  SIMPLES_SUBLIMIT,
} from "@ai4a/fiscal-core";

/** Horizon of the crossing projection, in months. */
export const PROJECTION_MONTHS = 12;
/** Months averaged to get the run-rate used in the projection. */
export const RUN_RATE_MONTHS = 3;

export const SRC_CEILING =
  "LC 123/2006 art. 3, par. 9 e 9-A (exclusao por excesso de receita; ate 20% vale no ano seguinte); Resolucao CGSN 140/2018";
export const SRC_SUBLIMIT =
  "LC 123/2006 art. 19 e art. 20, par. 1 e 1-A (excesso de ate 20% do sublimite vale no ano seguinte); Manual PGDAS-D 2018 sec. 8.4";
export const SRC_FATOR_R =
  "LC 123/2006 art. 18, par. 5-J e 5-M; Resolucao CGSN 140/2018 art. 26 (fator R >= 0,28 = Anexo III)";

export function nextMonth(m: string): string {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

export interface MonthAmount {
  /** YYYY-MM. */
  competencia: string;
  amount: Centavos;
}

export interface CrossingProjection {
  /** First projected month whose accumulated value is above the limit; undefined within the horizon. */
  month?: string;
  /** Value already above the limit at the last closed month. */
  alreadyAbove: boolean;
  /** Accumulated value at the end of the horizon (December for the calendar year). */
  atEnd: Centavos;
}

/** Mean of the last `RUN_RATE_MONTHS` months, rounded half up. */
export function runRate(revenue: MonthAmount[]): Centavos {
  const last = revenue.slice(-RUN_RATE_MONTHS);
  if (last.length === 0) return 0;
  const sum = last.reduce((a, m) => a + m.amount, 0);
  return Math.floor((2 * sum + last.length) / (2 * last.length));
}

/**
 * Calendar-year revenue (RBA/RBAA, the legal basis for the Simples exclusion by excess and for the
 * ICMS/ISS sublimit) after each month until December at the run-rate.
 * `ytd` is the revenue from January through `lastClosed` (YYYY-MM).
 */
export function projectRba(ytd: Centavos, lastClosed: string, rate: Centavos, limit: Centavos) {
  if (ytd > limit) return { alreadyAbove: true, atEnd: ytd } as CrossingProjection;
  let month = lastClosed;
  let acc = ytd;
  let crossing: string | undefined;
  while (!month.endsWith("-12")) {
    month = nextMonth(month);
    acc += rate;
    if (acc > limit && !crossing) crossing = month;
  }
  return { month: crossing, alreadyAbove: false, atEnd: acc } as CrossingProjection;
}

export type RbtConsequence = "next_year" | "from_excess_month";

/** Excess of up to 20% over the limit takes effect in the next calendar year; above 20%, right away. */
export function excessConsequence(value: Centavos, limit: Centavos): RbtConsequence {
  return BigInt(value) * 100n > BigInt(limit) * 120n ? "from_excess_month" : "next_year";
}

export interface FatorRResult {
  /** FS12 / RBT12 in percent with 2 decimals truncated, as the PGDAS-D shows it (e.g. 27.74 -> 27.74). */
  ratioPct: number;
  annex: "III" | "V";
  /** Payroll (12 months) that keeps Annex III at this RBT12: ceil(28% x RBT12). */
  payrollNeeded: Centavos;
  /** Extra 12-month payroll needed to reach Annex III (0 when already there). */
  payrollGap: Centavos;
}

export function fatorR(payroll12: Centavos, rbt12: Centavos): FatorRResult {
  const needed = Number((BigInt(rbt12) * 28n + 99n) / 100n);
  const ratioPct = rbt12 === 0 ? 0 : Number((BigInt(payroll12) * 10000n) / BigInt(rbt12)) / 100;
  const annex = annexByFatorR(payroll12, rbt12);
  return {
    ratioPct,
    annex,
    payrollNeeded: needed,
    payrollGap: annex === "III" ? 0 : Math.max(0, needed - payroll12),
  };
}

export interface ComparisonInput {
  /** Annual revenue (the RBT12), centavos; spread evenly over the 12 months and 4 quarters. */
  annualRevenue: Centavos;
  payroll12: Centavos;
  /** Simples annex; "FATOR_R" resolves III or V from the payroll. */
  annex: Annex | "FATOR_R";
  activity: PresumidoActivity;
  /** Municipal ISS rate in bp (services), 0 when none. */
  issRateBp: number;
  /** Any competencia of the year to compare (picks the Presumido rule version). */
  year: number;
  /** ICMS/ISS sublimit in force; defaults to R$ 3,6 mi. */
  sublimit?: Centavos;
}

export interface RegimeCost {
  das?: Centavos;
  pis?: Centavos;
  cofins?: Centavos;
  iss?: Centavos;
  irpj?: Centavos;
  csll?: Centavos;
  total: Centavos;
}

export interface Comparison {
  simples: RegimeCost & { annex: Annex };
  presumido: RegimeCost;
  /** Positive: Simples is cheaper by this amount. */
  simplesAdvantage: Centavos;
}

/**
 * Annual federal+local taxes under each regime for the same revenue, using the same engines the Tax
 * agent uses. Not included: employer social security (CPP) under Presumido, which Annexes I-III/V
 * already carry inside the DAS (LC 123/2006 art. 13, VI and par. 3); the accountant adds it from
 * the payroll. The Simples side takes the whole year at the same RBT12 (steady revenue).
 */
export function compareRegimes(i: ComparisonInput): Comparison {
  if (i.annualRevenue > SIMPLES_CEILING) throw new Error("Revenue above the Simples ceiling");
  const monthly = Math.round(i.annualRevenue / 12);
  const quarterly = Math.round(i.annualRevenue / 4);
  const das = calculateDas({
    revenue: monthly,
    rbt12: i.annualRevenue,
    annex: i.annex,
    payroll12: i.payroll12,
    rbaa: i.annualRevenue,
    ...(i.annualRevenue > (i.sublimit ?? SIMPLES_SUBLIMIT) ? { icmsIssBarred: true } : {}),
  });
  const simplesTotal = das.total * 12;

  const comp = `${i.year}-12`;
  const mes = apurarMesPresumido({
    competencia: comp,
    receitas: [{ activity: i.activity, receitaBruta: monthly }],
    issRateBp: i.issRateBp,
  });
  let irpj = 0;
  let csll = 0;
  for (const q of ["03", "06", "09", "12"]) {
    const t = apurarTrimestrePresumido({
      competenciaFim: `${i.year}-${q}`,
      receitas: [{ activity: i.activity, receitaBruta: quarterly }],
    });
    irpj += t.irpj.aPagar;
    csll += t.csll.aPagar;
  }
  const pis = mes.pis.aPagar * 12;
  const cofins = mes.cofins.aPagar * 12;
  const iss = mes.iss.aPagar * 12;
  const presumidoTotal = pis + cofins + iss + irpj + csll;
  return {
    simples: { annex: das.annex, das: das.total * 12, total: simplesTotal },
    presumido: { pis, cofins, iss, irpj, csll, total: presumidoTotal },
    simplesAdvantage: presumidoTotal - simplesTotal,
  };
}
