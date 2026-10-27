// Fake accounting portfolio: fictional companies (Simples Nacional and Lucro Presumido) with a month
// of documents in the official XML layouts, bank statement, ERP ledger and the expected taxes.
// Deterministic by seed. Step 2.1 of docs/ROADMAP.md; error injection and scoring (inject.ts, eval.ts) are step 2.2.
export { syntheticCnpj } from "./cnpj";
export * from "./eval";
export { toLedgerCsv, toOfx } from "./files";
export * from "./inject";
export * from "./month";
export * from "./portfolio";
export * from "./profiles";
export { Rng } from "./rng";
export { nfeChave, nfeProcXml, nfseXml } from "./xml";
