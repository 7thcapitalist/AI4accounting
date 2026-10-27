import { type Centavos, parseNfeProc, parseNfse } from "@ai4a/fiscal-core";

/** A fiscal document reduced to what reconciliation needs. */
export interface DocFact {
  key: string;
  kind: "nfe" | "nfse";
  role: "saida" | "entrada";
  date: string;
  counterpart: string;
  valor: Centavos;
  /** Withholdings the payer keeps (NFS-e vTotalRet): the bank moves valor - retained. */
  retained: Centavos;
  /** NF-e with a cancellation protocol (cStat 101): fiscal-core refuses it, we still need its chave. */
  cancelled?: boolean;
}

export interface LedgerEntry {
  date: string;
  account: string;
  ref: string;
  counterpart: string;
  valor: Centavos;
}

export interface BankEntry {
  date: string;
  /** Positive = credit, negative = debit. */
  valor: Centavos;
  memo: string;
  fitid: string;
}

/** "1234.56" or "-1234.56" to centavos, without going through a float. */
export function toCentavos(s: string): Centavos {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error(`invalid amount: ${JSON.stringify(s)}`);
  const c = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -c : c;
}

/** OFX 1.02 (SGML): fields have no closing tag, a transaction runs from <STMTTRN> to </STMTTRN>. */
export function parseOfx(text: string): BankEntry[] {
  const out: BankEntry[] = [];
  for (const tx of text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g)) {
    const f: Record<string, string> = {};
    for (const m of (tx[1] ?? "").matchAll(/<(\w+)>([^<\r\n]*)/g))
      f[m[1] ?? ""] = (m[2] ?? "").trim();
    const d = f.DTPOSTED ?? "";
    out.push({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      valor: toCentavos(f.TRNAMT ?? ""),
      memo: f.MEMO ?? "",
      fitid: f.FITID ?? "",
    });
  }
  return out;
}

/** ERP export: `data;conta;documento;contraparte;valor`, "." decimals. */
export function parseLedgerCsv(text: string): LedgerEntry[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [date = "", account = "", ref = "", counterpart = "", valor = ""] = l.split(";");
      return { date, account, ref, counterpart, valor: toCentavos(valor) };
    });
}

/** Parses an NF-e or NFS-e with the fiscal-core parsers; null when the file is not usable. */
export function parseDocFact(
  kind: "nfe" | "nfse",
  xml: string,
  clientCnpj: string,
): DocFact | null {
  try {
    if (kind === "nfe") {
      const d = parseNfeProc(xml, { clientCnpj });
      const other = d.role === "saida" ? d.destinatario : d.emitente;
      return {
        key: d.chave,
        kind,
        role: d.role,
        date: d.emissao,
        counterpart: other?.cnpj ?? other?.cpf ?? "",
        valor: d.valorTotal,
        retained: 0,
      };
    }
    const d = parseNfse(xml, { clientCnpj });
    const other = d.role === "saida" ? d.tomador : d.prestador;
    return {
      key: d.numero,
      kind,
      role: d.role,
      date: d.emissao,
      counterpart: other?.cnpj ?? other?.cpf ?? "",
      valor: d.valorTotal,
      retained: d.valores.vTotalRet ?? 0,
    };
  } catch {
    return kind === "nfe" ? cancelledNfe(xml, clientCnpj) : null;
  }
}

/** Cancelled NF-e (NT 2011/001, cStat 101): fiscal-core rejects it, so read the chave and total by hand. */
function cancelledNfe(xml: string, clientCnpj: string): DocFact | null {
  if (!/<cStat>101<\/cStat>/.test(xml)) return null;
  const key = /<chNFe>(\d{44})<\/chNFe>/.exec(xml)?.[1];
  const vNF = /<vNF>([\d.]+)<\/vNF>/.exec(xml)?.[1];
  if (!key || !vNF) return null;
  return {
    key,
    kind: "nfe",
    role: /<emit><CNPJ>(\d{14})</.exec(xml)?.[1] === clientCnpj ? "saida" : "entrada",
    date: /<dhEmi>(\d{4}-\d{2}-\d{2})/.exec(xml)?.[1] ?? "",
    counterpart: "",
    valor: toCentavos(vNF),
    retained: 0,
    cancelled: true,
  };
}
