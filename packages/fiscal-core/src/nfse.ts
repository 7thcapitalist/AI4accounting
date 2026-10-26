import { XMLParser } from "fast-xml-parser";
import { normalizeCnpj } from "./cnpj";
import { parseCentavos } from "./money";
import {
  type NfseDocument,
  NfseParseError,
  type NfseParty,
  type NfseRetencaoIss,
  type NfseTribIssqn,
  type NfseTributacaoIss,
  type NfseVersao,
} from "./nfse-types";
import type { Centavos } from "./types";

/**
 * Source: Sistema Nacional NFS-e (gov.br/nfse, "Documentação Atual"), XSD packages 1.00 and 1.01
 * (nfse-esquemas_xsd-v1-01-20260209.zip: Schemas/1.00 and Schemas/1.01; NFSe_vX.xsd, tiposComplexos_vX.xsd,
 * tiposSimples_vX.xsd). Supported `versao`: "1.00" and "1.01". Paths read: NFSe/infNFSe (nNFSe,
 * cLocIncid, valores, emit) wrapping DPS/infDPS (dhEmi, dCompet, cLocEmi, prest, toma, serv, valores).
 *
 * Official definitions (TSTipoRetISSQN, identical in 1.00 and 1.01): "Tipo de retencao do ISSQN:
 * 1 - Não Retido; 2 - Retido pelo Tomador; 3 - Retido pelo Intermediario;".
 * TSTribISSQN differs between versions:
 *   1.00: "1 - Operação tributável; 2 - Exportação de serviço; 3 - Não Incidência; 4 - Imunidade;"
 *   1.01: "1 - Operação tributável; 2 - Imunidade; 3 - Exportação de serviço; 4 - Não Incidência;"
 * infDPS/prest/xNome is optional (TCInfoPrestador); NFSe/infNFSe/emit/xNome is required.
 */

const TRIBUTACAO: Record<NfseVersao, Record<NfseTribIssqn, NfseTributacaoIss>> = {
  "1.00": { "1": "tributavel", "2": "exportacao", "3": "nao_incidencia", "4": "imunidade" },
  "1.01": { "1": "tributavel", "2": "imunidade", "3": "exportacao", "4": "nao_incidencia" },
};

type Obj = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // keep values as strings so amounts never go through floats
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  processEntities: false, // untrusted XML: no entity expansion
});

function parseXml(xml: string): Obj {
  try {
    if (xml.trim() === "") throw new Error("empty document");
    const root = parser.parse(xml, true) as unknown;
    if (typeof root !== "object" || root === null) throw new Error("no root element");
    return root as Obj;
  } catch (e) {
    throw new NfseParseError("invalid_xml", `Malformed NFS-e XML: ${(e as Error).message}`);
  }
}

function obj(parent: Obj | undefined, key: string, path: string, required = true): Obj | undefined {
  const v = parent?.[key];
  if (v === undefined) {
    if (required) throw new NfseParseError("missing_field", `Missing element ${path}/${key}`);
    return undefined;
  }
  if (typeof v !== "object" || v === null) {
    throw new NfseParseError("invalid_field", `Element ${path}/${key} has no children`);
  }
  return v as Obj;
}

function text(parent: Obj | undefined, key: string, path: string): string;
function text(
  parent: Obj | undefined,
  key: string,
  path: string,
  required: false,
): string | undefined;
function text(parent: Obj | undefined, key: string, path: string, required = true) {
  const v = parent?.[key];
  if (typeof v === "string" && v !== "") return v;
  if (required) throw new NfseParseError("missing_field", `Missing value ${path}/${key}`);
  return undefined;
}

function money(parent: Obj | undefined, key: string, path: string): Centavos;
function money(
  parent: Obj | undefined,
  key: string,
  path: string,
  required: false,
): Centavos | undefined;
function money(parent: Obj | undefined, key: string, path: string, required = true) {
  const raw = required ? text(parent, key, path) : text(parent, key, path, false);
  if (raw === undefined) return undefined;
  try {
    return parseCentavos(raw);
  } catch (e) {
    throw new NfseParseError("invalid_field", `${path}/${key}: ${(e as Error).message}`);
  }
}

