import type { BankEntry, DocFact, LedgerEntry } from "./parse";

export type ReconFindingType =
  | "missing_invoice"
  | "bank_without_document"
  | "amount_mismatch"
  | "cancelled";

export interface ReconFinding {
  type: ReconFindingType;
  /** Chave/number of the ledger line or document, or the FITID of the bank line. */
  ref: string;
  message: string;
  /** Rule behind the finding. */
  source: string;
}

export interface ReconcileOptions {
  /** Max distance in days between a bank line and the document/ledger date it settles. */
  dateWindowDays: number;
  /**
   * A credit may arrive short of the invoice by the federal withholdings the payer keeps.
   * Cap: IRRF 1.5% (Lei 9.430/1996 art. 64) + CSLL 1% + COFINS 3% + PIS 0.65%
   * (Lei 10.833/2003 art. 30) = 6.15%, in basis points of the invoice value.
   */
  maxWithholdingBp: number;
  /** Bank memos that never have an invoice behind them (payroll, bank fees, tax payments). */
  nonDocumentMemo: RegExp;
}

export const DEFAULT_OPTIONS: ReconcileOptions = {
  dateWindowDays: 5,
  maxWithholdingBp: 615,
  nonDocumentMemo: /^(FOLHA|TARIFA|IOF|DAS\b|DARF|GPS\b|FGTS)/i,
};

export interface ReconcileInput {
  documents: DocFact[];
  ledger: LedgerEntry[];
  bank: BankEntry[];
}

/** What the books say should move in the bank: one per ledger line, or per document the ledger lacks. */
interface Expected {
  ref: string;
  date: string;
  counterpart: string;
  /** Signed: positive = money in. */
  valor: number;
  /** Bank amount may be lower by up to this much (absolute centavos). */
  slack: number;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
/** Counterpart document (CNPJ/CPF) at the end of a bank memo, e.g. "PIX RECEBIDO 12345678000190". */
const memoCounterpart = (memo: string) => /(\d{14}|\d{11})\s*$/.exec(memo)?.[1] ?? "";

/** Four withholdings (IRRF, CSLL, COFINS, PIS) are rounded one by one: allow 1 centavo each. */
const withholdingCap = (valor: number, bp: number) => Math.ceil((valor * bp) / 10_000) + 4;

const INCOME = new Set(["receita"]);

export function reconcile(
  input: ReconcileInput,
  options: Partial<ReconcileOptions> = {},
): ReconFinding[] {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const findings: ReconFinding[] = [];
  const docs = new Map(input.documents.map((d) => [d.key, d]));
  const ledgerRefs = new Set(input.ledger.map((l) => l.ref));

  // 1. Ledger x documents, by chave/number.
  for (const l of input.ledger) {
    const d = docs.get(l.ref);
    if (d?.cancelled) {
      findings.push({
        type: "cancelled",
        ref: l.ref,
        message: `Documento ${l.ref} esta cancelado (cStat 101) mas continua no razao`,
        source: "NT 2011/001: cStat 101 = cancelamento de NF-e homologado",
      });
    } else if (!d) {
      findings.push({
        type: "missing_invoice",
        ref: l.ref,
        message: `Lancamento ${l.ref} (${l.valor} centavos) esta no razao mas nao ha documento capturado`,
        source: "reconciliation:ledger-vs-documents",
      });
    } else if (d.valor !== l.valor) {
      findings.push({
        type: "amount_mismatch",
        ref: l.ref,
        message: `Razao ${l.valor} centavos diverge do documento ${d.valor} centavos`,
        source: "reconciliation:ledger-vs-documents",
      });
    }
  }

  // 2. What should have moved in the bank.
  const expected: Expected[] = input.ledger.map((l) => ({
    ref: l.ref,
    date: l.date,
    counterpart: l.counterpart,
    valor: INCOME.has(l.account) ? l.valor : -l.valor,
    slack: INCOME.has(l.account) ? withholdingCap(l.valor, o.maxWithholdingBp) : 0,
  }));
  // Documents the ledger does not list still explain a bank line (the books are what is late).
  for (const d of input.documents) {
    if (ledgerRefs.has(d.key)) continue;
    expected.push({
      ref: d.key,
      date: d.date,
      counterpart: d.counterpart,
      valor: d.role === "saida" ? d.valor : -d.valor,
      slack: d.role === "saida" ? d.retained : 0,
    });
  }

  // 3. Bank x expected: exact amounts first so a tolerant match never steals an exact one.
  const used = new Set<Expected>();
  const unmatched: BankEntry[] = [];
  const pending = input.bank.filter((b) => !o.nonDocumentMemo.test(b.memo));
  const fits = (b: BankEntry, e: Expected, tolerant: boolean) => {
    if (used.has(e) || daysBetween(b.date, e.date) > o.dateWindowDays) return false;
    const cp = memoCounterpart(b.memo);
    if (cp && e.counterpart && cp !== e.counterpart) return false;
    if (Math.sign(b.valor) !== Math.sign(e.valor)) return false;
    const short = Math.abs(e.valor) - Math.abs(b.valor);
    return tolerant ? short >= 0 && short <= e.slack : short === 0;
  };
  const left = new Set(pending);
  for (const tolerant of [false, true]) {
    for (const b of [...left]) {
      const hit = expected.find((e) => fits(b, e, tolerant));
      if (hit) {
        used.add(hit);
        left.delete(b);
      }
    }
  }
  unmatched.push(...left);
  for (const b of unmatched) {
    findings.push({
      type: "bank_without_document",
      ref: b.fitid,
      message: `Movimento ${b.fitid} de ${b.valor} centavos em ${b.date} (${b.memo}) sem nota nem lancamento no razao`,
      source: "reconciliation:bank-vs-books",
    });
  }
  return findings;
}
