import { type PresumidoActivity, presumidoRulesFor } from "./lucro-presumido-rules";
import type { Centavos } from "./types";

export * from "./lucro-presumido-rules";

/** centavos x bp / 10000, rounded half up, in BigInt so it never loses precision. */
function mulBp(centavos: Centavos, bp: number): Centavos {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new Error(`Invalid amount in centavos: ${centavos}`);
  }
  return Number((BigInt(centavos) * BigInt(bp) * 2n + 10000n) / 20000n);
}

export interface ActivityRevenue {
  activity: PresumidoActivity;
  /**
   * Gross revenue of the activity, already net of the deductions allowed by Lei 9.718/1998
   * art. 3 par. 2 (returns, unconditional discounts, cancelled sales). Not net of ISS/ICMS.
   */
  receitaBruta: Centavos;
}

/** Taxes withheld by the payer on services billed to companies, in centavos. */
export interface Retencoes {
  irrf: Centavos;
  csll: Centavos;
  pis: Centavos;
  cofins: Centavos;
}

const NO_RETENCOES: Retencoes = { irrf: 0, csll: 0, pis: 0, cofins: 0 };

/**
 * Withholdings on one service invoice billed to a company (the payer withholds):
 * IRRF 1,5% (RIR/2018) and CSRF 4,65% (Lei 10.833/2003 art. 30). Only call it for invoices
 * whose service is in the withholding list and whose payer is obliged to withhold; that
 * judgment belongs to the Check agent, not to this pure function.
 */
export function retencoesServico(valor: Centavos, competencia: string): Retencoes {
  const r = presumidoRulesFor(competencia);
  return {
    irrf: mulBp(valor, r.irrfServiceRateBp),
    csll: mulBp(valor, r.csrfRatesBp.csll),
    cofins: mulBp(valor, r.csrfRatesBp.cofins),
    pis: mulBp(valor, r.csrfRatesBp.pis),
  };
}

function checkedRetencoes(r: Retencoes): Retencoes {
  checked(r.irrf);
  checked(r.csll);
  checked(r.pis);
  checked(r.cofins);
  return r;
}

export function somarRetencoes(list: Retencoes[]): Retencoes {
  return list.map(checkedRetencoes).reduce(
    (a, b) => ({
      irrf: a.irrf + b.irrf,
      csll: a.csll + b.csll,
      pis: a.pis + b.pis,
      cofins: a.cofins + b.cofins,
    }),
    NO_RETENCOES,
  );
}

export interface TributoApurado {
  /** Tax before withholdings. */
  devido: Centavos;
  /** Withholdings applied against it (never more than `devido`). */
  retido: Centavos;
  /** Amount to pay in the guia. */
  aPagar: Centavos;
  /** Withholding that exceeded the tax due; stays as credit for compensation (Lei 10.833/2003 art. 36). */
  saldoCredor: Centavos;
}

function aplicarRetencao(devido: Centavos, retencao: Centavos): TributoApurado {
  const retido = Math.min(devido, retencao);
  return { devido, retido, aPagar: devido - retido, saldoCredor: retencao - retido };
}

export interface MesPresumidoInput {
  /** YYYY-MM. */
  competencia: string;
  receitas: ActivityRevenue[];
  /** PIS/COFINS withheld in the month on invoices issued by the company. */
  retencoes?: Retencoes;
  /** Municipal ISS rate in bp (it is a per-municipality input, LC 116/2003). */
  issRateBp?: number;
  /** ISS already withheld by the payer in the month. */
  issRetido?: Centavos;
}

export interface MesPresumidoResult {
  receitaBruta: Centavos;
  pis: TributoApurado;
  cofins: TributoApurado;
  iss: TributoApurado;
}

const SERVICE_ACTIVITIES: ReadonlySet<PresumidoActivity> = new Set([
  "servicos_geral",
  "servicos_hospitalares",
]);

/**
 * Monthly PIS and COFINS cumulative on gross revenue (Lei 9.718/1998; Lei 10.637/2002 art. 8 II;
 * Lei 10.833/2003 art. 10 II), plus municipal ISS on service revenue (LC 116/2003). ISS is not
 * deducted from the PIS/COFINS or presumption base. PIS/COFINS withheld by clients (CSRF)
 * reduce what is due. The CSLL part of the CSRF belongs to the quarter, not here.
 */
