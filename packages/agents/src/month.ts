import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clients, competencias, firms, PHASES, type Phase, type Store } from "@ai4a/db";
import { generatePortfolio } from "@ai4a/simulator";
import { CaptureAgent, type CaptureProvider, SimulatorProvider } from "./capture";
import { CheckAgent, type LlmProvider } from "./check";
import { Coordinator, type MonthOutcome } from "./coordinator";
import { prng } from "./prng";
import { simApprover, stubAgents } from "./stubs";
import type { Agent } from "./types";

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
  /** Explains Check findings in pt-BR; omit to skip explanations. */
  llm?: LlmProvider;
  /** Pause (ms) before each agent works, so a board watching the store sees the month progress. */
  delayMs?: number;
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
  const { month = "2026-09", nClients = 3, delayMs = 0 } = opts;
  const rand = prng(seed ^ 0x9e3779b9);
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), "ai4a-capture-"));
  const agents = stubAgents(seed);
  agents.captura = new CaptureAgent({
    store,
    provider: opts.provider ?? new SimulatorProvider(seed),
    dataDir,
  });
  agents.conferencia = new CheckAgent({ store, llm: opts.llm });
  await store.db.insert(firms).values({ id: "firm-sim", name: "Escritorio Simulado" });
  let tick = 0;
  const outcomes: Record<string, MonthOutcome> = {};
  const coord = new Coordinator({
    store,
    agents: withDelay(agents, delayMs),
    approver: simApprover,
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
  for (let i = 1; i <= picked.length; i++) {
    const cid = `comp-${i}-${month}`;
    outcomes[cid] = await coord.runCompetencia(cid);
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
