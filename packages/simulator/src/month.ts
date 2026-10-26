import {
  type Annex,
  apurarMesPresumido,
  apurarTrimestrePresumido,
  type Centavos,
  calculateDas,
  type DasResult,
  type MesPresumidoResult,
  type Retencoes,
  retencoesServico,
  somarRetencoes,
  type TrimestrePresumidoResult,
} from "@ai4a/fiscal-core";
import { syntheticCnpj } from "./cnpj";
import type { Profile } from "./profiles";
import { Rng } from "./rng";
import { nfeProcXml, nfseXml } from "./xml";

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  profile: Profile;
  /** Fator R companies: payroll as a share of revenue (>= 28% keeps Annex III). */
  payrollRatio: number;
  /** Revenue of the 12 months before the first simulated month (oldest first), centavos. */
  history: Centavos[];
  /** Calendar-year revenue before the first simulated month (for RBA), centavos. */
  yearToDate: Centavos;
  /** Revenue of the previous calendar year (RBAA, 2025), centavos. */
  rbaa: Centavos;
}

export interface SimDocument {
  /** File name inside the month folder. */
  file: string;
  kind: "nfe" | "nfse";
  role: "saida" | "entrada";
  /** chave for NF-e, number for NFS-e. */
  ref: string;
  counterpart: string;
  date: string;
  valor: Centavos;
  /** Federal withholdings by the tomador (Presumido services), centavos. */
  retencoes?: Retencoes;
  xml: string;
}

export interface BankLine {
  date: string;
  /** Positive = credit, negative = debit. */
  valor: Centavos;
  memo: string;
  fitid: string;
}

export interface LedgerLine {
  date: string;
  account: "receita" | "compras" | "servicos_tomados";
  ref: string;
  counterpart: string;
  valor: Centavos;
}

export interface Expected {
  revenue: Centavos;
  /** Federal withholdings suffered in the month (IRRF, CSLL, PIS, COFINS), centavos. */
  retencoes: Retencoes;
  rbt12?: Centavos;
  das?: DasResult;
  presumidoMes?: MesPresumidoResult;
  presumidoTrimestre?: TrimestrePresumidoResult;
}

export interface SimMonth {
  competencia: string;
  documents: SimDocument[];
  bank: BankLine[];
  ledger: LedgerLine[];
  expected: Expected;
}

const NOMES = [
  "Aurora",
  "Cerrado",
  "Ipê",
  "Buriti",
  "Araguaia",
  "Vereda",
  "Pequi",
  "Serra Dourada",
  "Jatobá",
  "Lago Azul",
  "Bandeiras",
  "Anhanguera",
  "Meia Ponte",
  "Goiás Velho",
  "Pirenópolis",
];
const SUFIXO: Record<string, string> = {
  comercio_simples: "Comércio Ltda",
  servicos_simples: "Tecnologia Ltda",
  fator_r_simples: "Sistemas Ltda",
  sublimite_simples: "Atacado Ltda",
  servicos_presumido: "Consultoria Ltda",
  comercio_presumido: "Distribuidora Ltda",
  clinica_presumido: "Clínica Médica Ltda",
};

export function buildCompany(seed: number, index: number, profile: Profile): Company {
  const rng = new Rng(seed * 1009 + index * 7919);
  const [min, max] = profile.historyRevenue ?? profile.revenue;
  const history = Array.from({ length: 12 }, () => rng.int(min, max));
  return {
    id: `c${String(index + 1).padStart(2, "0")}`,
    name: `${NOMES[index % NOMES.length]} ${SUFIXO[profile.key]}`,
    cnpj: syntheticCnpj(rng),
    profile,
    payrollRatio: profile.annex === "FATOR_R" ? (index % 2 === 0 ? 0.32 : 0.18) : 0.15,
    history,
    // Calendar year before July: the last 6 months of the history (January..June).
    yearToDate: history.slice(6).reduce((a, b) => a + b, 0),
    // 2025 = January..June (drawn now) + July..December (first half of the history).
    rbaa:
      Array.from({ length: 6 }, () => rng.int(min, max)).reduce((a, b) => a + b, 0) +
      history.slice(0, 6).reduce((a, b) => a + b, 0),
  };
}

