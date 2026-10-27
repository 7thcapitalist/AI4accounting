import { clients, competencias, firms, PHASES, type Phase, type Store } from "@ai4a/db";
import { Coordinator, type MonthOutcome } from "./coordinator";
import { prng } from "./prng";
import { simApprover, stubAgents } from "./stubs";
import type { Agent, Approver } from "./types";

export interface SimMonthOptions {
  month?: string;
  nClients?: number;
  /** Pause (ms) before each agent works, so a board watching the store sees the month progress. */
  delayMs?: number;
  /** Who approves; defaults to the simulated accountant. Pass `accountantApprover` to wait for the web queue. */
  approver?: Approver;
  /** Run all clients at once, so several can wait for the accountant together. */
  parallel?: boolean;
}

export interface SimMonthResult {
  outcomes: Record<string, MonthOutcome>;
}

/** Runs a simulated month for a few synthetic clients with stub agents. No real data. */
export async function runSimMonth(
  store: Store,
  seed: number,
  {
    month = "2026-09",
    nClients = 3,
    delayMs = 0,
    approver = simApprover,
    parallel = false,
  }: SimMonthOptions = {},
): Promise<SimMonthResult> {
  const rand = prng(seed ^ 0x9e3779b9);
  await store.db.insert(firms).values({ id: "firm-sim", name: "Escritorio Simulado" });
  const regimes = ["simples", "presumido"];
  let tick = 0;
  const outcomes: Record<string, MonthOutcome> = {};
  const coord = new Coordinator({
    store,
    agents: withDelay(stubAgents(seed), delayMs),
    approver,
    now: () => ++tick,
  });
  for (let i = 1; i <= nClients; i++) {
    const clientId = `client-${i}`;
    const cid = `comp-${i}-${month}`;
    const regime = regimes[Math.floor(rand() * regimes.length)] ?? "simples";
    await store.db.insert(clients).values({
      id: clientId,
      firmId: "firm-sim",
      name: `Cliente Simulado ${i}`,
      cnpj: `SIM${String(i).padStart(11, "0")}`,
      regime,
    });
    await store.db.insert(competencias).values({ id: cid, clientId, month });
    // Synthetic RBT12 (12-month gross revenue, centavos) so the board can show ceiling usage.
    await store.appendEvent({
      at: ++tick,
      competenciaId: cid,
      kind: "regime.snapshot",
      payload: {
        rbt12Cents: Math.round(
          (0.1 + rand() * 0.95) * (regime === "simples" ? 480_000_000 : 7_800_000_000),
        ),
      },
    });
  }
  // Every client is on the board from the start; the phases then fill in one client at a time.
  const cids = Array.from({ length: nClients }, (_, i) => `comp-${i + 1}-${month}`);
  if (parallel) {
    const done = await Promise.all(cids.map((cid) => coord.runCompetencia(cid)));
    cids.forEach((cid, i) => {
      outcomes[cid] = done[i] as MonthOutcome;
    });
  } else {
    for (const cid of cids) outcomes[cid] = await coord.runCompetencia(cid);
  }
  return { outcomes };
}

function withDelay(agents: Record<Phase, Agent>, delayMs: number): Record<Phase, Agent> {
  if (delayMs <= 0) return agents;
  const out = {} as Record<Phase, Agent>;
  for (const phase of PHASES) {
    const a = agents[phase];
    out[phase] = {
      name: a.name,
      async run(task) {
        await new Promise((r) => setTimeout(r, delayMs));
        return a.run(task);
      },
    };
  }
  return out;
}
