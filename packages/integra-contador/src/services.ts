import { type IntegraContadorClient, type IntegraResponse, normalizeDocument } from "./client";

// Service ids come from the official Catalogo de Servicos of Integra Contador
// (apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/).

/** AUTENTICAPROCURADOR: sends the termo de autorizacao XML already signed with the procurador's certificate. */
export const autenticaProcurador = (
  c: IntegraContadorClient,
  contribuinte: string,
  signedXml: string,
) =>
  c.call("Apoiar", contribuinte, "AUTENTICAPROCURADOR", "ENVIOXMLASSINADO81", "1", {
    xml: Buffer.from(signedXml, "utf8").toString("base64"),
  });

// --- PGDAS-D (Integra-SN) ---
/** `periodo` is AAAAMM; `ano` is AAAA. Exactly one must be given. */
export function consultarDeclaracoes(
  c: IntegraContadorClient,
  cnpj: string,
  q: { ano: string } | { periodo: string },
) {
  const dados = "ano" in q ? { anoCalendario: q.ano } : { periodoApuracao: q.periodo };
  return c.call("Consultar", cnpj, "PGDASD", "CONSDECLARACAO13", "1.0", dados);
}

/** `dataConsolidacao` (AAAAMMDD) is optional; used when the DAS is paid after the due date. */
export const gerarDas = (
  c: IntegraContadorClient,
  cnpj: string,
  periodo: string,
  dataConsolidacao?: string,
) =>
  c.call("Emitir", cnpj, "PGDASD", "GERARDAS12", "1.0", {
    periodoApuracao: periodo,
    ...(dataConsolidacao ? { dataConsolidacao } : {}),
  });

// --- DCTFWeb (Integra-DCTFWeb) ---
export const consultarReciboDctfWeb = (c: IntegraContadorClient, cnpj: string, dados: object) =>
  c.call("Consultar", cnpj, "DCTFWEB", "CONSRECIBO32", "1.0", dados);

// --- SICALC (DARF, Lucro Presumido) ---
export const emitirDarf = (c: IntegraContadorClient, cnpj: string, dados: object) =>
  c.call("Emitir", cnpj, "SICALC", "CONSOLIDARGERARDARF51", "2.9", dados);

// --- SITFIS: two steps. Ask for a protocol, then fetch the report with it. ---
export const solicitarProtocoloSitfis = (c: IntegraContadorClient, cnpj: string) =>
  c.call("Apoiar", cnpj, "SITFIS", "SOLICITARPROTOCOLO91", "1.0");

export const emitirRelatorioSitfis = (
  c: IntegraContadorClient,
  cnpj: string,
  protocoloRelatorio: string,
) => c.call("Emitir", cnpj, "SITFIS", "RELATORIOSITFIS92", "1.0", { protocoloRelatorio });

// --- CAIXAPOSTAL ---
export const listarMensagens = (c: IntegraContadorClient, cnpj: string, dados: object = {}) =>
  c.call("Consultar", cnpj, "CAIXAPOSTAL", "MSGCONTRIBUINTE61", "1.0", dados);

export const detalharMensagem = (c: IntegraContadorClient, cnpj: string, isn: string) =>
  c.call("Consultar", cnpj, "CAIXAPOSTAL", "MSGDETALHAMENTO62", "1.0", { isn });

export const indicadorNovasMensagens = (c: IntegraContadorClient, cnpj: string) =>
  c.call("Monitorar", cnpj, "CAIXAPOSTAL", "INNOVAMSG63", "1.0");

// --- PROCURACOES ---
export const obterProcuracao = (
  c: IntegraContadorClient,
  outorgante: string,
  outorgado: string,
): Promise<IntegraResponse> => {
  const from = normalizeDocument(outorgante);
  const to = normalizeDocument(outorgado);
  return c.call("Consultar", from, "PROCURACOES", "OBTERPROCURACAO41", "1", {
    outorgante: from,
    tipoOutorgante: from.length === 11 ? "1" : "2",
    outorgado: to,
    tipoOutorgado: to.length === 11 ? "1" : "2",
  });
};
