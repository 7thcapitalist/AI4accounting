import type { Centavos, FiscalDocument } from "./types";

/** Thrown for malformed or unsupported NFS-e XML. `code` is stable for callers. */
export class NfseParseError extends Error {
  constructor(
    readonly code: "invalid_xml" | "unsupported_layout" | "missing_field" | "invalid_field",
    message: string,
  ) {
    super(message);
    this.name = "NfseParseError";
  }
}

export interface NfseParty {
  /** 14 characters, no punctuation. Exactly one of cnpj / cpf is set (tomador may have neither). */
  cnpj?: string;
  cpf?: string;
  /** Required for the tomador. Optional for the prestador (infDPS/prest/xNome is optional in the XSDs). */
  xNome?: string;
}

/** Layout versions (`versao` of NFSe/DPS) accepted by `parseNfse`; the official XSDs 1.00 and 1.01. */
export type NfseVersao = "1.00" | "1.01";

/** tribISSQN code as defined by the XSD: 1 to 4. Its meaning depends on `NfseVersao`. */
export type NfseTribIssqn = "1" | "2" | "3" | "4";

export type NfseTributacaoIss = "tributavel" | "imunidade" | "exportacao" | "nao_incidencia";

/** tpRetISSQN: 1 = not withheld, 2 = withheld by the tomador, 3 = withheld by the intermediary. */
export type NfseRetencaoIss = "1" | "2" | "3";

export interface NfseDocument extends FiscalDocument {
  kind: "nfse";
  /** `versao` of the NFSe root, validated against the supported layouts. */
  versao: NfseVersao;
  /** Id of infNFSe without the "NFS" prefix (50 digits), when present. */
  chave?: string;
  /** nNFSe: number assigned by the Sistema Nacional. */
  numero: string;
  /** DPS dhEmi, as sent. */
  dhEmi: string;
  prestador: NfseParty & { municipioIbge?: string };
  tomador?: NfseParty;
  servico: {
    /** cTribNac: 6 digits, item/subitem/desdobro of the national list (LC 116/2003). */
    cTribNac: string;
    /** cLocPrestacao: IBGE code of the municipality where the service was rendered. */
    cLocPrestacao: string;
    /** cLocIncid: IBGE code of the municipality where ISS is due, when the NFS-e carries it. */
    cLocIncid?: string;
    xDescServ: string;
  };
  valores: {
    vServ: Centavos;
    /** vBC of the NFS-e (ISS calculation base). */
    vBC?: Centavos;
    /** pAliqAplic as the XML string (percent), e.g. "2.00". */
    pAliqAplic?: string;
    /** vISSQN. Absent when the NFS-e does not state it. */
    vISSQN?: Centavos;
    /** vTotalRet: sum of retentions stated by the NFS-e. */
    vTotalRet?: Centavos;
    vLiq?: Centavos;
  };
  iss: {
    /** tribISSQN as in the XML. 1.00: 1 taxable, 2 export, 3 not incident, 4 immunity. 1.01: 1 taxable, 2 immunity, 3 export, 4 not incident. */
    tribISSQN: NfseTribIssqn;
    /** tribISSQN meaning resolved for the document's `versao`. */
    tributacao: NfseTributacaoIss;
    tpRetISSQN: NfseRetencaoIss;
    /** True when tpRetISSQN is 2 or 3. */
    retido: boolean;
  };
}
