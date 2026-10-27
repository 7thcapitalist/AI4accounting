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
| `returnToAgent(state, clientId, agent?)` | Accountant sends it back (default: agent of the oldest open finding, else Conferencia; only Captura..Apuracao agents are valid, `Coordenador`/`Entrega` return the same state). Rework pass raises no new findings, so it always terminates. |
| `selectKpis(s)` | `closedClients`, `totalClients`, `openExceptions`, `hoursSaved`, `daysToDeadline` (nearest), `deadlineLabel`, `deadlines` (one per obligation: PGDAS-D / IRPJ/CSLL, via `selectDeadlines`). |
| `selectAccountantQueue(s)` | Clients awaiting approval with their open `Finding`s. |
| `selectAgentStats(s)` | Per agent: `actions`, `findings`, `returned`, `activeClients`. |
| `selectDay(s)` | Simulated day of the month after the competence (`TICKS_PER_DAY` = 6 ticks per day). |
| `selectIsFinished(s)` / `selectNeedsAccountant(s)` | Done / stalled until the accountant acts (stop auto-ticking). |

`state.feed` is an append-only `FeedEvent[]` (`id`, `tick`, `agent`, `clientId`, `phase`, `kind`, `text` in pt-BR). Example: `Conferencia: NFS-e 1234 de serviço médico para operadora privada sem IRRF e sem CSRF retidos (serviço de ambulatório), enviada para revisão (Clínica Vida Plena Ltda)`.

`Finding` carries `message`, `reasoning`, `rule` and `source` (legal reference) so the UI can show the agent's reasoning.

## Rules

- Same seed + same sequence of calls = identical state and feed (PRNG: mulberry32, state kept in `state.rng`).
- Money is integer centavos.
- The clinic client (`c12`) always raises the IRRF/CSRF finding at Conferencia; other findings are random (30% per matching template).
- Legal references in `data.ts` (RIR/2018 art. 714, Lei 10.833/2003 art. 30, LC 123/2006, Resolução CGSN 140/2018, ...) are citations for a **fictional scenario**, not tax advice. A real rules engine belongs in `packages/fiscal-core`.
- PGDAS-D due day 20 of the following month: LC 123/2006, art. 21, III. IRPJ/CSLL trimestral (Lucro Presumido) is due the last business day of the month after the quarter (Lei 9.430/1996, art. 5º): competence 2026-09 closes Q3, so Fri 2026-10-30. PIS/Cofins monthly are not modelled.
- Clinic scenario: payer is private (not public entity), so Lei 9.430/1996 art. 64 / IN RFB 1.234/2012 do not apply; IRRF follows RIR/2018 art. 714 (exception for medicine by ambulatório), CSRF follows Lei 10.833/2003 art. 30 / IN SRF 459/2004 art. 1º §2º IV (same criteria as IRRF; Solução de Consulta Cosit 6/2014), so ambulatório means neither is withheld.

## Live mode (4.1)

The board prefers the real store. `GET /api/board` reads the libSQL file (`AI4_DB`, default `<repo>/.data/month.db`) with `readBoard` (`src/store/read-board.ts`), which builds this same `SimState` from phase states, findings, documents and the event log, and the page polls it every 2 s. With no store file the page falls back to the local simulation above. In live mode approve/return are hidden: the Coordinator's approver decides until the accountant flow exists.

```
pnpm month:run --sim 2026 --db "$PWD/.data/month.db" --delay 1000 --clients 8   # use an absolute path
pnpm --filter @ai4a/web dev
```

## Demo mode (4.4)

`pnpm demo` starts the web app and runs a fresh simulated month for 15 synthetic clients (seed 2026) into `.data/demo.db`; the board follows it from Captura to Entrega at http://localhost:3000. The month runs by itself with the simulated accountant. `pnpm demo --accountant` stops each client at Aprovacao and waits for the decision in the web queue (the token is printed in the terminal).
