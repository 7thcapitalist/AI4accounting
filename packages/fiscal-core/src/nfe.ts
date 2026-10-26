import { XMLParser } from "fast-xml-parser";
import { isValidChave, parseChave } from "./chave";
import { normalizeCnpj } from "./cnpj";
import { parseCentavos } from "./money";
import {
  type NfeCancelEvent,
  type NfeDocument,
  type NfeIbsCbs,
  type NfeIcms,
  type NfeItem,
  NfeParseError,
  type NfeParty,
  type NfeTotals,
} from "./nfe-types";
import type { Centavos } from "./types";

/**
 * Sources: Manual de Orientacao do Contribuinte NF-e (MOC) 7.0, layout 4.00, "nfeProc",
 * "infNFe", "det/imposto/ICMS", "total/ICMSTot", "protNFe" and "procEventoNFe" (evento de
 * cancelamento 110111). IBS/CBS groups follow NT 2025.002 (Reforma Tributaria, grupos UB e
 * W03). The IBS/CBS field names were NOT checked against the official PDF (only third-party
 * summaries were reachable) and must be verified before relying on them.
 */

type Obj = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // keep every value a string so amounts never go through floats
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  processEntities: false, // no entity expansion: untrusted XML
  isArray: (name) => name === "det",
});

function parseXml(xml: string): Obj {
  try {
    if (xml.trim() === "") throw new Error("empty document");
    const root = parser.parse(xml, true) as unknown;
    if (typeof root !== "object" || root === null) throw new Error("no root element");
    return root as Obj;
  } catch (e) {
    throw new NfeParseError("invalid_xml", `Malformed NF-e XML: ${(e as Error).message}`);
  }
}

function obj(parent: Obj | undefined, key: string, path: string, required = true): Obj | undefined {
  const v = parent?.[key];
  if (v === undefined) {
    if (required) throw new NfeParseError("missing_field", `Missing element ${path}/${key}`);
    return undefined;
  }
  if (typeof v !== "object" || v === null) {
    throw new NfeParseError("invalid_field", `Element ${path}/${key} has no children`);
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
  if (required) throw new NfeParseError("missing_field", `Missing value ${path}/${key}`);
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
    throw new NfeParseError("invalid_field", `${path}/${key}: ${(e as Error).message}`);
  }
}

function party(p: Obj, path: string): NfeParty {
  const cnpj = text(p, "CNPJ", path, false);
  return {
    ...(cnpj ? { cnpj: normalizeCnpj(cnpj) } : {}),
    ...(text(p, "CPF", path, false) ? { cpf: text(p, "CPF", path, false) } : {}),
    xNome: text(p, "xNome", path),
  };
}

function parseIcms(imposto: Obj | undefined, path: string): NfeIcms {
  const icms = obj(imposto, "ICMS", path);
  // The ICMS element holds exactly one variant: ICMS00, ICMS10, ..., ICMSSN101, ...
  const variant = Object.keys(icms ?? {})[0];
  const g = obj(icms, variant ?? "", `${path}/ICMS`);
  const ip = `${path}/ICMS/${variant}`;
  const cst = text(g, "CST", ip, false);
  const csosn = text(g, "CSOSN", ip, false);
  if (!cst === !csosn) {
    throw new NfeParseError("invalid_field", `${ip} must have exactly one of CST or CSOSN`);
  }
  const pair = (b: string, v: string) => {
    const bc = money(g, b, ip, false);
    const val = money(g, v, ip, false);
    return bc === undefined && val === undefined ? undefined : { vBC: bc ?? 0, vICMS: val ?? 0 };
  };
  const st = pair("vBCST", "vICMSST");
  const stRetido = pair("vBCSTRet", "vICMSSTRet");
  const vBC = money(g, "vBC", ip, false);
  const vICMS = money(g, "vICMS", ip, false);
  return {
    orig: text(g, "orig", ip),
    ...(cst ? { cst } : {}),
    ...(csosn ? { csosn } : {}),
    ...(vBC !== undefined ? { vBC } : {}),
    ...(vICMS !== undefined ? { vICMS } : {}),
    ...(st ? { st } : {}),
    ...(stRetido ? { stRetido } : {}),
  };
}

function parseIbsCbs(imposto: Obj | undefined, path: string): NfeIbsCbs | undefined {
  const g = obj(imposto, "IBSCBS", path, false);
  if (!g) return undefined;
  const ip = `${path}/IBSCBS`;
  const gg = obj(g, "gIBSCBS", ip, false);
  const vBC = money(gg, "vBC", `${ip}/gIBSCBS`, false);
  const vIBS = money(gg, "vIBS", `${ip}/gIBSCBS`, false);
  const vCBS = money(obj(gg, "gCBS", `${ip}/gIBSCBS`, false), "vCBS", `${ip}/gIBSCBS/gCBS`, false);
  return {
    cst: text(g, "CST", ip),
    cClassTrib: text(g, "cClassTrib", ip),
    ...(vBC !== undefined ? { vBC } : {}),
    ...(vIBS !== undefined ? { vIBS } : {}),
    ...(vCBS !== undefined ? { vCBS } : {}),
  };
}

