// pnpm demo: seeds 15 simulated clients into a fresh local store while the web board follows it.
// All data is synthetic. `--accountant` makes the month wait for approvals made in the web queue.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = resolve(root, ".data/demo.db");
const accountant = process.argv.includes("--accountant");
mkdirSync(dirname(db), { recursive: true });
for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(db + suffix, { force: true });

const env = {
  ...process.env,
  AI4_DB: db,
  AI4_ACCOUNTANT_TOKEN: process.env.AI4_ACCOUNTANT_TOKEN ?? randomBytes(12).toString("hex"),
};
if (accountant) console.log(`Token do contador (fila): ${env.AI4_ACCOUNTANT_TOKEN}`);

const run = (args) => spawn("pnpm", args, { cwd: root, env, stdio: "inherit" });
const web = run(["--filter", "@ai4a/web", "dev"]);
const month = run([
  "month:run",
  "--sim",
  "2026",
  "--db",
  db,
  "--clients",
  "15",
  "--delay",
  "900",
  "--data",
  resolve(root, ".data/demo-files"),
  "--parallel",
  ...(accountant ? ["--accountant"] : []),
]);
month.on("exit", (code) => {
  console.log(
    code === 0
      ? "Mês simulado concluído: o painel segue aberto em http://localhost:3000 (Ctrl+C para sair)."
      : `month:run saiu com código ${code}`,
  );
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    month.kill();
    web.kill();
    process.exit(0);
  });
}
web.on("exit", () => {
  month.kill();
  process.exit(0);
});
