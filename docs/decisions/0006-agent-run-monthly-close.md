# 0006: Agent-run monthly fiscal close for Simples Nacional
Status: proposed (amended by [0009](0009-target-segment-simples-and-up.md): v1 is Simples Nacional + Lucro Presumido, MEI out)
Date: 2026-10-26
Deciders: Joao Vitor

## Context
ADR 0003 made capture the first product. Discovery in October 2026 (two interviews and Pedro's notes, see `docs/ROADMAP.md`) showed that capture is already solved and cheap: firms use the client's A1 certificate plus existing tools. The manual work is after capture: checking invoices against the ERP in spreadsheets, checking tax codes by hand, and delivering to the client. The sample is thin, so prevalence is still a hypothesis until a firm shows us its screen.

## Decision
The first product is **the monthly fiscal close of a Simples Nacional company, run by agents and approved by a human accountant**. It replaces ADR 0003.

- Agents: Coordinator, Capture, Collection, Check (conferencia), Reconciliation, Tax (apuracao), Delivery. The accountant reviews the exception queue and approves. Roles are defined in `docs/ROADMAP.md`.
- Each (client, competencia) moves through `Captura -> Coleta -> Conferencia -> Conciliacao -> Apuracao -> Aprovacao -> Entrega`. That grid is the main screen.
- Deterministic rules do the work; the LLM handles judgment and language. The Tax agent never uses an LLM: exact code with cited sources (LC 123/2006 as amended by LC 155/2016, Resolucao CGSN 140/2018) and golden tests.
- Money is integer centavos. Every agent output traces to its source document.
- The product sits beside the firm's ERP (Dominio, Alterdata, Questor) and feeds it.
- Out of v1: DP (payroll), full bookkeeping, Lucro Real and MEI (Lucro Presumido enters as second regime, see 0009).
- Collection drafts messages to the client but never sends them in v1.

## Consequences
- ADR 0003 is superseded. SEFAZ capture (Distribuicao DF-e) is no longer built by us; see ADR 0007.
- Quality is measured by `pnpm eval` on simulated companies (tax exact in clean months, recall >= 90% per injected error type), not by feature count.
- Frontstep, our own company, is client #1; its real data stays outside git (`AI4_DATA_DIR`).
