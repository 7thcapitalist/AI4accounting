import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@ai4a/db";
import { evaluate, generatePortfolio, injectErrors } from "@ai4a/simulator";
import { describe, expect, it } from "vitest";
import { CaptureAgent } from "../capture";
import { ReconciliationAgent } from "./agent";
import { parseLedgerCsv, parseOfx, toCentavos } from "./parse";
import { reconciliationPipeline } from "./pipeline";
import { reconcile } from "./reconcile";

const CP = "11222333000181";
const doc = (key: string, valor: number, retained = 0) =>
  ({
    key,
    kind: "nfse",
    role: "saida",
    date: "2026-09-10",
    counterpart: CP,
    valor,
    retained,
  }) as const;
const led = (ref: string, valor: number, account = "receita") => ({
  date: "2026-09-10",
  account,
  ref,
  counterpart: CP,
  valor,
});
const bank = (fitid: string, valor: number, date = "2026-09-10", memo = `PIX RECEBIDO ${CP}`) => ({
  date,
  valor,
  memo,
  fitid,
});

describe("parsers", () => {
  it("reads amounts without floats", () => {
    expect(toCentavos("1234.56")).toBe(123456);
    expect(toCentavos("-0.5")).toBe(-50);
    expect(() => toCentavos("abc")).toThrow();
  });
  it("reads OFX SGML and the ERP CSV", () => {
    const ofx =
      "<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905<TRNAMT>10.00<FITID>C1<MEMO>PIX RECEBIDO 1</STMTTRN></OFX>";
    expect(parseOfx(ofx)).toEqual([
      { date: "2026-09-05", valor: 1000, memo: "PIX RECEBIDO 1", fitid: "C1" },
    ]);
    const csv = "data;conta;documento;contraparte;valor\n2026-09-05;receita;77;123;10.00\n";
    expect(parseLedgerCsv(csv)).toEqual([
      { date: "2026-09-05", account: "receita", ref: "77", counterpart: "123", valor: 1000 },
    ]);
  });
});

describe("reconcile", () => {
  it("matches a clean month with no findings", () => {
    expect(
      reconcile({
        documents: [doc("1", 1000)],
        ledger: [led("1", 1000)],
        bank: [bank("C1", 1000)],
      }),
    ).toEqual([]);
  });
  it("ledger line without document is missing_invoice", () => {
    const f = reconcile({ documents: [], ledger: [led("9", 1000)], bank: [bank("C9", 1000)] });
    expect(f.map((x) => [x.type, x.ref])).toEqual([["missing_invoice", "9"]]);
  });
  it("bank line without document or ledger is bank_without_document", () => {
    const f = reconcile({ documents: [], ledger: [], bank: [bank("X1", 5000)] });
    expect(f.map((x) => [x.type, x.ref])).toEqual([["bank_without_document", "X1"]]);
  });
  it("accepts a credit short by the withholdings, but not by more", () => {
    const ok = reconcile({
      documents: [doc("1", 10_000)],
      ledger: [led("1", 10_000)],
      bank: [bank("C1", 9_385)], // 6.15% short
    });
    expect(ok).toEqual([]);
    const bad = reconcile({
      documents: [doc("1", 10_000)],
      ledger: [led("1", 10_000)],
      bank: [bank("C1", 9_000)],
    });
    expect(bad.map((x) => x.type)).toEqual(["bank_without_document"]);
  });
  it("respects the date window and the counterpart", () => {
    const base = { documents: [doc("1", 1000)], ledger: [led("1", 1000)] };
    expect(reconcile({ ...base, bank: [bank("C1", 1000, "2026-09-15")] })).toEqual([]);
    expect(reconcile({ ...base, bank: [bank("C1", 1000, "2026-09-16")] })).toHaveLength(1);
    expect(
      reconcile({ ...base, bank: [bank("C1", 1000, "2026-09-10", "PIX RECEBIDO 99999999000199")] }),
    ).toHaveLength(1);
  });
  it("one ledger line settles one bank line only; exact beats tolerant", () => {
    const f = reconcile({
      documents: [doc("1", 1000), doc("2", 1000)],
      ledger: [led("1", 1000), led("2", 1000)],
      bank: [bank("A", 1000), bank("B", 1000), bank("C", 1000)],
    });
    expect(f.map((x) => x.ref)).toEqual(["C"]);
  });
  it("skips payroll and flags a ledger value that differs from the document", () => {
    const f = reconcile({
      documents: [doc("1", 1000)],
      ledger: [led("1", 1100)],
      bank: [bank("F", -5000, "2026-09-05", "FOLHA DE PAGAMENTO"), bank("C1", 1100)],
    });
    expect(f.map((x) => x.type)).toEqual(["amount_mismatch"]);
  });
});

describe("ReconciliationAgent", () => {
  it("reads captured files from the store and reports the planted errors", async () => {
    const month = "2026-09";
    const seed = 3;
    const injected = injectErrors(generatePortfolio(seed, [month]), { rate: 0.5 });
    const entry = injected.companies[0];
    if (!entry) throw new Error("empty portfolio");
    const planted = injected.answerKey.filter(
      (a) =>
        a.companyId === entry.company.id &&
        ["missing_invoice", "bank_without_document"].includes(a.type),
    );
    expect(planted.length).toBeGreaterThan(0);
    const st = await openStore(":memory:");
    await st.client.batch([
      "INSERT INTO firms VALUES ('f','F')",
      `INSERT INTO clients VALUES ('cl','f','C','${entry.company.cnpj}','simples')`,
      `INSERT INTO competencias VALUES ('c1','cl','${month}')`,
    ]);
    const dataDir = mkdtempSync(join(tmpdir(), "ai4a-recon-"));
    const { toLedgerCsv, toOfx } = await import("@ai4a/simulator");
    const m = entry.months[0];
    if (!m) throw new Error("no month");
    const sim = { ...m, competencia: month };
    const provider = {
      name: "injected",
      capture: async () => ({
        files: [
          ...m.documents.map((d) => ({
            kind: d.kind,
            name: d.file,
            content: Buffer.from(d.xml),
            key: d.ref,
            amountCentavos: d.valor,
          })),
          { kind: "ofx" as const, name: "e.ofx", content: Buffer.from(toOfx(entry.company, sim)) },
          { kind: "ledger" as const, name: "r.csv", content: Buffer.from(toLedgerCsv(sim)) },
        ],
        rejected: [],
      }),
    };
    const task = { taskId: "t", competenciaId: "c1", phase: "captura" } as const;
    await new CaptureAgent({ store: st, provider, dataDir }).run(task);
    const res = await new ReconciliationAgent({ store: st }).run({ ...task, phase: "conciliacao" });
    for (const p of planted) {
      const hit = res.findings.some((f) => f.message.includes(p.ref));
      expect(hit, `${p.type} ${p.ref}`).toBe(true);
    }
    expect(res.events[0]?.kind).toBe("reconciliation.summary");
    st.close();
  });
});

describe("pnpm eval", () => {
  it("recall >= 90% on missing_invoice and bank_without_document across seeds", async () => {
    for (const seed of [1, 7, 42]) {
      const report = await evaluate(injectErrors(generatePortfolio(seed)), reconciliationPipeline);
      for (const t of report.byType) {
        if (t.type !== "missing_invoice" && t.type !== "bank_without_document") continue;
        expect(t.recall ?? 1, `${t.type} seed ${seed}`).toBeGreaterThanOrEqual(0.9);
        expect(t.fp, `${t.type} fp seed ${seed}`).toBe(0);
      }
    }
  });
});
