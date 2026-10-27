import type { Pipeline } from "@ai4a/simulator";
import { toLedgerCsv, toOfx } from "@ai4a/simulator";
import { parseDocFact, parseLedgerCsv, parseOfx } from "./parse";
import { reconcile } from "./reconcile";

/**
 * `pnpm eval` pipeline: runs the same parsers and rules as the agent over the injected month
 * (files rendered exactly like the SimulatorProvider serves them). Reports the types it detects.
 */
export const reconciliationPipeline: Pipeline = ({ company, month }) => {
  // toOfx/toLedgerCsv only read competencia, bank and ledger.
  const sim = { ...month, expected: {} } as unknown as Parameters<typeof toOfx>[1];
  const facts = month.documents.flatMap((d) => {
    const f = parseDocFact(d.kind, d.xml, company.cnpj);
    return f ? [f] : [];
  });
  const found = reconcile({
    documents: facts,
    ledger: parseLedgerCsv(toLedgerCsv(sim)),
    bank: parseOfx(toOfx(company as unknown as Parameters<typeof toOfx>[0], sim)),
  });
  return {
    findings: found.flatMap((f) =>
      f.type === "amount_mismatch" ? [] : [{ type: f.type, ref: f.ref }],
    ),
  };
};
