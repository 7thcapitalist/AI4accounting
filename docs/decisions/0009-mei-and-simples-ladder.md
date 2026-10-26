# 0009: MEI and the MEI to Simples Nacional ladder
Status: proposed
Date: 2026-10-26
Deciders: Joao Vitor

## Context
ADR 0006 scoped v1 to Simples Nacional only. Client #1 is Frontstep, a MEI opened in October 2026 that is expected to outgrow MEI and move to Simples Nacional as a ME. Small firms also carry many MEIs in their portfolio. If v1 ignored MEI, our own first client could not run a real month, and the most valuable moment (the transition) would be left to a spreadsheet.

## Decision
v1 covers **two regimes and the move between them**:

- **MEI**: monthly DAS-MEI through PGMEI, the annual DASN-SIMEI declaration, and tracking of revenue against the MEI limit (proportional to the months of activity in the opening year).
- **Simples Nacional (ME/EPP)**: PGDAS-D as already defined in ADR 0006.
- **Enquadramento agent** (new, deterministic, no LLM): per client and competencia it computes accumulated gross revenue against the MEI limit, warns before the limit is reached, and when it is exceeded drafts the transition (desenquadramento from MEI, opt-in to Simples Nacional, effective date, first PGDAS-D). The accountant approves; the agent never files anything by itself.
- In the monthly grid the Apuracao phase dispatches by regime: MEI clients get the DAS-MEI draft, Simples clients get the PGDAS-D draft. A client changes regime on an explicit dated event, kept in the append-only log (ADR 0008).
- Tax rules are never guessed. Before the Enquadramento agent is implemented, the task must cite the official source for each rule and cover it with a test: LC 123/2006 (art. 18-A on MEI, limit, excess tolerance and its effective dates), Resolucao CGSN 140/2018 (PGMEI, DASN-SIMEI, desenquadramento, deadlines), and the Portal do Simples Nacional. Limit values, the fixed DAS-MEI amounts and the excess rules are **not copied into this ADR on purpose**: they change by law and must live in cited, tested code.
- Money stays in integer centavos.
- Integra Contador coverage of PGMEI and DASN-SIMEI is to be confirmed in the catalog (ADR 0007) before the Delivery work for MEI; until then MEI delivery is a draft the accountant files.

## Consequences
- ADR 0006 is amended: "Simples Nacional only" becomes "MEI and Simples Nacional". Its Out of v1 list is unchanged (DP, full bookkeeping, Lucro Presumido, Lucro Real).
- ROADMAP gets the Enquadramento agent and MEI items in the fiscal core (MEI rules), the simulator (a MEI profile that crosses the limit mid-year) and Tax/Delivery.
- The simulator needs a MEI profile and an eval case for the transition month.
- Frontstep can run a real month in shadow mode from day one as a MEI, and later through its own transition.
