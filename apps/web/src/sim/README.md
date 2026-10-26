# sim: simulated month-closing engine

Pure, seeded, deterministic simulation used by the agentic board prototype (SOF-436). No UI, no `Date`, no `Math.random`. All clients and documents are fictional. Step 4.1 replaces this module with a real store; the UI should depend only on the contract below.

## Contract

```ts
import { createSim, step, approve, returnToAgent, selectKpis, ... } from "@/sim"; // ./index.ts
```

State is a plain JSON-serializable `SimState`. Every function returns a **new** state (input is never mutated); `approve`/`returnToAgent` return the same reference when the action does not apply.

| Function | Purpose |
| --- | --- |
| `createSim(seed)` | New closing of competence `2026-09`: 12 clients, 7 agents. |
| `step(state)` | One tick. Staggered clients advance Captura → Coleta → Conferencia → Conciliacao → Apuracao → Aprovacao. |
| `approve(state, clientId)` | Accountant approves (only if `awaiting_approval`): open findings resolved, client goes to Entrega. |
| `returnToAgent(state, clientId, agent?)` | Accountant sends it back (default: agent of the oldest open finding, else Conferencia). Rework pass raises no new findings, so it always terminates. |
| `selectKpis(s)` | `closedClients`, `totalClients`, `openExceptions`, `hoursSaved`, `daysToDeadline`, `deadlineLabel`. |
| `selectAccountantQueue(s)` | Clients awaiting approval with their open `Finding`s. |
| `selectAgentStats(s)` | Per agent: `actions`, `findings`, `returned`, `activeClients`. |
| `selectDay(s)` | Simulated day of the month after the competence (`TICKS_PER_DAY` = 6 ticks per day). |
| `selectIsFinished(s)` / `selectNeedsAccountant(s)` | Done / stalled until the accountant acts (stop auto-ticking). |

`state.feed` is an append-only `FeedEvent[]` (`id`, `tick`, `agent`, `clientId`, `phase`, `kind`, `text` in pt-BR). Example: `Conferencia: NFS-e 1234 emitida para convênio sem retenção de IRRF e CSRF, enviada para revisão (Clínica Vida Plena Ltda)`.

`Finding` carries `message`, `reasoning`, `rule` and `source` (legal reference) so the UI can show the agent's reasoning.

## Rules

- Same seed + same sequence of calls = identical state and feed (PRNG: mulberry32, state kept in `state.rng`).
- Money is integer centavos.
- The clinic client (`c12`) always raises the IRRF/CSRF finding at Conferencia; other findings are random (30% per matching template).
- Legal references in `data.ts` (Lei 9.430/1996, LC 123/2006, Resolução CGSN 140/2018, ...) are citations for a **fictional scenario**, not tax advice. A real rules engine belongs in `packages/fiscal-core`.
- PGDAS-D due day 20 of the following month: LC 123/2006, art. 21, III.