/** Splits `total` into `n` positive parts that add up exactly. */
function split(rng: Rng, total: Centavos, n: number): Centavos[] {
  const weights = Array.from({ length: n }, () => rng.int(5, 20));
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  parts[0] = (parts[0] ?? 0) + total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

const day = (competencia: string, d: number) => `${competencia}-${String(d).padStart(2, "0")}`;

/**
 * One month of a company: issued and received documents (XML), bank statement, ERP ledger and the
 * expected taxes from the fiscal-core engines. `prior` = revenues of the simulated months already
 * generated for this company (oldest first), with their withholdings for the quarterly IRPJ/CSLL. Clean month: nothing wrong is injected here (step 2.2).
 */
export interface PriorMonth {
  revenue: Centavos;
  retencoes: Retencoes;
}

export function generateMonth(
  seed: number,
  company: Company,
  competencia: string,
  prior: PriorMonth[],
): SimMonth {
  const rng = new Rng(
    seed * 31 + Number(competencia.replace("-", "")) + company.cnpj.charCodeAt(5) * 97,
  );
  const p = company.profile;
  const revenue = rng.int(p.revenue[0], p.revenue[1]);
  const documents: SimDocument[] = [];
  const bank: BankLine[] = [];
  const ledger: LedgerLine[] = [];
  let numero = 1000 + Number(competencia.slice(5)) * 100;

  const sales = split(rng, revenue, rng.int(4, 9));
  const retidas: Retencoes[] = [];
  for (const valor of sales) {
    const date = day(competencia, rng.int(1, 28));
    numero++;
    if (p.sells === "nfe") {
      const dest = syntheticCnpj(rng);
      const itens = valor > 200 ? split(rng, valor, rng.int(1, 3)) : [valor];
      const { chave, xml } = nfeProcXml({
        emitCnpj: company.cnpj,
        emitNome: company.name,
        destCnpj: dest,
        destNome: "Cliente Ficticio Ltda",
        data: date,
        numero,
        simples: p.regime === "simples",
        cfop: "5102",
        itens,
        cNF: rng.digits(8),
      });
      documents.push({
        file: `nfe-saida-${numero}.xml`,
        kind: "nfe",
        role: "saida",
        ref: chave,
        counterpart: dest,
        date,
        valor,
        xml,
      });
      ledger.push({ date, account: "receita", ref: chave, counterpart: dest, valor });
      bank.push({ date, valor, memo: `PIX RECEBIDO ${dest}`, fitid: `C${numero}` });
    } else {
      const toPerson = p.key === "clinica_presumido" && rng.next() < 0.7;
      const toma = toPerson ? rng.digits(11) : syntheticCnpj(rng);
      const withholds =
        !toPerson && p.regime === "presumido" && rng.next() < (p.withheldShare ?? 0);
      const ret = withholds ? retencoesServico(valor, competencia) : undefined;
      if (ret) retidas.push(ret);
      const retido = ret ? ret.irrf + ret.csll + ret.pis + ret.cofins : 0;
      const xml = nfseXml({
        prestCnpj: company.cnpj,
        prestNome: company.name,
        tomaDoc: toma,
        tomaNome: toPerson ? "Paciente Ficticio" : "Tomador Ficticio Ltda",
        data: date,
        numero,
        valor,
        issRateBp: p.issRateBp ?? 0,
        retido,
        simples: p.regime === "simples",
        cTribNac: p.cTribNac ?? "010101",
        servico: p.service ?? "Servicos",
      });
      documents.push({
        file: `nfse-saida-${numero}.xml`,
        kind: "nfse",
        role: "saida",
        ref: String(numero),
        counterpart: toma,
        date,
        valor,
        retencoes: ret,
        xml,
      });
      ledger.push({ date, account: "receita", ref: String(numero), counterpart: toma, valor });
      bank.push({ date, valor: valor - retido, memo: `TED RECEBIDA ${toma}`, fitid: `C${numero}` });
    }
  }

  // Purchases (goods) for commerce; a couple of taken services for service companies.
  const purchases =
    p.sells === "nfe"
      ? split(rng, Math.round(revenue * 0.55), rng.int(3, 6))
      : split(rng, Math.round(revenue * 0.05), rng.int(1, 2));
  for (const valor of purchases) {
    const date = day(competencia, rng.int(1, 28));
    const fornecedor = syntheticCnpj(rng);
    const n = rng.int(10_000, 99_999);
    if (p.sells === "nfe") {
      const { chave, xml } = nfeProcXml({
        emitCnpj: fornecedor,
        emitNome: "Fornecedor Ficticio Ltda",
        destCnpj: company.cnpj,
        destNome: company.name,
        data: date,
        numero: n,
        simples: false,
        cfop: "5102",
        itens: [valor],
        cNF: rng.digits(8),
      });
      documents.push({
        file: `nfe-entrada-${n}.xml`,
        kind: "nfe",
        role: "entrada",
        ref: chave,
        counterpart: fornecedor,
        date,
        valor,
        xml,
      });
      ledger.push({ date, account: "compras", ref: chave, counterpart: fornecedor, valor });
    } else {
      const xml = nfseXml({
        prestCnpj: fornecedor,
        prestNome: "Prestador Ficticio Ltda",
        tomaDoc: company.cnpj,
        tomaNome: company.name,
        data: date,
        numero: n,
        valor,
        issRateBp: 200,
        retido: 0,
        simples: true,
        cTribNac: "010701",
        servico: "Licenca de software",
      });
      documents.push({
        file: `nfse-entrada-${n}.xml`,
        kind: "nfse",
        role: "entrada",
        ref: String(n),
        counterpart: fornecedor,
        date,
        valor,
        xml,
      });
      ledger.push({
        date,
        account: "servicos_tomados",
        ref: String(n),
        counterpart: fornecedor,
        valor,
      });
    }
    bank.push({ date, valor: -valor, memo: `PAGAMENTO ${fornecedor}`, fitid: `D${n}` });
  }
  bank.push({
    date: day(competencia, 5),
    valor: -Math.round(revenue * company.payrollRatio),
    memo: "FOLHA DE PAGAMENTO",
    fitid: `F${competencia}`,
  });
  bank.sort((a, b) => a.date.localeCompare(b.date) || a.fitid.localeCompare(b.fitid));

  const ret = somarRetencoes(retidas);
  const expected: Expected = { revenue, retencoes: ret };
  const priorRev = prior.map((m) => m.revenue);
  const last12 = [...company.history, ...priorRev].slice(-12);
  if (p.regime === "simples") {
    const rbt12 = last12.reduce((a, b) => a + b, 0);
    const rba = company.yearToDate + priorRev.reduce((a, b) => a + b, 0) + revenue;
    const payroll12 = Math.round(rbt12 * company.payrollRatio);
    expected.rbt12 = rbt12;
    expected.das = calculateDas({
      revenue,
      rbt12,
      annex: p.annex as Annex | "FATOR_R",
      payroll12,
      rba,
      rbaa: company.rbaa,
    });
  } else {
    const activity = p.activity ?? "servicos_geral";
    expected.presumidoMes = apurarMesPresumido({
      competencia,
      receitas: [{ activity, receitaBruta: revenue }],
      retencoes: { irrf: 0, csll: 0, pis: ret.pis, cofins: ret.cofins },
      issRateBp: p.sells === "nfse" ? p.issRateBp : 0,
    });
    if (/-(03|06|09|12)$/.test(competencia) && prior.length >= 2) {
      const quarter = [...priorRev.slice(-2), revenue].reduce((a, b) => a + b, 0);
      const q = somarRetencoes([...prior.slice(-2).map((m) => m.retencoes), ret]);
      expected.presumidoTrimestre = apurarTrimestrePresumido({
        competenciaFim: competencia,
        receitas: [{ activity, receitaBruta: quarter }],
        retencoes: { irrf: q.irrf, csll: q.csll, pis: 0, cofins: 0 },
      });
    }
  }
  return { competencia, documents, bank, ledger, expected };
}
