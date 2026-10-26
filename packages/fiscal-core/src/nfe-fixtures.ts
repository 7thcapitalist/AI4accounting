import { chaveCheckDigit } from "./chave";

// Synthetic fixtures only: invented names, the published example CNPJs, no real data.
export const EMIT_CNPJ = "11222333000181";
export const DEST_CNPJ = "11444777000161";

const first43 = `35${"2610"}${EMIT_CNPJ}55001000000123${"1"}12345678`;
export const CHAVE = first43 + chaveCheckDigit(first43);
export const NPROT = "135260000000001";

export interface FixtureItem {
  icms: string;
  cfop?: string;
  vProd?: string;
  extra?: string;
}

export const ICMS_00 =
  "<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>18.00</pICMS><vICMS>18.00</vICMS></ICMS00>";
export const ICMS_SN101 =
  "<ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>1.25</pCredSN><vCredICMSSN>1.25</vCredICMSSN></ICMSSN101>";
export const ICMS_10 =
  "<ICMS10><orig>0</orig><CST>10</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>18.00</pICMS><vICMS>18.00</vICMS><modBCST>4</modBCST><pMVAST>40.00</pMVAST><vBCST>140.00</vBCST><pICMSST>18.00</pICMSST><vICMSST>7.20</vICMSST></ICMS10>";
export const ICMS_60 =
  "<ICMS60><orig>0</orig><CST>60</CST><vBCSTRet>100.00</vBCSTRet><pST>18.00</pST><vICMSSTRet>18.00</vICMSSTRet></ICMS60>";
export const IBSCBS_ITEM =
  "<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>100.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.10</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.10</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>0.90</vCBS></gCBS></gIBSCBS></IBSCBS>";
export const IBSCBS_TOT =
  "<IBSCBSTot><vBCIBSCBS>100.00</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>0.10</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.10</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS><gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>0.90</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS></IBSCBSTot>";

export interface FixtureOptions {
  items: FixtureItem[];
  crt?: string;
  vNF: string;
  vICMS?: string;
  vBCST?: string;
  vST?: string;
  vDesc?: string;
  totExtra?: string;
  cStat?: string;
  versao?: string;
}

export function nfeProcXml(o: FixtureOptions): string {
  const dets = o.items
    .map(
      (it, i) =>
        `<det nItem="${i + 1}"><prod><cProd>P${i + 1}</cProd><xProd>Produto ${i + 1}</xProd><NCM>84713012</NCM><CFOP>${it.cfop ?? "5102"}</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>50.0000000000</vUnCom><vProd>${it.vProd ?? "100.00"}</vProd></prod><imposto><ICMS>${it.icms}</ICMS>${it.extra ?? ""}</imposto></det>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe versao="${o.versao ?? "4.00"}" Id="NFe${CHAVE}">
<ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-10-15T10:30:00-03:00</dhEmi><tpNF>1</tpNF><finNFe>1</finNFe></ide>
<emit><CNPJ>${EMIT_CNPJ}</CNPJ><xNome>Empresa Ficticia Ltda</xNome><enderEmit><UF>SP</UF></enderEmit><CRT>${o.crt ?? "3"}</CRT></emit>
<dest><CNPJ>${DEST_CNPJ}</CNPJ><xNome>Cliente Ficticio SA</xNome><enderDest><UF>RJ</UF></enderDest></dest>
${dets}
<total><ICMSTot><vBC>100.00</vBC><vICMS>${o.vICMS ?? "18.00"}</vICMS><vBCST>${o.vBCST ?? "0.00"}</vBCST><vST>${o.vST ?? "0.00"}</vST><vProd>100.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${o.vDesc ?? "0.00"}</vDesc><vOutro>0.00</vOutro><vNF>${o.vNF}</vNF></ICMSTot>${o.totExtra ?? ""}</total>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${CHAVE}</chNFe><dhRecbto>2026-10-15T10:31:00-03:00</dhRecbto><nProt>${NPROT}</nProt><cStat>${o.cStat ?? "100"}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
}

export function cancelEventXml(
  opts: { chave?: string; nProt?: string; cStat?: string } = {},
): string {
  const chave = opts.chave ?? CHAVE;
  return `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento Id="ID110111${chave}01"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>${EMIT_CNPJ}</CNPJ><chNFe>${chave}</chNFe><dhEvento>2026-10-16T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${opts.nProt ?? NPROT}</nProt><xJust>Erro na emissao da nota</xJust></detEvento></infEvento></evento><retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>${opts.cStat ?? "135"}</cStat><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento><nProt>135260000000002</nProt></infEvento></retEvento></procEventoNFe>`;
}
