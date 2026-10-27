import type { Pipeline } from "@ai4a/simulator";
import { runChecks } from "./rules";

/** Check rules as an eval pipeline: only findings with a planted error type are scored. */
export const checkPipeline: Pipeline = ({ company, month }) => ({
  findings: runChecks({
    client: { cnpj: company.cnpj, regime: company.regime },
    month: month.competencia,
    docs: month.documents.map((d) => ({ id: d.file, kind: d.kind, xml: d.xml })),
    bank: month.bank,
  }).flatMap((f) => (f.errorType ? [{ type: f.errorType, ref: f.ref }] : [])),
});