function parseItem(det: Obj, index: number): NfeItem {
  const path = `det[${index}]`;
  const prod = obj(det, "prod", path);
  const imposto = obj(det, "imposto", path);
  const ibsCbs = parseIbsCbs(imposto, `${path}/imposto`);
  return {
    nItem: Number(det["@_nItem"] ?? index + 1),
    cProd: text(prod, "cProd", `${path}/prod`),
    xProd: text(prod, "xProd", `${path}/prod`),
    ncm: text(prod, "NCM", `${path}/prod`),
    cfop: text(prod, "CFOP", `${path}/prod`),
    uCom: text(prod, "uCom", `${path}/prod`),
    qCom: text(prod, "qCom", `${path}/prod`),
    vUnCom: text(prod, "vUnCom", `${path}/prod`),
    vProd: money(prod, "vProd", `${path}/prod`),
    vDesc: money(prod, "vDesc", `${path}/prod`, false) ?? 0,
    icms: parseIcms(imposto, `${path}/imposto`),
    ...(ibsCbs ? { ibsCbs } : {}),
  };
}

function parseTotals(total: Obj | undefined): NfeTotals {
  const t = obj(total, "ICMSTot", "total");
  const p = "total/ICMSTot";
  const tot = obj(total, "IBSCBSTot", "total", false);
  const ibsCbs = tot && {
    vBC: money(tot, "vBCIBSCBS", "total/IBSCBSTot", false) ?? 0,
    vIBS:
      money(obj(tot, "gIBS", "total/IBSCBSTot", false), "vIBS", "total/IBSCBSTot/gIBS", false) ?? 0,
    vCBS:
      money(obj(tot, "gCBS", "total/IBSCBSTot", false), "vCBS", "total/IBSCBSTot/gCBS", false) ?? 0,
  };
  return {
    vBC: money(t, "vBC", p),
    vICMS: money(t, "vICMS", p),
    vBCST: money(t, "vBCST", p),
    vST: money(t, "vST", p),
    vProd: money(t, "vProd", p),
    vFrete: money(t, "vFrete", p),
    vSeg: money(t, "vSeg", p),
    vDesc: money(t, "vDesc", p),
    vOutro: money(t, "vOutro", p),
    vNF: money(t, "vNF", p),
    ...(ibsCbs ? { ibsCbs } : {}),
  };
}

export interface ParseNfeOptions {
  /**
   * CNPJ of the accounting client. Decides `role`: client = issuer -> "saida", client =
   * recipient -> "entrada". Without it, role follows tpNF (0 = entrada, 1 = saida), which is
   * the issuer's point of view and only right for notes the issuer emitted.
   */
  clientCnpj?: string;
}

