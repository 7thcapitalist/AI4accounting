// pnpm eval [--seed 7] [--rate 0.2] [--json] [--out report.json] [--min-recall 0.9]
// Scores the agents' pipeline (Check + Reconciliation) over an error-injected portfolio. Exits 1 when
// recall of a type the pipeline covers falls under --min-recall (default 0.9, ADR 0006). Types owned by
// later agents (e.g. wrong_revenue) read 0% until their steps land.
import { writeFileSync } from "node:fs";
import {
  evaluate,
  formatReport,
  generatePortfolio,
  injectErrors,
  type Pipeline,
} from "@ai4a/simulator";
import { checkPipeline } from "./check";
import { reconciliationPipeline } from "./reconciliation";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const seed = Number(arg("seed") ?? "1");
const rate = arg("rate") === undefined ? undefined : Number(arg("rate"));
const minRecall = Number(arg("min-recall") ?? "0.9");
const COVERED = [
  "wrong_cfop",
  "iss_not_withheld",
  "other_company",
  "duplicate",
  "cancelled",
  "missing_invoice",
  "bank_without_document",
];

/** Both agents look at the same month; their findings are added up. */
const pipeline: Pipeline = async (input) => {
  const [check, reconciliation] = await Promise.all([
    checkPipeline(input),
    reconciliationPipeline(input),
  ]);
  return {
    findings: [...check.findings, ...reconciliation.findings],
    tax: check.tax ?? reconciliation.tax,
  };
};

const injected = injectErrors(generatePortfolio(seed), { rate });
const report = await evaluate(injected, pipeline);
const json = `${JSON.stringify({ ...report, answerKey: injected.answerKey }, null, 2)}\n`;
const out = arg("out");
if (out) writeFileSync(out, json);
console.log(process.argv.includes("--json") ? json : formatReport(report));
const low = report.byType.filter(
  (t) => COVERED.includes(t.type) && t.recall !== null && t.recall < minRecall,
);
if (low.length > 0) {
  console.error(`recall under ${minRecall}: ${low.map((t) => t.type).join(", ")}`);
  process.exit(1);
}
