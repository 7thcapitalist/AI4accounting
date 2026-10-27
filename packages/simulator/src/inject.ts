import type { Centavos } from "@ai4a/fiscal-core";
import { syntheticCnpj } from "./cnpj";
import type { BankLine, Company, Expected, LedgerLine, SimDocument } from "./month";
import type { Portfolio } from "./portfolio";
import { Rng } from "./rng";
import { nfeProcXml } from "./xml";

/** Error types the injector plants (docs/ROADMAP.md step 2.2). */
export const ERROR_TYPES = [
  "missing_invoice",
  "wrong_cfop",
  "iss_not_withheld",
  "other_company",
  "duplicate",
  "cancelled",
  "bank_without_document",
  "wrong_revenue",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

/**
 * One planted error. `ref` identifies the culprit: chave (NF-e) or number (NFS-e) of the document,
 * the FITID of the bank line, or the competencia for `wrong_revenue`.
 */
export interface AnswerKeyEntry {
  companyId: string;
  competencia: string;
  type: ErrorType;
  ref: string;
  /** Human-readable explanation, pt-BR, for the board. */
  detail: string;
}

/** What a pipeline gets for one company-month: no answer key, no expected taxes. */
export interface InjectedMonth {
  competencia: string;
  documents: SimDocument[];
  bank: BankLine[];
  ledger: LedgerLine[];
  /** Monthly revenue as declared by the client / found in the PGDAS draft (wrong when `wrong_revenue`). */
  declaredRevenue: Centavos;
  /** Ground truth for scoring. Never hand this to a pipeline. */
  expected: Expected;
}

export interface InjectedPortfolio {
  seed: number;
  companies: { company: Company; months: InjectedMonth[] }[];
  answerKey: AnswerKeyEntry[];
}

export interface InjectOptions {
  /** Chance of planting each error type in a company-month (default 0.2). */
  rate?: number;
}

const DEFAULT_RATE = 0.2;

// Official sources for the planted rules:
// - CFOP: Ajuste SINIEF 07/2001 / Convenio s/n 1970 table. The first digit gives the direction
//   (1/2/3 = entrada, 5/6/7 = saida); an issued sale (tpNF=1) with a CFOP 1xxx is wrong.
// - ISS retention: LC 116/2003 art. 6 §2; leiaute NFS-e Padrao Nacional, tpRetISSQN
//   (1 = nao retido, 2 = retido pelo tomador). A taken service flagged 2 must be paid net of ISS.
// - Cancelled NF-e: NT 2011/001 (cStat 101 = cancelamento de NF-e homologado).
const WRONG_CFOP = "1102";

/** Plants errors in a clean portfolio, deterministically by seed, and writes the answer key. */
export function injectErrors(portfolio: Portfolio, options: InjectOptions = {}): InjectedPortfolio {
  const rate = options.rate ?? DEFAULT_RATE;
  const answerKey: AnswerKeyEntry[] = [];
  const companies = portfolio.companies.map(({ company, months }) => ({
    company,
    months: months.map((clean) => {
      const rng = new Rng(
        portfolio.seed * 131 +
          Number(clean.competencia.replace("-", "")) * 17 +
          company.cnpj.charCodeAt(7) * 53,
      );
      const documents = [...clean.documents];
      const bank = [...clean.bank];
      const ledger = [...clean.ledger];
      let declaredRevenue = clean.expected.revenue;
      const used = new Set<string>();
      const note = (type: ErrorType, ref: string, detail: string) =>
        answerKey.push({
          companyId: company.id,
          competencia: clean.competencia,
          type,
          ref,
          detail,
        });
      /** Random clean document matching `fits`, not yet touched by another error. */
      const target = (fits: (d: SimDocument) => boolean) => {
        const pool = clean.documents.filter((d) => !used.has(d.ref) && fits(d));
        if (pool.length === 0) return undefined;
        const d = rng.pick(pool);
        used.add(d.ref);
        return d;
      };
      const replaceDoc = (d: SimDocument, xml: string) => {
        documents[documents.findIndex((x) => x.ref === d.ref && x.file === d.file)] = { ...d, xml };
      };
      // Draw every roll up front so adding a type never shifts the others.
      const roll = Object.fromEntries(ERROR_TYPES.map((t) => [t, rng.next() < rate])) as Record<
        ErrorType,
        boolean
      >;

      if (roll.missing_invoice) {
        const d = target(() => true);
        if (d) {
          documents.splice(
            documents.findIndex((x) => x.file === d.file),
            1,
          );
          note("missing_invoice", d.ref, `Nota ${d.ref} esta no razao mas nao foi capturada`);
        }
      }
      if (roll.wrong_cfop) {
        const d = target((x) => x.kind === "nfe" && x.role === "saida");
        if (d) {
          replaceDoc(d, d.xml.replaceAll("<CFOP>5102</CFOP>", `<CFOP>${WRONG_CFOP}</CFOP>`));
          note("wrong_cfop", d.ref, `Venda emitida com CFOP ${WRONG_CFOP} (codigo de entrada)`);
        }
      }
      if (roll.iss_not_withheld) {
        const d = target((x) => x.kind === "nfse" && x.role === "entrada");
        if (d) {
          replaceDoc(d, d.xml.replace("<tpRetISSQN>1</tpRetISSQN>", "<tpRetISSQN>2</tpRetISSQN>"));
          note(
            "iss_not_withheld",
            d.ref,
            "ISS retido pelo tomador na nota, mas o pagamento saiu integral",
          );
        }
      }
      if (roll.cancelled) {
        const d = target((x) => x.kind === "nfe");
        if (d) {
          replaceDoc(
            d,
            d.xml.replace(
              "<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e",
              "<cStat>101</cStat><xMotivo>Cancelamento de NF-e homologado",
            ),
          );
          note("cancelled", d.ref, "NF-e cancelada que continua no razao e no extrato");
        }
      }
      if (roll.duplicate) {
        const d = target(() => true);
        if (d) {
          documents.push({ ...d, file: d.file.replace(".xml", "-dup.xml") });
          note("duplicate", d.ref, "Mesmo documento capturado duas vezes");
        }
      }
      if (roll.other_company) {
        const emit = syntheticCnpj(rng);
        const dest = syntheticCnpj(rng);
        const n = rng.int(500_000, 599_999);
        const valor = rng.int(50_000, 900_000);
        const date = `${clean.competencia}-${String(rng.int(1, 28)).padStart(2, "0")}`;
        const { chave, xml } = nfeProcXml({
          emitCnpj: emit,
          emitNome: "Terceiro Ficticio Ltda",
          destCnpj: dest,
          destNome: "Outro Ficticio Ltda",
          data: date,
          numero: n,
          simples: false,
          cfop: "5102",
          itens: [valor],
          cNF: rng.digits(8),
        });
        documents.push({
          file: `nfe-terceiro-${n}.xml`,
          kind: "nfe",
          role: "entrada",
          ref: chave,
          counterpart: emit,
          date,
          valor,
          xml,
        });
        note("other_company", chave, "NF-e de outro CNPJ misturada nos documentos do cliente");
      }
      if (roll.bank_without_document) {
        const fitid = `X${clean.competencia}${rng.digits(4)}`;
        const valor = rng.int(10_000, 400_000);
        bank.push({
          date: `${clean.competencia}-${String(rng.int(1, 28)).padStart(2, "0")}`,
          valor,
          memo: `PIX RECEBIDO ${syntheticCnpj(rng)}`,
          fitid,
        });
        bank.sort((a, b) => a.date.localeCompare(b.date) || a.fitid.localeCompare(b.fitid));
        note("bank_without_document", fitid, "Credito no extrato sem nota nem lancamento no razao");
      }
      if (roll.wrong_revenue) {
        const delta =
          Math.round(clean.expected.revenue * (rng.int(3, 15) / 100)) * (rng.next() < 0.5 ? -1 : 1);
        declaredRevenue = clean.expected.revenue + delta;
        note(
          "wrong_revenue",
          clean.competencia,
          `Faturamento declarado difere do somatorio das notas em ${delta} centavos`,
        );
      }
      return {
        competencia: clean.competencia,
        documents,
        bank,
        ledger,
        declaredRevenue,
        expected: clean.expected,
      };
    }),
  }));
  return { seed: portfolio.seed, companies, answerKey };
}
