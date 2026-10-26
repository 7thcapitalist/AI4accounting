# Roadmap: agents v1

Owner: Joao. Written 2026-10-26 by the holding manager from Joao's brief, two discovery interviews (Diogo, Cris) and
Pedro's notes. This file is the plan the Software Factory executes. Product decisions in it become ADRs in Phase 0.

## Vision

An accounting firm does not buy another ERP from us. It gets a **team of AI agents that runs the monthly work of
every client**: pull the invoices, chase what is missing, check every document, reconcile, compute the tax, prepare
the filing and the payment slip. The accountant only reviews the exceptions and signs off. Every agent output is
traceable to its source document.

Long term the firm's ERP becomes optional. In v1 we sit beside it (Dominio, Alterdata, Questor) and feed it.

## What discovery told us (October 2026)

- Capturing invoices is already solved and cheap: firms use the client's A1 certificate plus tools (Alterdata, SIEG
  and similar). Competing on capture is a bad first bet (Pedro).
- The manual work is **after** capture: checking captured invoices against the ERP in spreadsheets, checking tax codes
  by hand, and delivering to the client (Diogo: "consulto, confere e entrega"; Cris: conference is spreadsheet work).
- Municipal portals have no APIs and differ per city. Much of it is occasional, not monthly.
- Sample is thin (a 5-minute call and an in-house accountant). Prevalence is a hypothesis until a firm shows us its
  screen. Phase 6 exists to fix that.

## Scope of v1

**The monthly fiscal close of a Simples Nacional company, run by agents, approved by a human.**

Simples Nacional is most of a small firm's portfolio and has one main monthly filing (PGDAS-D) with exact rules.
Payroll (DP), full bookkeeping and Lucro Presumido/Real are out of v1.

## The agents

| # | Agent | Does | Where the LLM is used |
|---|---|---|---|
| 0 | Coordinator | Calendar per client and competencia, opens the month, moves each client through the phases, escalates | Barely: state machine |
| 1 | Capture | Pulls NF-e (in/out), NFS-e (issued/taken), CT-e and the bank statement for the month through a `CaptureProvider` | No |
| 2 | Collection | Finds what is missing and drafts the message to the client (never sends in v1) | Yes: conversation |
| 3 | Check (conferencia) | Validates every document: CFOP, CST/CSOSN, NCM, ISS withholding, documents not belonging to the client, cancelled, duplicates | Rules first; LLM explains odd cases |
| 4 | Reconciliation | Documents x ERP ledger x bank statement; lists what does not match | Rules first; LLM ranks likely matches |
| 5 | Tax (apuracao) | Computes Simples Nacional (RBT12, annex, effective rate, fator R) and drafts the PGDAS-D | **Never.** Exact code with cited sources |
| 6 | Delivery | After approval: PGDAS-D/DAS through Integra Contador, sends the slip to the client | No |
| - | Accountant | Reviews the exception queue and approves | Human |

Rule of thumb: deterministic rules do the work, the LLM handles judgment and language. Money is integer centavos.

### Phases a client goes through each month

`Captura -> Coleta -> Conferencia -> Conciliacao -> Apuracao -> Aprovacao -> Entrega`

Each (client, competencia) is a row; each phase is a column. That grid **is** the main screen.

## External services

| Need | v1 choice | Why | Cost |
|---|---|---|---|
| Federal: PGDAS-D, DAS, situacao fiscal, caixa postal, procuracoes | **Serpro Integra Contador** | Official API from Receita/Serpro. Has a demonstration environment for building before any contract | Contract free, post-paid per call (DAS ~R$0,80 per call per third-party sources; confirm on Loja Serpro) |
| NFS-e of our own first client | NFS-e Nacional (ADN) distribution with the client's A1 | Government API, no middleman | Free |
| NF-e/CT-e capture at scale | `CaptureProvider` adapter; candidates Nuvem Fiscal (dev API with sandbox) or SIEG (what firms already use) | Do not build SEFAZ capture now (ADR 0003 superseded) | Decide in Phase 6 with real volumes |
| LLM | `LlmProvider` interface. Tests: fake. Dev on the mini PC: Claude Code CLI on the existing subscription | No pay-per-use keys until Joao approves a budget | 0 |
| Company data | Receita open CNPJ data / synthetic | Realistic profiles without client data | Free |

## First real client

**Frontstep** (our own company) is client #1. Its data is ours, so we can run a real month without a firm's consent.
Real data never enters the repo, issues, PRs or logs: it lives outside git on the mini PC (`AI4_DATA_DIR`).

## Phases

