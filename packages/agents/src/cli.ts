import { openStore } from "@ai4a/db";
import { runSimMonth } from "./month";

const args = process.argv.slice(2);
const i = args.indexOf("--sim");
const seed = Number(args[i + 1]);
if (i < 0 || !Number.isInteger(seed)) {
  console.error("usage: pnpm month:run --sim <seed> [--db <file>] [--delay <ms>] [--clients <n>]");
  process.exit(2);
}
const j = args.indexOf("--db");
const store = await openStore(j >= 0 ? (args[j + 1] ?? ":memory:") : ":memory:");
const flag = (name: string): number | undefined => {
  const k = args.indexOf(name);
  const v = k >= 0 ? Number(args[k + 1]) : Number.NaN;
  return Number.isFinite(v) ? v : undefined;
};
const { outcomes } = await runSimMonth(store, seed, {
  delayMs: flag("--delay"),
  nClients: flag("--clients"),
});
const events = await store.listEvents();
console.log(`seed ${seed}: ${events.length} events`);
for (const [cid, o] of Object.entries(outcomes)) console.log(`${cid}: ${o.status}`);
store.close();
