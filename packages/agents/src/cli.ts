import { openStore } from "@ai4a/db";
import { accountantApprover } from "./accountant";
import { FolderProvider } from "./capture";
import { runSimMonth } from "./month";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};
const num = (name: string): number | undefined => {
  const v = Number(opt(name));
  return opt(name) !== undefined && Number.isFinite(v) ? v : undefined;
};
const seed = Number(opt("sim"));
if (!Number.isInteger(seed)) {
  console.error(
    "usage: pnpm month:run --sim <seed> [--db <file>] [--folder <dir>] [--data <dir>] [--delay <ms>] [--clients <n>] [--accountant]",
  );
  process.exit(2);
}
const folder = opt("folder");
const store = await openStore(opt("db") ?? ":memory:");
const { outcomes } = await runSimMonth(store, seed, {
  dataDir: opt("data"),
  provider: folder ? new FolderProvider(folder) : undefined,
  delayMs: num("delay"),
  nClients: num("clients"),
  // --accountant: stop at Aprovacao and wait for the decision made in the web queue.
  approver: args.includes("--accountant") ? accountantApprover(store) : undefined,
  parallel: args.includes("--accountant"),
});
const events = await store.listEvents();
const captured = events.filter((e) => e.kind === "document.captured").length;
console.log(`seed ${seed}: ${events.length} events, ${captured} documents captured`);
for (const [cid, o] of Object.entries(outcomes)) console.log(`${cid}: ${o.status}`);
store.close();
