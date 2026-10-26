import type { Centavos, FiscalDocument } from "./types";

/** Thrown for malformed, unsupported or non-authorized NF-e XML. `code` is stable for callers. */
export class NfeParseError extends Error {
  constructor(
    readonly code:
      | "invalid_xml"
      | "unsupported_layout"
      | "missing_field"
      | "invalid_field"
      | "not_authorized"
      | "event_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "NfeParseError";
  }
}

export interface NfeIcms {
  /** Origem da mercadoria (0-8). */
  orig: string;
  /** Regime normal (CST, 2 digits). Exactly one of cst / csosn is set. */
  cst?: string;
  /** Simples Nacional (CSOSN, 3 digits). */
  csosn?: string;
  vBC?: Centavos;
  vICMS?: Centavos;
  /** Substituicao tributaria charged on this item (vBCST / vICMSST). Absent = no ST. */
  st?: { vBC: Centavos; vICMS: Centavos };
  /** ST already withheld earlier in the chain (vBCSTRet / vICMSSTRet; CST 60, CSOSN 500). */
  stRetido?: { vBC: Centavos; vICMS: Centavos };
}

/** IBS/CBS group of the tax reform (item level). Optional in the XML. */
export interface NfeIbsCbs {
  cst: string;
  cClassTrib: string;
  vBC?: Centavos;
  vIBS?: Centavos;
  vCBS?: Centavos;
}

export interface NfeItem {
  nItem: number;
  cProd: string;
  xProd: string;
  ncm: string;
  cfop: string;
  uCom: string;
  /** Decimal string as written in the XML (up to 4 decimals): quantities are not money. */
  qCom: string;
  vUnCom: string;
  vProd: Centavos;
  vDesc: Centavos;
  icms: NfeIcms;
  ibsCbs?: NfeIbsCbs;
}

export interface NfeTotals {
  vBC: Centavos;
  vICMS: Centavos;
  vBCST: Centavos;
  vST: Centavos;
  vProd: Centavos;
  vFrete: Centavos;
  vSeg: Centavos;
  vDesc: Centavos;
  vOutro: Centavos;
  vNF: Centavos;
  /** Present only when the note carries ICMSTot-level IBS/CBS (IBSCBSTot). */
  ibsCbs?: { vBC: Centavos; vIBS: Centavos; vCBS: Centavos };
}

export interface NfeParty {
  /** 14 chars (CNPJ), or undefined for CPF / foreign recipients. */
  cnpj?: string;
  cpf?: string;
  xNome: string;
  uf?: string;
}

export interface NfeProtocol {
  chave: string;
  /** 100 = authorized, 150 = authorized outside the deadline. */
  cStat: string;
  nProt: string;
  dhRecbto: string;
}

export interface NfeDocument extends FiscalDocument {
  kind: "nfe";
  chave: string;
  ide: {
    serie: string;
    numero: string;
    /** dhEmi exactly as written (ISO 8601 with offset). */
    dhEmi: string;
    /** 0 = entrada, 1 = saida, from the issuer's point of view. */
    tpNF: string;
    finNFe: string;
    natOp: string;
  };
  emitente: NfeParty & { cnpj: string /** Codigo de Regime Tributario. */; crt?: string };
  destinatario?: NfeParty;
  itens: NfeItem[];
  totais: NfeTotals;
  protocolo: NfeProtocol;
}

/** Cancellation event (procEventoNFe, tpEvento 110111) linked to a note by chave. */
export interface NfeCancelEvent {
  chave: string;
  /** nProt of the authorization being cancelled (detEvento/nProt). */
  nProtCancelado: string;
  /** Protocol of the event itself (retEvento). */
  nProtEvento: string;
  cStat: string;
  dhEvento: string;
}