/** Parses an authorized NF-e (`nfeProc`, layout 4.00, model 55) into a normalized document. */
export function parseNfeProc(xml: string, options: ParseNfeOptions = {}): NfeDocument {
  const root = parseXml(xml);
  const proc = obj(root, "nfeProc", "", false);
  if (!proc) throw new NfeParseError("unsupported_layout", "Root element must be nfeProc");
  const nfe = obj(proc, "NFe", "nfeProc");
  const infNFe = obj(nfe, "infNFe", "NFe");
  const versao = infNFe?.["@_versao"];
  if (versao !== "4.00") {
    throw new NfeParseError(
      "unsupported_layout",
      `Unsupported NF-e layout version: ${String(versao)}`,
    );
  }
  const id = String(infNFe?.["@_Id"] ?? "");
  const chave = id.replace(/^NFe/, "");
  if (!isValidChave(chave)) {
    throw new NfeParseError("invalid_field", "infNFe/@Id is not a valid chave de acesso");
  }

  const prot = obj(obj(proc, "protNFe", "nfeProc"), "infProt", "protNFe");
  const protocolo = {
    chave: text(prot, "chNFe", "protNFe/infProt"),
    cStat: text(prot, "cStat", "protNFe/infProt"),
    nProt: text(prot, "nProt", "protNFe/infProt", false) ?? "",
    dhRecbto: text(prot, "dhRecbto", "protNFe/infProt", false) ?? "",
  };
  if (protocolo.chave !== chave) {
    throw new NfeParseError("invalid_field", "protNFe chNFe does not match infNFe/@Id");
  }
  if (protocolo.cStat !== "100" && protocolo.cStat !== "150") {
    throw new NfeParseError("not_authorized", `NF-e not authorized (cStat ${protocolo.cStat})`);
  }
  if (protocolo.nProt === "") throw new NfeParseError("missing_field", "Missing protNFe nProt");

  const ide = obj(infNFe, "ide", "infNFe");
  if (text(ide, "mod", "ide") !== "55") {
    throw new NfeParseError("unsupported_layout", "Only NF-e model 55 is supported");
  }
  const dhEmi = text(ide, "dhEmi", "ide");
  if (!/^\d{4}-\d{2}-\d{2}/.test(dhEmi)) {
    throw new NfeParseError("invalid_field", `ide/dhEmi is not ISO 8601: "${dhEmi}"`);
  }
  const emit = obj(infNFe, "emit", "infNFe");
  const emitente = party(emit ?? {}, "emit");
  if (!emitente.cnpj) throw new NfeParseError("missing_field", "Missing emit/CNPJ");
  if (parseChave(chave)?.cnpj !== emitente.cnpj) {
    throw new NfeParseError("invalid_field", "emit/CNPJ does not match the chave de acesso");
  }
  const crt = text(emit, "CRT", "emit", false);
  const enderEmit = obj(emit, "enderEmit", "emit", false);
  const dest = obj(infNFe, "dest", "infNFe", false);
  const destinatario = dest && {
    ...party(dest, "dest"),
    ...(text(obj(dest, "enderDest", "dest", false), "UF", "dest/enderDest", false)
      ? { uf: text(obj(dest, "enderDest", "dest", false), "UF", "dest/enderDest") }
      : {}),
  };

  const dets = (infNFe?.det as Obj[] | undefined) ?? [];
  if (dets.length === 0) throw new NfeParseError("missing_field", "NF-e has no items (det)");
  const itens = dets.map(parseItem);
  const totais = parseTotals(obj(infNFe, "total", "infNFe"));

  const tpNF = text(ide, "tpNF", "ide");
  const client = options.clientCnpj ? normalizeCnpj(options.clientCnpj) : undefined;
  const role =
    client !== undefined
      ? client === emitente.cnpj
        ? "saida"
        : client === destinatario?.cnpj
          ? "entrada"
          : undefined
      : tpNF === "0"
        ? "entrada"
        : "saida";
  if (!role) throw new NfeParseError("invalid_field", "clientCnpj is neither issuer nor recipient");

  const uf = text(enderEmit, "UF", "emit/enderEmit", false);
  return {
    kind: "nfe",
    role,
    status: "completo",
    chave,
    emitenteCnpj: emitente.cnpj,
    ...(destinatario?.cnpj ? { destinatarioCnpj: destinatario.cnpj } : {}),
    emissao: dhEmi.slice(0, 10),
    competencia: dhEmi.slice(0, 7),
    valorTotal: totais.vNF,
    ide: {
      serie: text(ide, "serie", "ide"),
      numero: text(ide, "nNF", "ide"),
      dhEmi,
      tpNF,
      finNFe: text(ide, "finNFe", "ide"),
      natOp: text(ide, "natOp", "ide"),
    },
    emitente: { ...emitente, cnpj: emitente.cnpj, ...(crt ? { crt } : {}), ...(uf ? { uf } : {}) },
    ...(destinatario ? { destinatario } : {}),
    itens,
    totais,
    protocolo,
  };
}

/** Parses a cancellation event (`procEventoNFe`, tpEvento 110111) homologated by SEFAZ. */
export function parseNfeCancelEvent(xml: string): NfeCancelEvent {
  const root = parseXml(xml);
  const proc = obj(root, "procEventoNFe", "", false);
  if (!proc) throw new NfeParseError("unsupported_layout", "Root element must be procEventoNFe");
  const inf = obj(obj(proc, "evento", "procEventoNFe"), "infEvento", "evento");
  if (text(inf, "tpEvento", "infEvento") !== "110111") {
    throw new NfeParseError("unsupported_layout", "Not a cancellation event (tpEvento 110111)");
  }
  const ret = obj(obj(proc, "retEvento", "procEventoNFe"), "infEvento", "retEvento");
  const cStat = text(ret, "cStat", "retEvento/infEvento");
  // 135 = event registered and linked to the NF-e; 155 = cancelled outside the deadline.
  if (cStat !== "135" && cStat !== "155") {
    throw new NfeParseError("not_authorized", `Cancellation not homologated (cStat ${cStat})`);
  }
  const chave = text(inf, "chNFe", "infEvento");
  if (!isValidChave(chave) || text(ret, "chNFe", "retEvento/infEvento") !== chave) {
    throw new NfeParseError("invalid_field", "Event chNFe is invalid or differs from retEvento");
  }
  return {
    chave,
    nProtCancelado: text(obj(inf, "detEvento", "infEvento"), "nProt", "infEvento/detEvento"),
    nProtEvento: text(ret, "nProt", "retEvento/infEvento"),
    cStat,
    dhEvento: text(inf, "dhEvento", "infEvento"),
  };
}

/** Links a cancellation event to its note: same chave and same authorization protocol. */
export function applyCancelEvent(doc: NfeDocument, event: NfeCancelEvent): NfeDocument {
  if (event.chave !== doc.chave || event.nProtCancelado !== doc.protocolo.nProt) {
    throw new NfeParseError("event_mismatch", "Cancellation event does not belong to this NF-e");
  }
  return { ...doc, status: "cancelado" };
}
