import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clients, competencias, firms, type Store } from "@ai4a/db";
import { generatePortfolio } from "@ai4a/simulator";
import { CaptureAgent, type CaptureProvider, SimulatorProvider } from "./capture";
import { Coordinator, type MonthOutcome } from "./coordinator";
import { simApprover, stubAgents } from "./stubs";

export interface SimMonthResult {
  outcomes: Record<string, MonthOutcome>;
}

export interface SimMonthOptions {
  month?: string;
  nClients?: number;
  /** Where captured files go; defaults to a fresh temp dir. */
  dataDir?: string;
  /** Capture source; defaults to the SimulatorProvider for the seed. */
  provider?: CaptureProvider;
}

/**
 * Runs a simulated month for the first synthetic companies of the seeded portfolio: the Capture
 * agent pulls their documents, the other phases are still stubs. No real data.
 */
export async function runSimMonth(
  store: Store,
  seed: number,
  opts: SimMonthOptions = {},
): Promise<SimMonthResult> {
  const { month = "2026-09", nClients = 3 } = opts;
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), "ai4a-capture-"));
  const agents = stubAgents(seed);
  agents.captura = new CaptureAgent({
    store,
    provider: opts.provider ?? new SimulatorProvider(seed),
    dataDir,
  });
  await store.db.insert(firms).values({ id: "firm-sim", name: "Escritorio Simulado" });
  let tick = 0;
  const outcomes: Record<string, MonthOutcome> = {};
  const coord = new Coordinator({
    store,
    agents,
    approver: simApprover,
    now: () => ++tick,
  });
  const { companies } = generatePortfolio(seed, [month]);
  for (const [n, { company }] of companies.slice(0, nClients).entries()) {
    const i = n + 1;
    const clientId = `client-${i}`;
    const cid = `comp-${i}-${month}`;
    await store.db.insert(clients).values({
      id: clientId,
      firmId: "firm-sim",
      name: company.name,
      cnpj: company.cnpj,
      regime: company.profile.regime,
    });
    await store.db.insert(competencias).values({ id: cid, clientId, month });
    outcomes[cid] = await coord.runCompetencia(cid);
  }
  return { outcomes };
}
