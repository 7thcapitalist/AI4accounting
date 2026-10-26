/** Electronic document family: goods invoice, freight, service invoice. */
export type DocumentKind = "nfe" | "cte" | "nfse";

/** Direction relative to the client company: received (entrada) or issued (saida). */
export type DocumentRole = "entrada" | "saida";

/** resumo = only the SEFAZ summary is known, completo = full XML, cancelado = cancelled. */
export type DocumentStatus = "resumo" | "completo" | "cancelado";

/** Integer centavos. Never a float. */
export type Centavos = number;

export interface FiscalDocument {
  kind: DocumentKind;
  role: DocumentRole;
  status: DocumentStatus;
  /** 44-digit chave de acesso (NF-e / CT-e). NFS-e may not have one. */
  chave?: string;
  /** Issuer CNPJ, 14 characters, no punctuation. */
  emitenteCnpj: string;
  /** Recipient CNPJ, 14 characters, no punctuation, when known. */
  destinatarioCnpj?: string;
  /** Issue date, ISO 8601 (YYYY-MM-DD). */
  emissao: string;
  /** Accrual period, YYYY-MM. */
  competencia: string;
  /** Document total in centavos. */
  valorTotal: Centavos;
}
