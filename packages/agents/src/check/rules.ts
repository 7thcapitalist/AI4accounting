import {
  isValidCnpj,
  type NfeDocument,
  NfeParseError,
  type NfseDocument,
  NfseParseError,
  normalizeCnpj,
  parseNfeProc,
  parseNfse,
  retencoesServico,
} from "@ai4a/fiscal-core";

/** Error types the simulator plants that the Check agent owns (docs/ROADMAP.md 2.2 and 3.3). */
export type CheckErrorType =
  | "wrong_cfop"
  | "iss_not_withheld"
  | "other_company"
  | "duplicate"
  | "cancelled";

export interface CheckClient {
  /** 14 digits. */
  cnpj: string;
  regime: "simples" | "presumido" | string;
}

export interface CheckDoc {
  /** Row id or file name, used as the document reference of findings. */
  id: string;
  kind: "nfe" | "nfse";
  xml: string;
}

export interface BankEntry {
  /** Centavos; negative = debit. */
  valor: number;
  memo: string;
  fitid: string;
}

export interface CheckInput {
  client: CheckClient;
  /** YYYY-MM */
  month: string;
  docs: CheckDoc[];
  bank: BankEntry[];
}

export interface CheckFinding {
  ruleId: string;
  /** Planted error type this rule detects, when it has one (used by `pnpm eval`). */
  errorType?: CheckErrorType;
  severity: "info" | "warning" | "blocker";
  /** pt-BR, for the accountant. */
  message: string;
  /** Official source of the rule. */
  source: string;
  /** chave (NF-e) or number (NFS-e); the same convention as the simulator answer key. */
  ref: string;
  /** Id of the CheckDoc the finding points at. */
  docId: string;
}

// Official sources (never guessed; each rule has a test in check.test.ts).
const SRC = {
  cfop: "Ajuste SINIEF 07/2001 e Convenio s/n 1970 (tabela CFOP): 1/2/3 entrada, 5/6/7 saida; 5 dentro da UF, 6 fora da UF",
  csosn:
    "Manual de Orientacao do Contribuinte NF-e 4.00, grupo N (ICMS): CRT 1 e 2 usam CSOSN; CRT 3 usa CST",
  ncm: "Manual de Orientacao do Contribuinte NF-e 4.00, campo I05 (NCM): 8 digitos (Nomenclatura Comum do Mercosul)",
  iss: "LC 116/2003 art. 6 par. 2 (responsavel tributario) e leiaute NFS-e Padrao Nacional, tpRetISSQN",
  ret: "Lei 10.833/2003 art. 30 (CSRF 4,65%) e RIR/2018 (IRRF 1,5% sobre servicos)",
  cnpj: "Receita Federal: CNPJ do emitente/destinatario deve ser o do cliente (Ajuste SINIEF 07/2005, NF-e)",
  dup: "Ajuste SINIEF 07/2005: a chave de acesso identifica a NF-e de forma unica; NFS-e Padrao Nacional: numero + prestador",
  cancelled:
    "Manual de Orientacao do Contribuinte NF-e 4.00, tabela de status: cStat 101 = Cancelamento de NF-e homologado",
};

const VALID_CSOSN = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);

const issueRef = (xml: string, tag: string) =>
  new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml)?.[1];
const nfeChaveOf = (xml: string) => /Id="NFe(\d{44})"/.exec(xml)?.[1];

function checkNfe(c: CheckClient, doc: CheckDoc, d: NfeDocument, out: CheckFinding[]) {
  const mine = normalizeCnpj(c.cnpj);
  const base = { ref: d.chave, docId: doc.id };
  const issued = d.emitente.cnpj === mine;

  if (issued) {
    const wantOut = d.ide.tpNF === "1";
    for (const it of d.itens) {
      const dir = it.cfop[0];
      const inOk = dir === "1" || dir === "2" || dir === "3";
      const outOk = dir === "5" || dir === "6" || dir === "7";
      if (wantOut ? !outOk : !inOk) {
        out.push({
          ...base,
          ruleId: "CHECK-CFOP-DIRECAO",
          errorType: "wrong_cfop",
          severity: "warning",
          message: `Item ${it.nItem} da NF-e emitida usa CFOP ${it.cfop}, que e de ${wantOut ? "entrada" : "saida"} ao contrario da operacao`,
          source: SRC.cfop,
        });
        continue;
      }
      const ufE = d.emitente.uf;
      const ufD = d.destinatario?.uf;
      if (wantOut && ufE && ufD && (dir === "5") !== (ufE === ufD) && dir !== "7") {
        out.push({
          ...base,
          ruleId: "CHECK-CFOP-UF",
          errorType: "wrong_cfop",
          severity: "warning",
          message: `Item ${it.nItem}: CFOP ${it.cfop} nao combina com UF do emitente (${ufE}) e do destinatario (${ufD})`,
          source: SRC.cfop,
        });
      }
    }
    const simples = d.emitente.crt === "1" || d.emitente.crt === "2";
    for (const it of d.itens) {
      const bad = simples
        ? !it.icms.csosn || !VALID_CSOSN.has(it.icms.csosn)
        : d.emitente.crt === "3" && !it.icms.cst;
      if (bad) {
        out.push({
          ...base,
          ruleId: "CHECK-CSOSN",
          errorType: "wrong_cfop",
          severity: "warning",
          message: simples
            ? `Item ${it.nItem}: emitente do Simples (CRT ${d.emitente.crt}) deve usar CSOSN valido, nao CST`
            : `Item ${it.nItem}: emitente do regime normal (CRT 3) deve usar CST`,
          source: SRC.csosn,
        });
      }
    }
  }
  for (const it of d.itens) {
    if (!/^\d{8}$/.test(it.ncm) && it.ncm !== "00") {
      out.push({
        ...base,
        ruleId: "CHECK-NCM-FORMATO",
        severity: "warning",
        message: `Item ${it.nItem}: NCM "${it.ncm}" nao tem 8 digitos`,
        source: SRC.ncm,
      });
    }
  }
}