export function apurarMesPresumido(input: MesPresumidoInput): MesPresumidoResult {
  const r = presumidoRulesFor(input.competencia);
  const receitaBruta = input.receitas.reduce((s, x) => s + checked(x.receitaBruta), 0);
  const retencoes = checkedRetencoes(input.retencoes ?? NO_RETENCOES);
  const issRetido = checked(input.issRetido ?? 0);

  const servicos = input.receitas
    .filter((x) => SERVICE_ACTIVITIES.has(x.activity))
    .reduce((s, x) => s + x.receitaBruta, 0);
  const issBp = input.issRateBp ?? 0;
  if (
    !Number.isInteger(issBp) ||
    issBp < 0 ||
    (issBp > 0 && (issBp < r.issRateRangeBp.min || issBp > r.issRateRangeBp.max))
  ) {
    throw new Error(`ISS rate out of range: ${issBp} bp`);
  }

  return {
    receitaBruta,
    pis: aplicarRetencao(mulBp(receitaBruta, r.pisRateBp), retencoes.pis),
    cofins: aplicarRetencao(mulBp(receitaBruta, r.cofinsRateBp), retencoes.cofins),
    iss: aplicarRetencao(mulBp(servicos, issBp), issRetido),
  };
}

function checked(v: Centavos): Centavos {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error(`Invalid amount in centavos: ${v}`);
  return v;
}

export interface TrimestrePresumidoInput {
  /** Last month of the quarter: YYYY-03, YYYY-06, YYYY-09 or YYYY-12. */
  competenciaFim: string;
  /** Revenue of the whole quarter, by activity. */
  receitas: ActivityRevenue[];
  /**
   * Other income that enters the base at 100%: capital gains and financial income
   * (Lei 9.430/1996 art. 25). Outside the presumption.
   */
  outrasReceitas?: Centavos;
  /** IRRF and CSLL withheld during the quarter (PIS/COFINS are settled monthly). */
  retencoes?: Retencoes;
}

export interface TrimestrePresumidoResult {
  baseIrpj: Centavos;
  baseCsll: Centavos;
  irpjNormal: Centavos;
  irpjAdicional: Centavos;
  irpj: TributoApurado;
  csll: TributoApurado;
}

/**
 * Quarterly IRPJ and CSLL under Lucro Presumido (Lei 9.430/1996 arts. 1 and 25; Lei 9.249/1995
 * arts. 3, 15 and 20). Base = sum over activities of revenue x presumption %, plus other income
 * at 100%. IRPJ = 15% of the base + 10% of what exceeds R$ 60.000 in the quarter. IRRF withheld
 * offsets the whole IRPJ; the CSLL withheld (CSRF) offsets CSLL.
 */
export function apurarTrimestrePresumido(input: TrimestrePresumidoInput): TrimestrePresumidoResult {
  if (!/^\d{4}-(03|06|09|12)$/.test(input.competenciaFim)) {
    throw new Error(`Not a quarter-end competencia: "${input.competenciaFim}"`);
  }
  const r = presumidoRulesFor(input.competenciaFim);
  const outras = checked(input.outrasReceitas ?? 0);
  const retencoes = checkedRetencoes(input.retencoes ?? NO_RETENCOES);

  const baseIrpj =
    input.receitas.reduce(
      (s, x) => s + mulBp(checked(x.receitaBruta), r.irpjPresumptionBp[x.activity]),
      0,
    ) + outras;
  const baseCsll =
    input.receitas.reduce((s, x) => s + mulBp(x.receitaBruta, r.csllPresumptionBp[x.activity]), 0) +
    outras;

  const irpjNormal = mulBp(baseIrpj, r.irpjRateBp);
  const irpjAdicional = mulBp(
    Math.max(0, baseIrpj - r.irpjAdditionalQuarterlyThreshold),
    r.irpjAdditionalRateBp,
  );

  return {
    baseIrpj,
    baseCsll,
    irpjNormal,
    irpjAdicional,
    irpj: aplicarRetencao(irpjNormal + irpjAdicional, retencoes.irrf),
    csll: aplicarRetencao(mulBp(baseCsll, r.csllRateBp), retencoes.csll),
  };
}
