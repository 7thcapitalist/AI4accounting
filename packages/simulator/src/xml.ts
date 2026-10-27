import { type Centavos, chaveCheckDigit } from "@ai4a/fiscal-core";

// XML in the official layouts the fiscal-core parsers read (NF-e nfeProc 4.00, NFS-e Padrao Nacional
// 1.01). Synthetic: invented names, synthetic CNPJs, dummy signature. Never sent anywhere.

const UF_GO = "52";
const MUN_GOIANIA = "5208707";

export const reais = (c: Centavos): string => (c / 100).toFixed(2);

export interface NfeSpec {
  emitCnpj: string;
  emitNome: string;
  destCnpj: string;
  destNome: string;
  /** YYYY-MM-DD */
  data: string;
  numero: number;
  /** Simples Nacional issuer uses CRT 1 and CSOSN 102; normal regime uses CRT 3 and CST 00 at 17%. */
  simples: boolean;
  cfop: string;
  /** One value per item, centavos. */
  itens: Centavos[];
  cNF: string;
}

/** 44-digit chave: cUF + AAMM + CNPJ + mod 55 + serie + nNF + tpEmis + cNF + DV. */
export function nfeChave(s: NfeSpec): string {
  const aamm = s.data.slice(2, 4) + s.data.slice(5, 7);
  const first43 = `${UF_GO}${aamm}${s.emitCnpj}55001${String(s.numero).padStart(9, "0")}1${s.cNF}`;
  return first43 + chaveCheckDigit(first43);
}

export function nfeProcXml(s: NfeSpec): { chave: string; xml: string; total: Centavos } {
  const chave = nfeChave(s);
  const icmsOf = (v: Centavos) => (s.simples ? 0 : Math.round((v * 17) / 100));
  const dets = s.itens
    .map((v, i) => {
      const icms = s.simples
        ? "<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>"
        : `<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${reais(v)}</vBC><pICMS>17.00</pICMS><vICMS>${reais(icmsOf(v))}</vICMS></ICMS00>`;
      return `<det nItem="${i + 1}"><prod><cProd>P${i + 1}</cProd><xProd>Mercadoria ${i + 1}</xProd><NCM>84713012</NCM><CFOP>${s.cfop}</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>${reais(v)}</vUnCom><vProd>${reais(v)}</vProd></prod><imposto><ICMS>${icms}</ICMS></imposto></det>`;
    })
    .join("");
  const total = s.itens.reduce((a, b) => a + b, 0);
  const vICMS = s.itens.reduce((a, v) => a + icmsOf(v), 0);
  const vBC = s.simples ? 0 : total;
  const dh = `${s.data}T10:00:00-03:00`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe versao="4.00" Id="NFe${chave}">
<ide><cUF>${UF_GO}</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${s.numero}</nNF><dhEmi>${dh}</dhEmi><tpNF>1</tpNF><finNFe>1</finNFe></ide>
<emit><CNPJ>${s.emitCnpj}</CNPJ><xNome>${s.emitNome}</xNome><enderEmit><UF>GO</UF></enderEmit><CRT>${s.simples ? "1" : "3"}</CRT></emit>
<dest><CNPJ>${s.destCnpj}</CNPJ><xNome>${s.destNome}</xNome><enderDest><UF>GO</UF></enderDest></dest>
${dets}
<total><ICMSTot><vBC>${reais(vBC)}</vBC><vICMS>${reais(vICMS)}</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>${reais(total)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vOutro>0.00</vOutro><vNF>${reais(total)}</vNF></ICMSTot></total>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>${dh}</dhRecbto><nProt>152${s.data.replace(/-/g, "").slice(2)}${String(s.numero).padStart(6, "0")}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
  return { chave, xml, total };
}

export interface NfseSpec {
  prestCnpj: string;
  prestNome: string;
  /** Tomador: company (CNPJ) or person (CPF, 11 digits). */
  tomaDoc: string;
  tomaNome: string;
  /** YYYY-MM-DD */
  data: string;
  numero: number;
  valor: Centavos;
  issRateBp: number;
  /** Federal withholdings (IRRF + CSRF) made by the tomador, centavos. */
  retido: Centavos;
  simples: boolean;
  cTribNac: string;
  servico: string;
}

export function nfseXml(s: NfseSpec): string {
  const iss = Math.round((s.valor * s.issRateBp) / 10_000);
  const id = `NFS${MUN_GOIANIA}2${s.prestCnpj}${String(s.numero).padStart(13, "0")}${"0".repeat(15)}`;
  const n = String(s.numero);
  const toma = s.tomaDoc.length === 11 ? `<CPF>${s.tomaDoc}</CPF>` : `<CNPJ>${s.tomaDoc}</CNPJ>`;
  const dh = `${s.data}T18:00:00-03:00`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">
 <infNFSe Id="${id}">
  <xLocEmi>Goiania</xLocEmi><xLocPrestacao>Goiania</xLocPrestacao><nNFSe>${n}</nNFSe>
  <cLocIncid>${MUN_GOIANIA}</cLocIncid><xLocIncid>Goiania</xLocIncid>
  <xTribNac>${s.servico}</xTribNac>
  <verAplic>AI4-SIM-1</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><cStat>100</cStat>
  <dhProc>${dh}</dhProc><nDFSe>${n}</nDFSe>
  <emit><CNPJ>${s.prestCnpj}</CNPJ><xNome>${s.prestNome}</xNome><enderNac><xLgr>Rua Ficticia</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>${MUN_GOIANIA}</cMun><UF>GO</UF><CEP>74000000</CEP></enderNac></emit>
  <valores><vBC>${reais(s.valor)}</vBC><pAliqAplic>${(s.issRateBp / 100).toFixed(2)}</pAliqAplic><vISSQN>${reais(iss)}</vISSQN><vTotalRet>${reais(s.retido)}</vTotalRet><vLiq>${reais(s.valor - s.retido)}</vLiq></valores>
  <DPS versao="1.01"><infDPS Id="DPS${MUN_GOIANIA}2${s.prestCnpj}00001${String(s.numero).padStart(15, "0")}">
   <tpAmb>2</tpAmb><dhEmi>${dh}</dhEmi><verAplic>AI4-SIM-1</verAplic><serie>1</serie><nDPS>${n}</nDPS>
   <dCompet>${s.data}</dCompet><tpEmit>1</tpEmit><cLocEmi>${MUN_GOIANIA}</cLocEmi>
   <prest><CNPJ>${s.prestCnpj}</CNPJ><regTrib><opSimpNac>${s.simples ? "3" : "1"}</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>
   <toma>${toma}<xNome>${s.tomaNome}</xNome></toma>
   <serv><locPrest><cLocPrestacao>${MUN_GOIANIA}</cLocPrestacao></locPrest><cServ><cTribNac>${s.cTribNac}</cTribNac><xDescServ>${s.servico}</xDescServ></cServ></serv>
   <valores><vServPrest><vServ>${reais(s.valor)}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>
  </infDPS></DPS>
 </infNFSe>
</NFSe>`;
}