Branch model (Joao, 2026-10-26): agents work only on branches. Integration branch: `joao/agentes-v1`.
Each task branches from it as `joao/<issue>-<slug>`, opens a PR **into `joao/agentes-v1`**, gets an independent
review, and is merged into the integration branch after approval. **Only Joao merges into `main`.**
A task may stack sub-branches on its own branch when it is split.

### Phase 0: direction
- **0.1** ADRs: 0006 "agent-run monthly fiscal close for Simples Nacional" (supersedes 0003), 0007 "external services
  (Integra Contador, CaptureProvider, ADN)", 0008 "agent runtime and LlmProvider". Update `docs/CONTEXT.md`.
  Mark ADR 0004 (certificate custody) deferred.

### Phase 1: fiscal core (`packages/fiscal-core`)
- **1.1** Domain types, centavos helpers, chave de acesso and CNPJ validation (issue #3).
- **1.2** Parse authorized NF-e (nfeProc 4.00) into `FiscalDocument` (issue #4).
- **1.3** Parse NFS-e Padrao Nacional into `FiscalDocument`.
- **1.4** Simples Nacional engine: Annexes I-V tables, RBT12, effective rate, fator R, ISS/ICMS share. Every number
  cites LC 123/2006 as amended by LC 155/2016 and the Resolucao CGSN 140/2018; golden tests.

### Phase 2: the fake company (`packages/simulator`)
- **2.1** Deterministic generator (seeded) of companies and a month of operations: NF-e in/out, NFS-e issued/taken,
  OFX bank statement, ERP ledger CSV. XML valid against the official schemas. Profiles: commerce (Annex I),
  services (Annex III), services with fator R (Annex V/III), and a web-design studio like Frontstep. Synthetic
  CNPJs with valid check digits, never real ones.
- **2.2** Error injector + answer key + `pnpm eval`: missing invoice, wrong CFOP/CSOSN, ISS not withheld, invoice
  of another company, duplicate, cancelled invoice, bank entry without document, wrong revenue in PGDAS. Scores each
  agent (precision/recall per error type, tax amount exact to the centavo).

### Phase 3: agent runtime (`packages/agents`, `packages/db`)
- **3.1** Data model and store (libSQL file, ADR 0002) for firms, clients, competencias, phase states, tasks,
  agent runs, events, findings, approvals, documents; Coordinator state machine; append-only event log;
  `pnpm month:run --sim <seed>` runs a whole month headless. (Replaces issue #7.)
- **3.2** Capture agent + `CaptureProvider` (SimulatorProvider, FolderProvider for a folder of XMLs, ADN NFS-e
  provider stub). No real network in CI.
- **3.3** Check agent (rules + `LlmProvider` explanations).
- **3.4** Reconciliation agent.
- **3.5** Tax agent: PGDAS-D draft traceable to each document.
- **3.6** Collection agent: drafts messages; the simulator plays the client and answers.
- **3.7** Delivery agent against the Integra Contador client (demonstration environment only).

### Phase 4: AI-native front end (`apps/web`, user copy in pt-BR)
- **4.1** Month board: clients x phases grid, each cell shows the agent working, progress and exception count;
  KPIs on top (clients closed, exceptions open, hours saved); live activity feed from the event log.
- **4.2** Client month page: timeline of what each agent did, documents with the source XML, findings with the
  agent's reasoning and the rule/source behind it, approve or send back.
- **4.3** Accountant queue (exceptions and approvals, keyboard-first) and Agents page (what each agent is doing,
  throughput, errors caught, hours saved).
- **4.4** Demo mode: 15 simulated clients and a "Rodar o mes" button that shows the agents working end to end.

### Phase 5: Integra Contador (`packages/integra-contador`)
- **5.1** Client: authentication, AUTENTICAPROCURADOR, PGDAS-D (consultar declaracoes, gerar DAS), SITFIS,
  CAIXAPOSTAL, PROCURACOES. Runs against the demonstration environment; recorded fixtures for tests.
- **5.2** Production, read-only, for Frontstep. **Blocked on Joao** (contract + e-CNPJ).

### Phase 6: Frontstep as client #1 (blocked on Joao)
- **6.1** Import a real Frontstep month (NFS-e from ADN, bank statement) from `AI4_DATA_DIR`, run it in shadow mode and
  compare with what Frontstep's accountant filed. Output: hours, errors found, gaps.

### Phase 7: report
The holding manager writes the final report for the founders' meeting.

## Definition of done for v1
- `pnpm eval` on 15 simulated companies: tax amount exact in 100% of clean months; every injected error type caught
  with recall >= 90%.
- The month board shows a full simulated month closing with the agents, from capture to delivery (demo env).
- Integra Contador client passes against the demonstration environment.
- One real Frontstep month run in shadow mode (if Joao has unblocked Phase 5.2/6).
