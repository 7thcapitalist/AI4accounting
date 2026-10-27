import { clients, competencias, firms, type Store } from "@ai4a/db";
import { Coordinator, type MonthOutcome } from "./coordinator";
import { prng } from "./prng";
import { simApprover, stubAgents } from "./stubs";

export interface SimMonthResult {
  outcomes: Record<string, MonthOutcome>;
}

/** Runs a simulated month for a few synthetic clients with stub agents. No real data. */
export async function runSimMonth(
  store: Store,
  seed: number,
  month = "2026-09",
  nClients = 3,
): Promise<SimMonthResult> {
  const rand = prng(seed ^ 0x9e3779b9);
  await store.db.insert(firms).values({ id: "firm-sim", name: "Escritorio Simulado" });
  const regimes = ["simples", "presumido"];
  let tick = 0;
  const outcomes: Record<string, MonthOutcome> = {};
  const coord = new Coordinator({
    store,
    agents: stubAgents(seed),
    approver: simApprover,
    now: () => ++tick,
  });
  for (let i = 1; i <= nClients; i++) {
    const clientId = `client-${i}`;
    const cid = `comp-${i}-${month}`;
    await store.db.insert(clients).values({
      id: clientId,
      firmId: "firm-sim",
      name: `Cliente Simulado ${i}`,
      cnpj: `SIM${String(i).padStart(11, "0")}`,
      regime: regimes[Math.floor(rand() * regimes.length)] ?? "simples",
    });
    await store.db.insert(competencias).values({ id: cid, clientId, month });
    outcomes[cid] = await coord.runCompetencia(cid);
  }
  return { outcomes };
}
