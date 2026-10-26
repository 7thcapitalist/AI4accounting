# 0007: External services
Status: proposed
Date: 2026-10-26
Deciders: Joao Vitor

## Context
The agents of ADR 0006 need federal tax data and filings, invoice capture and an LLM. Municipal portals have no APIs and differ per city. We do not pay for anything not already covered by Joao's plans.

## Decision
- **Serpro Integra Contador** for federal needs: PGDAS-D, DAS, situacao fiscal, caixa postal, procuracoes. Official API; it has a demonstration environment, so we build against it before any contract. Contract is free and post-paid per call (DAS about R$0,80 per call per third-party sources; confirm on Loja Serpro). The client lives in `packages/integra-contador`, with recorded fixtures in tests. Production is read-only first and needs Joao (contract and e-CNPJ).
- **`CaptureProvider`** interface for NF-e, CT-e and NFS-e capture. Implementations in v1: `SimulatorProvider`, `FolderProvider` (a folder of XMLs) and an ADN NFS-e stub. Commercial candidates for scale are Nuvem Fiscal (developer API with sandbox) and SIEG (what firms already use); the choice waits for real volumes in Phase 6. We do not build SEFAZ capture.
- **NFS-e Nacional (ADN)** distribution with the client's A1 for Frontstep's own invoices. Government API, free, no middleman.
- **Company data**: Receita open CNPJ data or synthetic. Synthetic CNPJs have valid check digits and are never real.
- Every external service sits behind an interface. CI never touches the real network.

## Consequences
- Certificate custody (ADR 0004) is deferred: v1 does not store client certificates. Frontstep's A1 is used only locally on the mini PC.
- Production calls to Serpro or ADN, and anything sending data to government portals, need a human to merge and enable.
- Per-call cost of Integra Contador must be re-checked before production.
