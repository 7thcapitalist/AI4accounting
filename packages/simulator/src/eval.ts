import type { Centavos } from "@ai4a/fiscal-core";
import {
  type AnswerKeyEntry,
  ERROR_TYPES,
  type ErrorType,
  type InjectedMonth,
  type InjectedPortfolio,
} from "./inject";
import type { Company, Expected } from "./month";

/** What a pipeline reports about one company-month. */
export interface PipelineFinding {
  type: ErrorType;
  /** Same `ref` convention as the answer key. */
  ref: string;
}
export interface PipelineResult {
  findings: PipelineFinding[];
  /** Tax of the month the pipeline computed (DAS, or PIS+COFINS+ISS for Presumido), centavos. */
  tax?: Centavos;
}
export type Pipeline = (input: {
  company: Pick<Company, "id" | "cnpj" | "name"> & { regime: "simples" | "presumido" };
  month: Omit<InjectedMonth, "expected">;
}) => PipelineResult | Promise<PipelineResult>;

export interface TypeScore {
  type: ErrorType;
  tp: number;
  fp: number;
  fn: number;
  /** null when the pipeline reported nothing of this type (0/0). */
  precision: number | null;
  /** null when no error of this type was planted. */
  recall: number | null;
}
export interface EvalReport {
  seed: number;
  months: number;
  planted: number;
  byType: TypeScore[];
  tax: { exact: number; total: number; rate: number | null };
  /** Same score restricted to company-months with no planted error. */
  cleanTax: { exact: number; total: number; rate: number | null };
}

/** Tax of the month the engines expect, centavos: DAS total, or PIS+COFINS+ISS for Presumido. */
export function expectedMonthlyTax(e: Expected): Centavos | undefined {
  if (e.das) return e.das.total;
  const m = e.presumidoMes;
  return m ? m.pis.aPagar + m.cofins.aPagar + m.iss.aPagar : undefined;
}

const keyOf = (companyId: string, competencia: string, type: ErrorType, ref: string) =>
  `${companyId}|${competencia}|${type}|${ref}`;
const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

export async function evaluate(
  portfolio: InjectedPortfolio,
  pipeline: Pipeline,
): Promise<EvalReport> {
  const planted = new Set(
    portfolio.answerKey.map((a: AnswerKeyEntry) =>
      keyOf(a.companyId, a.competencia, a.type, a.ref),
    ),
  );
  const reported = new Set<string>();
  let exact = 0;
  let total = 0;
  let cleanExact = 0;
  let cleanTotal = 0;
  let months = 0;
  const dirty = new Set(portfolio.answerKey.map((a) => `${a.companyId}|${a.competencia}`));
  for (const { company, months: ms } of portfolio.companies) {
    for (const { expected, ...month } of ms) {
      months++;
      const result = await pipeline({
        company: {
          id: company.id,
          cnpj: company.cnpj,
          name: company.name,
          regime: company.profile.regime,
        },
        month,
      });
      for (const f of result.findings)
        reported.add(keyOf(company.id, month.competencia, f.type, f.ref));
      total++;
      const isExact = result.tax !== undefined && result.tax === expectedMonthlyTax(expected);
      if (isExact) exact++;
      if (!dirty.has(`${company.id}|${month.competencia}`)) {
        cleanTotal++;
        if (isExact) cleanExact++;
      }
    }
  }
  const byType = ERROR_TYPES.map((type): TypeScore => {
    const inType = (k: string) => k.split("|")[2] === type;
    const p = [...planted].filter(inType);
    const r = [...reported].filter(inType);
    const tp = r.filter((k) => planted.has(k)).length;
    return {
      type,
      tp,
      fp: r.length - tp,
      fn: p.length - tp,
      precision: ratio(tp, r.length),
      recall: ratio(tp, p.length),
    };
  });
  return {
    seed: portfolio.seed,
    months,
    planted: planted.size,
    byType,
    tax: { exact, total, rate: ratio(exact, total) },
    cleanTax: { exact: cleanExact, total: cleanTotal, rate: ratio(cleanExact, cleanTotal) },
  };
}

/** Stub: reports nothing and computes no tax. The floor every real pipeline must beat. */
export const stubPipeline: Pipeline = () => ({ findings: [] });

const pct = (x: number | null) => (x === null ? "   n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);

export function formatReport(r: EvalReport): string {
  const rows = r.byType.map(
    (s) =>
      `${s.type.padEnd(24)} ${String(s.tp).padStart(4)} ${String(s.fp).padStart(4)} ${String(s.fn).padStart(4)} ${pct(s.precision)} ${pct(s.recall)}`,
  );
  return [
    `seed ${r.seed}: ${r.months} company-months, ${r.planted} planted errors`,
    `${"error type".padEnd(24)}   tp   fp   fn   prec.  recall`,
    ...rows,
    `tax exact to the centavo: ${r.tax.exact}/${r.tax.total} (${pct(r.tax.rate).trim()})`,
    `  in clean company-months:  ${r.cleanTax.exact}/${r.cleanTax.total} (${pct(r.cleanTax.rate).trim()})`,
  ].join("\n");
}
