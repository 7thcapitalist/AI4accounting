// pnpm eval [--seed 7] [--rate 0.2] [--json] [--out report.json] [--min-recall 0.9]
// Scores the agents' pipeline over an error-injected portfolio. Exits 1 when recall of a type the
// pipeline covers falls under --min-recall (default 0.9, ADR 0006).
import { writeFileSync } from "node:fs";
import { evaluate, formatReport, generatePortfolio, injectErrors } from "@ai4a/simulator";
import { reconciliationPipeline } from "./reconciliation";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const seed = Number(arg("seed") ?? "1");
const rate = arg("rate") === undefined ? undefined : Number(arg("rate"));
const minRecall = Number(arg("min-recall") ?? "0.9");
const COVERED = ["missing_invoice", "bank_without_document"];

const injected = injectErrors(generatePortfolio(seed), { rate });
const report = await evaluate(injected, reconciliationPipeline);
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