function party(p: Obj | undefined, path: string, xNomeRequired = true): NfseParty {
  const cnpj = text(p, "CNPJ", path, false);
  const cpf = text(p, "CPF", path, false);
  return {
    ...(cnpj ? { cnpj: normalizeCnpj(cnpj) } : {}),
    ...(cpf ? { cpf } : {}),
    ...(xNomeRequired
      ? { xNome: text(p, "xNome", path) }
      : text(p, "xNome", path, false) !== undefined
        ? { xNome: text(p, "xNome", path, false) }
        : {}),
  };
}

export interface ParseNfseOptions {
  /** CNPJ of the client company. Decides issued (saida) vs taken (entrada). */
  clientCnpj: string;
}

/**
 * Parses a national-standard NFS-e, layout 1.00 or 1.01 (`NFSe` root, as returned by the ADN) into a `NfseDocument`.
 * Cancelled notes are not detectable from this XML (cancellation is an event); status is "completo".
 */
export function parseNfse(xml: string, options: ParseNfseOptions): NfseDocument {
  const root = parseXml(xml);
  const nfse = obj(root, "NFSe", "", false);
  if (!nfse) throw new NfseParseError("unsupported_layout", "Root element must be NFSe");
  const versao = text(nfse, "@_versao", "NFSe", false);
  if (versao !== "1.00" && versao !== "1.01") {
    throw new NfseParseError(
      "unsupported_layout",
      `NFSe/@versao must be "1.00" or "1.01": ${JSON.stringify(versao)}`,
    );
  }
  const inf = obj(nfse, "infNFSe", "NFSe");
  const dps = obj(inf, "DPS", "infNFSe");
  const dpsVersao = text(dps, "@_versao", "infNFSe/DPS", false);
  if (dpsVersao !== undefined && dpsVersao !== versao) {
    throw new NfseParseError(
      "invalid_field",
      `DPS/@versao "${dpsVersao}" differs from NFSe/@versao "${versao}"`,
    );
  }
  const infDps = obj(dps, "infDPS", "DPS");
  const p = "infNFSe/DPS/infDPS";

  const id = text(inf, "@_Id", "infNFSe", false);
  const chave = id?.replace(/^NFS/, "");
  if (chave !== undefined && !/^\d{50}$/.test(chave)) {
    throw new NfseParseError("invalid_field", `infNFSe/@Id is not NFS + 50 digits: "${id}"`);
  }

  const prest = obj(infDps, "prest", p);
  const prestador = party(prest, `${p}/prest`, false);
  if (!prestador.cnpj) throw new NfseParseError("missing_field", `Missing ${p}/prest/CNPJ`);
  if (prestador.xNome === undefined) {
    // infNFSe/emit is the issuer generated by the Sistema Nacional; use its name only for the same CNPJ.
    const emit = obj(inf, "emit", "infNFSe", false);
    const emitCnpj = text(emit, "CNPJ", "infNFSe/emit", false);
    const emitNome = text(emit, "xNome", "infNFSe/emit", false);
    if (
      emitNome !== undefined &&
      emitCnpj !== undefined &&
      normalizeCnpj(emitCnpj) === prestador.cnpj
    ) {
      prestador.xNome = emitNome;
    }
  }
  const toma = obj(infDps, "toma", p, false);
  const tomador = toma && party(toma, `${p}/toma`);

  const client = normalizeCnpj(options.clientCnpj);
  const role =
    client === prestador.cnpj ? "saida" : client === tomador?.cnpj ? "entrada" : undefined;
  if (!role) {
    throw new NfseParseError("invalid_field", "clientCnpj is neither prestador nor tomador");
  }

  const dhEmi = text(infDps, "dhEmi", p);
  if (!/^\d{4}-\d{2}-\d{2}/.test(dhEmi)) {
    throw new NfseParseError("invalid_field", `${p}/dhEmi is not ISO 8601: "${dhEmi}"`);
  }
  const dCompet = text(infDps, "dCompet", p);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dCompet)) {
    throw new NfseParseError("invalid_field", `${p}/dCompet is not YYYY-MM-DD: "${dCompet}"`);
  }

  const serv = obj(infDps, "serv", p);
  const cServ = obj(serv, "cServ", `${p}/serv`);
  const cTribNac = text(cServ, "cTribNac", `${p}/serv/cServ`);
  if (!/^\d{6}$/.test(cTribNac)) {
    throw new NfseParseError("invalid_field", `cTribNac must have 6 digits: "${cTribNac}"`);
  }

  const dpsValores = obj(infDps, "valores", p);
  const vServ = money(
    obj(dpsValores, "vServPrest", `${p}/valores`),
    "vServ",
    `${p}/valores/vServPrest`,
  );
  const tribMun = obj(obj(dpsValores, "trib", `${p}/valores`), "tribMun", `${p}/valores/trib`);
  const trib = text(tribMun, "tribISSQN", `${p}/valores/trib/tribMun`);
  if (trib !== "1" && trib !== "2" && trib !== "3" && trib !== "4") {
    throw new NfseParseError("invalid_field", `tribISSQN must be 1 to 4: "${trib}"`);
  }
  const tp = text(tribMun, "tpRetISSQN", `${p}/valores/trib/tribMun`);
  if (tp !== "1" && tp !== "2" && tp !== "3") {
    throw new NfseParseError("invalid_field", `tpRetISSQN must be 1, 2 or 3: "${tp}"`);
  }

  const nfseValores = obj(inf, "valores", "infNFSe", false);
  const vBC = money(nfseValores, "vBC", "infNFSe/valores", false);
  const pAliqAplic = text(nfseValores, "pAliqAplic", "infNFSe/valores", false);
  const vISSQN = money(nfseValores, "vISSQN", "infNFSe/valores", false);
  const vTotalRet = money(nfseValores, "vTotalRet", "infNFSe/valores", false);
  const vLiq = money(nfseValores, "vLiq", "infNFSe/valores", false);
  const cLocIncid = text(inf, "cLocIncid", "infNFSe", false);
  const municipioIbge = text(infDps, "cLocEmi", p, false);
  const tomaCnpj = tomador?.cnpj;

  return {
    kind: "nfse",
    versao,
    role,
    status: "completo",
    ...(chave ? { chave } : {}),
    emitenteCnpj: prestador.cnpj,
    ...(tomaCnpj ? { destinatarioCnpj: tomaCnpj } : {}),
    emissao: dhEmi.slice(0, 10),
    competencia: dCompet.slice(0, 7),
    valorTotal: vServ,
    numero: text(inf, "nNFSe", "infNFSe"),
    dhEmi,
    prestador: { ...prestador, ...(municipioIbge ? { municipioIbge } : {}) },
    ...(tomador ? { tomador } : {}),
    servico: {
      cTribNac,
      cLocPrestacao: text(
        obj(serv, "locPrest", `${p}/serv`),
        "cLocPrestacao",
        `${p}/serv/locPrest`,
      ),
      ...(cLocIncid ? { cLocIncid } : {}),
      xDescServ: text(cServ, "xDescServ", `${p}/serv/cServ`),
    },
    valores: {
      vServ,
      ...(vBC !== undefined ? { vBC } : {}),
      ...(pAliqAplic ? { pAliqAplic } : {}),
      ...(vISSQN !== undefined ? { vISSQN } : {}),
      ...(vTotalRet !== undefined ? { vTotalRet } : {}),
      ...(vLiq !== undefined ? { vLiq } : {}),
    },
    iss: {
      tribISSQN: trib,
      tributacao: TRIBUTACAO[versao][trib],
      tpRetISSQN: tp as NfseRetencaoIss,
      retido: tp !== "1",
    },
  };
}
