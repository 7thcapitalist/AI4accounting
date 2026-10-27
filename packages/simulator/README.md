# @ai4a/simulator

Fake accounting portfolio (step 2.1) plus error injection and scoring (step 2.2). Everything is fictional and
deterministic by seed.

## Error injection and answer key

`injectErrors(generatePortfolio(seed), { rate })` plants errors in each company-month (each type with chance `rate`,
default 0.2) and returns the portfolio plus an `answerKey: AnswerKeyEntry[]`.

| `type` | What is planted | `ref` |
| --- | --- | --- |
| `missing_invoice` | document removed from the captured set (still in the ledger) | chave (NF-e) or number (NFS-e) |
| `wrong_cfop` | issued sale with CFOP 1102 (entrada code); CFOP direction per Ajuste SINIEF 07/2001 | chave |
| `iss_not_withheld` | taken NFS-e flagged `tpRetISSQN=2` (retido) while payment was gross; LC 116/2003 art. 6 §2 | number |
| `other_company` | NF-e between two other CNPJs mixed into the documents | chave |
| `duplicate` | same document captured twice | chave / number |
| `cancelled` | NF-e with `cStat` 101 (cancelamento homologado, NT 2011/001) still in ledger and bank | chave |
| `bank_without_document` | bank credit with no document and no ledger line | FITID |
| `wrong_revenue` | `declaredRevenue` differs from the sum of the notes | competencia (`YYYY-MM`) |

Entry shape (also in the JSON report): `{ companyId, competencia, type, ref, detail }`; `detail` is pt-BR text for the
board. A finding matches an entry when `companyId`, `competencia`, `type` and `ref` are all equal.

A pipeline never sees `expected` or the key: `InjectedMonth` minus `expected` is its input.

## `pnpm eval`

```
pnpm eval [--seed 1] [--rate 0.2] [--json] [--out report.json]
```

Runs the pipeline (today the `stubPipeline`, which reports nothing) over the injected portfolio and prints
precision and recall per error type plus tax exactness (the pipeline's `tax` equals the expected DAS, or
PIS+COFINS+ISS for Presumido, to the centavo). `--json` prints the report with the answer key for the board.
Precision is `n/a` when nothing of that type was reported; recall is `n/a` when nothing was planted.
To score a real pipeline, pass any `Pipeline` function to `evaluate()`.
