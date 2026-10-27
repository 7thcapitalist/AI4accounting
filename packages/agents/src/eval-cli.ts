// pnpm eval [--seed 7] [--rate 0.2] [--json] [--out report.json]
// Scores the Check agent rules over an error-injected portfolio (recall/precision per error type).
// Types owned by later agents (missing_invoice, bank_without_document, wrong_revenue) read 0% until
// their steps land; the Check types must stay >= 90% recall (docs/ROADMAP.md, definition of done).
import { writeFileSync } from "node:fs";
import { evaluate, formatReport, generatePortfolio, injectErrors } from "@ai4a/simulator";
import { checkPipeline } from "./check";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const seed = Number(arg("seed") ?? "1");
const rate = arg("rate") === undefined ? undefined : Number(arg("rate"));

const injected = injectErrors(generatePortfolio(seed), { rate });
const report = await evaluate(injected, checkPipeline);
const json = `${JSON.stringify({ ...report, answerKey: injected.answerKey }, null, 2)}\n`;
const out = arg("out");
if (out) writeFileSync(out, json);
console.log(process.argv.includes("--json") ? json : formatReport(report));