function checkNfseIssued(c: CheckClient, doc: CheckDoc, d: NfseDocument, out: CheckFinding[]) {
  if (c.regime !== "presumido" || !d.tomador?.cnpj) return;
  const expected = retencoesServico(d.valores.vServ, d.competencia);
  const total = expected.irrf + expected.csll + expected.pis + expected.cofins;
  const stated = d.valores.vTotalRet ?? 0;
  const base = { ref: d.numero, docId: doc.id, source: SRC.ret };
  if (stated > 0 && stated !== total) {
    out.push({
      ...base,
      ruleId: "CHECK-RETENCAO-FEDERAL",
      severity: "warning",
      message: `NFS-e ${d.numero}: retencao federal informada difere de IRRF 1,5% + CSRF 4,65% sobre o servico (esperado ${total} centavos, informado ${stated})`,
    });
  } else if (stated === 0 && d.servico.cTribNac.startsWith("04")) {
    out.push({
      ...base,
      ruleId: "CHECK-RETENCAO-FEDERAL",
      severity: "info",
      message: `NFS-e ${d.numero}: servico de saude para tomador pessoa juridica sem retencao de IRRF/CSRF; confirme se o tomador (ex.: operadora de plano de saude) deve reter`,
    });
  }
}

function checkNfseTaken(input: CheckInput, doc: CheckDoc, d: NfseDocument, out: CheckFinding[]) {
  if (!d.iss.retido || !d.valores.vISSQN) return;
  const prest = d.prestador.cnpj;
  const paidGross = input.bank.find(
    (b) => b.valor < 0 && -b.valor === d.valores.vServ && !!prest && b.memo.includes(prest),
  );
  if (paidGross) {
    out.push({
      ruleId: "CHECK-ISS-RETIDO",
      errorType: "iss_not_withheld",
      severity: "blocker",
      message: `NFS-e ${d.numero} tomada com ISS retido (${d.valores.vISSQN} centavos), mas o pagamento ${paidGross.fitid} saiu pelo valor integral`,
      source: SRC.iss,
      ref: d.numero,
      docId: doc.id,
    });
  }
}

/** Runs every rule over one client-month. Pure and deterministic: no LLM, no I/O. */
export function runChecks(input: CheckInput): CheckFinding[] {
  const out: CheckFinding[] = [];
  const mine = normalizeCnpj(input.client.cnpj);
  const seen = new Map<string, CheckDoc>();
  const reported = new Set<string>();
  const dup = (ref: string, doc: CheckDoc) => {
    if (!seen.has(ref)) {
      seen.set(ref, doc);
      return;
    }
    if (reported.has(ref)) return;
    reported.add(ref);
    out.push({
      ruleId: "CHECK-DUPLICADO",
      errorType: "duplicate",
      severity: "warning",
      message: `Documento ${ref} aparece mais de uma vez no mes`,
      source: SRC.dup,
      ref,
      docId: doc.id,
    });
  };
  const foreign = (ref: string, doc: CheckDoc) =>
    out.push({
      ruleId: "CHECK-OUTRO-CNPJ",
      errorType: "other_company",
      severity: "blocker",
      message: `Documento ${ref} nao pertence ao cliente (CNPJ do cliente nao e emitente nem destinatario)`,
      source: SRC.cnpj,
      ref,
      docId: doc.id,
    });

  if (!isValidCnpj(mine)) return out;
  for (const doc of input.docs) {
    if (doc.kind === "nfe") {
      let d: NfeDocument;
      try {
        d = parseNfeProc(doc.xml);
      } catch (e) {
        const chave = nfeChaveOf(doc.xml);
        if (e instanceof NfeParseError && e.code === "not_authorized" && chave) {
          dup(chave, doc);
          out.push({
            ruleId: "CHECK-CANCELADA",
            errorType: "cancelled",
            severity: "blocker",
            message: `NF-e ${chave} cancelada/nao autorizada (${e.message}) e ainda presente nos documentos do mes`,
            source: SRC.cancelled,
            ref: chave,
            docId: doc.id,
          });
        } else {
          out.push({
            ruleId: "CHECK-ILEGIVEL",
            severity: "warning",
            message: `Nao foi possivel ler a NF-e ${doc.id}: ${(e as Error).message}`,
            source: SRC.dup,
            ref: chave ?? doc.id,
            docId: doc.id,
          });
        }
        continue;
      }
      dup(d.chave, doc);
      if (d.emitente.cnpj !== mine && normalizeCnpj(d.destinatario?.cnpj ?? "") !== mine) {
        foreign(d.chave, doc);
        continue;
      }
      checkNfe(input.client, doc, d, out);
    } else {
      let d: NfseDocument;
      try {
        d = parseNfse(doc.xml, { clientCnpj: mine });
      } catch (e) {
        const numero = issueRef(doc.xml, "nNFSe") ?? doc.id;
        if (e instanceof NfseParseError && /neither/.test(e.message)) {
          dup(numero, doc);
          foreign(numero, doc);
        } else {
          out.push({
            ruleId: "CHECK-ILEGIVEL",
            severity: "warning",
            message: `Nao foi possivel ler a NFS-e ${doc.id}: ${(e as Error).message}`,
            source: SRC.dup,
            ref: numero,
            docId: doc.id,
          });
        }
        continue;
      }
      dup(d.numero, doc);
      if (d.role === "saida") checkNfseIssued(input.client, doc, d, out);
      else checkNfseTaken(input, doc, d, out);
    }
  }
  return out;
}
