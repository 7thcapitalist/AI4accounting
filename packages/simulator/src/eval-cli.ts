// pnpm eval [--seed 7] [--rate 0.2] [--json] [--out report.json]
// Runs the stub pipeline over an error-injected portfolio and prints precision/recall per error type
// and tax exactness. --json prints only the JSON report (for the board). Swap `stubPipeline` for a
// real one when the agents exist (phase 3).
import { writeFileSync } from "node:fs";
import { evaluate, formatReport, stubPipeline } from "./eval";
import { injectErrors } from "./inject";
import { generatePortfolio } from "./portfolio";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const seed = Number(arg("seed") ?? "1");
const rate = arg("rate") === undefined ? undefined : Number(arg("rate"));

const injected = injectErrors(generatePortfolio(seed), { rate });
const report = await evaluate(injected, stubPipeline);
const json = `${JSON.stringify({ ...report, answerKey: injected.answerKey }, null, 2)}\n`;
const out = arg("out");
if (out) writeFileSync(out, json);
console.log(process.argv.includes("--json") ? json : formatReport(report));
