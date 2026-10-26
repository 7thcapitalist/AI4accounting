# 0009: Target segment is Simples Nacional and up (MEI out of scope)
Status: proposed
Date: 2026-10-26
Deciders: Joao Vitor

## Context
ADR 0006 scoped v1 to Simples Nacional. The founder's direction is to aim at the segment from Simples Nacional upward: Simples first, Lucro Presumido next, Lucro Real later. MEI is out of scope, even though Frontstep (our own company) is a MEI today; Frontstep is not the reference client. Real data and feedback are expected to come from a partner accounting firm.

The first real client is an outpatient medical clinic under Lucro Presumido in Goiania, a company owned by the founder's family. No name or CNPJ goes in the repo.

## Decision
- **v1 regimes:** Simples Nacional (PGDAS-D, as in ADR 0006) and, as the second regime, **Lucro Presumido**. Lucro Real comes after v1.
- **MEI is out:** no DAS-MEI, PGMEI or DASN-SIMEI work in v1.
- **Regime agent** (deterministic, no LLM; replaces the idea of an Enquadramento agent for MEI): per client and competencia it checks the Simples Nacional ceiling and sublimit against accumulated gross revenue, computes fator R, compares Simples x Presumido, and warns before a limit is crossed. When a change is warranted it drafts the regime change (effective date, consequences). The accountant approves; the agent never files anything by itself.
- In the monthly grid the Apuracao phase dispatches by regime. A client changes regime on an explicit dated event, kept in the append-only log (ADR 0008).
- Tax rules are never guessed. Before the Regime agent or the Presumido engine is implemented, the task cites the official source per rule and covers it with a test (LC 123/2006 as amended by LC 155/2016, Resolucao CGSN 140/2018, and the Presumido legislation). Limits and rates are **not copied into this ADR on purpose**: they change by law and must live in cited, tested code.
- Money stays in integer centavos.
- **First real client:** the Goiania outpatient clinic under Lucro Presumido. It makes the Presumido engine a v1 requirement, not a later option. Its data stays outside git like any other real data.
- Frontstep stays outside the reference set. Real data comes from a partner firm, outside git (`AI4_DATA_DIR`), never in the repo, fixtures or logs.

## Consequences
- ADR 0006 is amended: v1 is "Simples Nacional + Lucro Presumido"; Out of v1 becomes DP, full bookkeeping, Lucro Real and MEI.
- ROADMAP gets the Regime agent and a Presumido engine in the fiscal core; the simulator needs a Presumido profile and a regime-comparison eval case.
- Finding a partner firm becomes a dependency for real-data validation (Phase 6).
