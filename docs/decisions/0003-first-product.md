# 0003: First product is fiscal capture and checking
Status: proposed
Date: 2026-10-07
Deciders: Joao Vitor

## Context
`docs/CONTEXT.md` listed three candidates: document collection, fiscal classification and checking, bank reconciliation. Every monthly fiscal step (validation, bookkeeping, tax computation, filings) depends on having the client's invoices, so capture comes first.

## Decision
The first product automates the fiscal department, starting with capture: download NF-e and CT-e through SEFAZ Distribuicao DF-e and NFS-e through the national NFS-e environment (ADN), normalize them into one document model, and show what is missing per client and competencia. This merges candidates 1 and 2. Bank reconciliation waits.

Process map and roadmap: https://claude.ai/code/artifact/6bbabb48-a62b-4ab8-acb9-c3296e2fcdbc

## Consequences
- Phase 1 issues are #3 to #16, grouped in tracks A (fiscal-core), B (data and vault), C (SEFAZ), D (product).
- We hold client A1 certificates (see ADR 0004) and call government services, so those PRs need a human to merge.
- All development against SEFAZ uses the homologacao environment until a human approves production.
