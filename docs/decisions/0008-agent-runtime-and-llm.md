# 0008: Agent runtime and LlmProvider
Status: proposed
Date: 2026-10-26
Deciders: Joao Vitor

## Context
ADR 0006 needs agents that run a whole month headless and are auditable. ADR 0002 already chose libSQL with Drizzle. We have no budget for pay-per-use LLM keys.

## Decision
- **Runtime** in `packages/agents`, store in `packages/db` (libSQL file). The Coordinator is a state machine over (client, competencia, phase). Other agents are workers that take a task, write results and finish.
- **Append-only event log** records every agent run, finding, approval and phase change, each pointing to its source document. The UI feed and the audit trail read from it.
- `pnpm month:run --sim <seed>` runs a full month headless against the simulator.
- **`LlmProvider`** is the only way code calls a model. Implementations: a fake for tests and CI (deterministic), and a Claude Code CLI provider for development on the existing subscription. No paid API keys until Joao approves a budget.
- LLM is used only where ROADMAP says so (Collection, Check explanations, Reconciliation ranking). Prompts and model output are never the source of a tax number.
- Nothing is sent to a client or portal by an agent in v1; drafts wait for the accountant.

## Consequences
- Tests and `pnpm eval` are deterministic and free.
- Swapping to an API provider later is one new implementation.
- Real data never enters prompts logged in git, issues, PRs or CI logs.
