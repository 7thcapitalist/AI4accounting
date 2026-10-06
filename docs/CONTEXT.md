# Context: what we are building

Shared context for all three founders and their agents. Update it through a PR when something here changes.

## One line

AI agents that do the recurring work of Brazilian accounting firms, sold to the firms as software.

## Customer

Small and mid-sized accounting firms in Brazil (roughly 5 to 30 people). We sell **to** the firms and work beside them. We do not compete with them for their clients.

## Why now

- The work is high volume, recurring and rule-heavy, and most inputs are already digital (XML invoices, SPED, eSocial, OFX statements).
- The tax reform (CBS and IBS replacing PIS, COFINS, ICMS and ISS between 2026 and 2033) forces firms to run two systems in parallel for years. That is new pain and a reason to buy.
- Agents can now handle work that needed a trained person a year ago.

## How a firm works

Four departments:

| Department | What it does |
| --- | --- |
| Fiscal | Collect invoices, classify, compute taxes, issue payment slips, file returns |
| DP (payroll) | Hiring, monthly payroll, vacations, terminations, eSocial |
| Contabil (accounting) | Ledger entries, bank reconciliation, monthly close, balance sheet and DRE |
| Societario (corporate) | Company registration and changes, plus seasonal services (IRPF, ITR, DMED) |

The firm's core system is an accounting ERP (Dominio, Alterdata, Questor and others). Our product lives **beside** that system, not in place of it. What goes in and out of the ERP defines our integration surface.

## Product principles

- Every workflow step is one of three types: **rule** (deterministic), **judgment** (needs a person or a reviewed model decision), or **waiting on the client**. We automate rules fully, assist judgment with human review, and shorten the waiting.
- The human accountant reviews and signs off. Agents prepare, check and flag.
- Errors cost fines. Correctness and auditability beat speed and features. Every agent output must be traceable to its source document.
- The metric that matters: **hours saved per client per month at the same or lower error rate.**

## First product: not decided yet

Candidates under evaluation:

1. **Document collection**: chasing clients and gathering XMLs and documents.
2. **Fiscal classification and checking**: importing, classifying and validating invoices and entries.
3. **Bank reconciliation**: matching bank statements (OFX) against ledger entries.

The choice goes in `docs/decisions/` once made. Until then, build only shared foundations and throwaway prototypes clearly labeled as such.

## Long-term direction

Start capital-light as software. Later, use the product advantage and cash flow to acquire accounting firms (for example from retiring owners) and run them at higher margin.

## Glossary

| Term | Meaning |
| --- | --- |
| NF-e / NFS-e / NFC-e / CT-e | Electronic invoices: goods / services / retail / freight |
| XML | The legal file of an electronic invoice |
| CFOP, NCM, CST/CSOSN | Invoice codes: operation type, product type, tax treatment |
| MEI, Simples Nacional, Lucro Presumido, Lucro Real | Tax regimes, from simplest to most demanding |
| DAS / DARF | Tax payment slips (Simples / federal) |
| PGDAS-D | Monthly Simples Nacional tax computation |
| SPED | Federal digital bookkeeping system (EFD, ECD, ECF) |
| eSocial | Federal payroll and labor event reporting |
| eCAC | Receita Federal taxpayer portal |
| SEFAZ | State tax authority |
| Obrigacao acessoria | A filing obligation, as opposed to a tax payment |
| DRE | Income statement |
| Competencia | Accrual period a transaction belongs to |

## Team

| Person | Short name (for branches) | GitHub | Focus |
| --- | --- | --- | --- |
| Joao | `joao` | TBD | TBD |
| Pedro | `pedro` | TBD | TBD |
| Vitor | `vitor` | TBD | TBD |
