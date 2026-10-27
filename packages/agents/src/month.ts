import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clients, competencias, firms, PHASES, type Phase, type Store } from "@ai4a/db";
import { generatePortfolio } from "@ai4a/simulator";
import { CaptureAgent, type CaptureProvider, SimulatorProvider } from "./capture";
import { type ClientResponder, CollectionAgent, SimulatedClient } from "./collection";
import { Coordinator, type MonthOutcome } from "./coordinator";
import { prng } from "./prng";
import { ReconciliationAgent } from "./reconciliation";
import { simApprover, stubAgents } from "./stubs";
import { SimulatorTaxContext, TaxAgent } from "./tax";
import type { Agent, Approver } from "./types";

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
  /** Plays the client when documents are missing; defaults to a client holding the complete month. */
  responder?: ClientResponder;
  /** Pause (ms) before each agent works, so a board watching the store sees the month progress. */
  delayMs?: number;
  /** Who approves; defaults to the simulated accountant. Pass `accountantApprover` to wait for the web queue. */
  approver?: Approver;
  /** Run all clients at once, so several can wait for the accountant together. */
  parallel?: boolean;
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
  const {
    month = "2026-09",
    nClients = 3,
    delayMs = 0,
    approver = simApprover,
    parallel = false,
  } = opts;
  const rand = prng(seed ^ 0x9e3779b9);
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), "ai4a-capture-"));
  const agents = stubAgents(seed);
  agents.captura = new CaptureAgent({
    store,
    provider: opts.provider ?? new SimulatorProvider(seed),
    dataDir,
  });
  agents.apuracao = new TaxAgent({ store, context: new SimulatorTaxContext(seed) });
  agents.conciliacao = new ReconciliationAgent({ store });
  agents.coleta = new CollectionAgent({
    store,
    responder: opts.responder ?? new SimulatedClient(new SimulatorProvider(seed)),
    dataDir,
  });
  await store.db.insert(firms).values({ id: "firm-sim", name: "Escritorio Simulado" });
  let tick = 0;
  const outcomes: Record<string, MonthOutcome> = {};
  const coord = new Coordinator({
    store,
    agents: withDelay(agents, delayMs),
    approver,
    now: () => ++tick,
  });
  const { companies } = generatePortfolio(seed, [month]);
  const picked = companies.slice(0, nClients);
  for (const [n, { company }] of picked.entries()) {
    const i = n + 1;
    const clientId = `client-${i}`;
    const cid = `comp-${i}-${month}`;
    const regime = company.profile.regime;
    await store.db.insert(clients).values({
      id: clientId,
      firmId: "firm-sim",
      name: company.name,
      cnpj: company.cnpj,
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
  const cids = picked.map((_, n) => `comp-${n + 1}-${month}`);
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
