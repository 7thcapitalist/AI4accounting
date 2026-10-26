import { describe, expect, it } from "vitest";
import { NfseParseError, parseNfse } from "./index";

// Synthetic fixtures only: invented names and the published example CNPJs.
const PREST = "11222333000181";
const TOMA = "11444777000161";
const ID = `NFS${"3550308"}2${PREST}${"0".repeat(28)}`;

function nfse(opts: { tp?: string; trib?: string; toma?: string; extraDps?: string } = {}): string {
  const {
    tp = "1",
    trib = "1",
    toma = `<CNPJ>${TOMA}</CNPJ><xNome>Cliente Ficticio SA</xNome>`,
  } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
 <infNFSe Id="${ID}">
  <xLocEmi>Sao Paulo</xLocEmi><nNFSe>123</nNFSe><cLocIncid>3550308</cLocIncid>
  <valores><vBC>1000.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>20.00</vISSQN><vTotalRet>${tp === "1" ? "0.00" : "20.00"}</vTotalRet><vLiq>${tp === "1" ? "1000.00" : "980.00"}</vLiq></valores>
  <emit><CNPJ>${PREST}</CNPJ><xNome>Estudio Ficticio LTDA</xNome></emit>
  <DPS versao="1.00"><infDPS Id="DPS1">
   <tpAmb>2</tpAmb><dhEmi>2026-09-30T23:50:00-03:00</dhEmi><serie>1</serie><nDPS>123</nDPS>
   <dCompet>2026-09-30</dCompet><cLocEmi>3550308</cLocEmi>
   <prest><CNPJ>${PREST}</CNPJ><xNome>Estudio Ficticio LTDA</xNome><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
   ${toma ? `<toma>${toma}</toma>` : ""}
   <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest><cServ><cTribNac>010701</cTribNac><xDescServ>Desenvolvimento de site</xDescServ></cServ></serv>
   <valores><vServPrest><vServ>1000.00</vServ></vServPrest><trib><tribMun><tribISSQN>${trib}</tribISSQN><tpRetISSQN>${tp}</tpRetISSQN></tribMun></trib></valores>
   ${opts.extraDps ?? ""}
  </infDPS></DPS>
 </infNFSe>
</NFSe>`;
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof NfseParseError ? e.code : "other";
  }
  return "none";
};

describe("parseNfse", () => {
  it("parses an issued NFS-e without ISS withholding", () => {
    const d = parseNfse(nfse(), { clientCnpj: PREST });
    expect(d).toMatchObject({
      kind: "nfse",
      role: "saida",
      status: "completo",
      emitenteCnpj: PREST,
      destinatarioCnpj: TOMA,
      emissao: "2026-09-30",
      competencia: "2026-09",
      valorTotal: 100000,
      numero: "123",
      servico: { cTribNac: "010701", cLocPrestacao: "3550308", cLocIncid: "3550308" },
      valores: { vServ: 100000, vBC: 100000, pAliqAplic: "2.00", vISSQN: 2000, vLiq: 100000 },
      iss: { tribISSQN: "1", tpRetISSQN: "1", retido: false },
    });
  });

  it("parses a taken NFS-e with ISS withheld by the tomador", () => {
    const d = parseNfse(nfse({ tp: "2" }), { clientCnpj: "11.444.777/0001-61" });
    expect(d.role).toBe("entrada");
    expect(d.iss).toEqual({ tribISSQN: "1", tpRetISSQN: "2", retido: true });
    expect(d.valores).toMatchObject({ vTotalRet: 2000, vLiq: 98000 });
  });

  it("parses an issued NFS-e with withholding and a taken one without", () => {
    expect(parseNfse(nfse({ tp: "3" }), { clientCnpj: PREST }).iss.retido).toBe(true);
    const d = parseNfse(nfse({ tp: "1" }), { clientCnpj: TOMA });
    expect(d).toMatchObject({ role: "entrada", iss: { retido: false } });
  });

  it("accepts a tomador without CNPJ (CPF)", () => {
    const d = parseNfse(nfse({ toma: "<CPF>12345678909</CPF><xNome>Pessoa Ficticia</xNome>" }), {
      clientCnpj: PREST,
    });
    expect(d.destinatarioCnpj).toBeUndefined();
    expect(d.tomador).toEqual({ cpf: "12345678909", xNome: "Pessoa Ficticia" });
  });

  it("rejects a client that is neither side", () => {
    expect(code(() => parseNfse(nfse(), { clientCnpj: "11111111000191" }))).toBe("invalid_field");
  });

  it("rejects invalid input", () => {
    const opt = { clientCnpj: PREST };
    expect(code(() => parseNfse("", opt))).toBe("invalid_xml");
    expect(code(() => parseNfse("<nfeProc/>", opt))).toBe("unsupported_layout");
    expect(code(() => parseNfse(nfse({ tp: "9" }), opt))).toBe("invalid_field");
    expect(
      code(() =>
        parseNfse(
          nfse().replace(
            "<vServPrest><vServ>1000.00</vServ></vServPrest>",
            "<vServPrest><x>1</x></vServPrest>",
          ),
          opt,
        ),
      ),
    ).toBe("missing_field");
    expect(code(() => parseNfse(nfse().replace("1000.00</vServ>", "1000.005</vServ>"), opt))).toBe(
      "invalid_field",
    );
    expect(code(() => parseNfse(nfse().replace("010701", "0107"), opt))).toBe("invalid_field");
  });
});
