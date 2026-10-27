import {
  apurarMesPresumido,
  calculateDas,
  retencoesServico,
  somarRetencoes,
} from "@ai4a/fiscal-core";
import type { Pipeline } from "@ai4a/simulator";
import { type DocFact, parseDocFact } from "../reconciliation/parse";
import type { TaxContextProvider } from "./context";

/**
 * `pnpm eval` pipeline of the Tax agent, with the same engines and the same revenue rule as
 * `TaxAgent` (no LLM, no DB): revenue = issued, non-cancelled invoices of the client, each chave
 * once. `tax` is the DAS (Simples) or PIS+COFINS+ISS (Presumido) over that revenue.
 * A `wrong_revenue` finding is raised when the declared revenue disagrees with the documents by more
 * than what other findings already explain (cancelled sales, ledger sales without a document), so the
 * same gap is not reported twice.
 */
export function taxPipeline(context: TaxContextProvider): Pipeline {
  return async ({ company, month }) => {
    const seen = new Set<string>();
    const sales: DocFact[] = [];
    // Sales the documents show but the revenue rule leaves out; each is reported by Check or
    // Reconciliation, so it explains a gap against the declared revenue.
    let cancelledValue = 0;
    for (const d of month.documents) {
      const f = parseDocFact(d.kind, d.xml, company.cnpj);
      if (!f || f.role !== "saida" || !f.date.startsWith(month.competencia)) continue;
      const id = `${f.kind}:${f.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (f.cancelled) cancelledValue += f.valor;
      else sales.push(f);
    }
    const revenue = sales.reduce((a, f) => a + f.valor, 0);
    // Ledger revenue with no captured document (missing_invoice).
    const captured = new Set(seen);
    const uncaptured = month.ledger
      .filter(
        (l) =>
          l.account === "receita" &&
          !captured.has(`nfe:${l.ref}`) &&
          !captured.has(`nfse:${l.ref}`),
      )
      .reduce((a, l) => a + l.valor, 0);
    const explained = cancelledValue + uncaptured;
    const ctx = await context.contextFor({
      cnpj: company.cnpj,
      month: month.competencia,
      regime: company.regime,
    });

    let tax: number;
    if (ctx.regime === "simples") {
      tax = calculateDas({
        revenue,
        rbt12: ctx.rbt12,
        annex: ctx.annex,
        payroll12: ctx.payroll12,
        rba: ctx.rbaBefore + revenue,
        rbaa: ctx.rbaa,
      }).total;
    } else {
      const ret = somarRetencoes(
        sales
          .filter((f) => f.retained > 0)
          .map((f) => retencoesServico(f.valor, month.competencia)),
      );
      const mes = apurarMesPresumido({
        competencia: month.competencia,
        receitas: [{ activity: ctx.activity, receitaBruta: revenue }],
        retencoes: { irrf: 0, csll: 0, pis: ret.pis, cofins: ret.cofins },
        issRateBp: ctx.issRateBp,
      });
      tax = mes.pis.aPagar + mes.cofins.aPagar + mes.iss.aPagar;
    }
    return {
      findings:
        month.declaredRevenue - revenue !== explained
          ? [{ type: "wrong_revenue", ref: month.competencia }]
          : [],
      tax,
    };
  };
}
