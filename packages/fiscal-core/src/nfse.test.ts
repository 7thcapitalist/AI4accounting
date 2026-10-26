import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NfseParseError, parseNfse } from "./index";

// Synthetic fixtures only (invented names, published example CNPJs). The two XML files in
// ./fixtures were validated against the official XSDs of the same version (see PR description).
const PREST = "11222333000181";
const TOMA = "11444777000161";
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const BASE = {
  "1.00": readFileSync(join(FIXTURES, "nfse-v1.00.xml"), "utf8"),
  "1.01": readFileSync(join(FIXTURES, "nfse-v1.01.xml"), "utf8"),
};

function nfse(
  opts: {
    versao?: "1.00" | "1.01";
    tp?: string;
    trib?: string;
    toma?: string;
    noPrestNome?: boolean;
  } = {},
): string {
  const { versao = "1.00", tp = "1", trib = "1" } = opts;
  let x = BASE[versao]
    .replace("<tpRetISSQN>1</tpRetISSQN>", `<tpRetISSQN>${tp}</tpRetISSQN>`)
    .replace("<tribISSQN>1</tribISSQN>", `<tribISSQN>${trib}</tribISSQN>`);
  if (tp !== "1") {
    x = x
      .replace("<vTotalRet>0.00</vTotalRet>", "<vTotalRet>20.00</vTotalRet>")
      .replace("<vLiq>1000.00</vLiq>", "<vLiq>980.00</vLiq>");
  }
  if (opts.toma !== undefined) {
    x = x.replace(/<toma>.*<\/toma>/, opts.toma ? `<toma>${opts.toma}</toma>` : "");
  }
  return x;
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
      iss: { tribISSQN: "1", tributacao: "tributavel", tpRetISSQN: "1", retido: false },
      versao: "1.00",
    });
  });

  it("parses a taken NFS-e with ISS withheld by the tomador", () => {
    const d = parseNfse(nfse({ tp: "2" }), { clientCnpj: "11.444.777/0001-61" });
    expect(d.role).toBe("entrada");
    expect(d.iss).toEqual({
      tribISSQN: "1",
      tributacao: "tributavel",
      tpRetISSQN: "2",
      retido: true,
    });
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
    expect(code(() => parseNfse(nfse({ trib: "5" }), opt))).toBe("invalid_field");
    expect(code(() => parseNfse(nfse({ trib: "0" }), opt))).toBe("invalid_field");
    expect(code(() => parseNfse(nfse({ trib: "abc" }), opt))).toBe("invalid_field");
    expect(code(() => parseNfse(nfse().replace('versao="1.00"', 'versao="2.00"'), opt))).toBe(
      "unsupported_layout",
    );
    expect(code(() => parseNfse(nfse().replace(/ versao="1.00"/, ""), opt))).toBe(
      "unsupported_layout",
    );
    expect(
      code(() => parseNfse(nfse().replace('<DPS versao="1.00">', '<DPS versao="1.01">'), opt)),
    ).toBe("invalid_field");
    expect(code(() => parseNfse(nfse().replace('<DPS versao="1.00">', "<DPS>"), opt))).toBe(
      "missing_field",
    );
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

  it("resolves tribISSQN by layout version", () => {
    const opt = { clientCnpj: PREST };
    const meaning = (versao: "1.00" | "1.01", trib: string) =>
      parseNfse(nfse({ versao, trib }), opt).iss.tributacao;
    expect(["1", "2", "3", "4"].map((t) => meaning("1.00", t))).toEqual([
      "tributavel",
      "exportacao",
      "nao_incidencia",
      "imunidade",
    ]);
    expect(["1", "2", "3", "4"].map((t) => meaning("1.01", t))).toEqual([
      "tributavel",
      "imunidade",
      "exportacao",
      "nao_incidencia",
    ]);
    expect(parseNfse(nfse({ versao: "1.01" }), opt).versao).toBe("1.01");
  });

  it("does not require prest/xNome and falls back to infNFSe/emit/xNome", () => {
    for (const versao of ["1.00", "1.01"] as const) {
      const xml = nfse({ versao });
      expect(xml).not.toMatch(/<prest>.*<xNome>/); // fixture omits it, as the XSD allows
      expect(parseNfse(xml, { clientCnpj: PREST }).prestador.xNome).toBe("Estudio Ficticio LTDA");
    }
    // prest/xNome wins when present
    const withNome = nfse().replace(
      `<prest><CNPJ>${PREST}</CNPJ>`,
      `<prest><CNPJ>${PREST}</CNPJ><xNome>Nome na DPS</xNome>`,
    );
    expect(parseNfse(withNome, { clientCnpj: PREST }).prestador.xNome).toBe("Nome na DPS");
    // emit of a different CNPJ is not used for the prestador name (tpEmit=2: emit is the tomador)
    const other = nfse()
      .replace(`<emit><CNPJ>${PREST}`, `<emit><CNPJ>${TOMA}`)
      .replace("<tpEmit>1</tpEmit>", "<tpEmit>2</tpEmit>");
    expect(parseNfse(other, { clientCnpj: PREST }).prestador.xNome).toBeUndefined();
  });

  it("takes emitenteCnpj from infNFSe/emit according to tpEmit", () => {
    const opt = { clientCnpj: PREST };
    const asTomador = nfse()
      .replace(`<emit><CNPJ>${PREST}`, `<emit><CNPJ>${TOMA}`)
      .replace("<tpEmit>1</tpEmit>", "<tpEmit>2</tpEmit>");
    expect(parseNfse(asTomador, opt)).toMatchObject({
      emitenteCnpj: TOMA,
      prestador: { cnpj: PREST },
      destinatarioCnpj: TOMA,
    });
    const interm = "11111111000191";
    const asInterm = nfse()
      .replace(`<emit><CNPJ>${PREST}`, `<emit><CNPJ>${interm}`)
      .replace("<tpEmit>1</tpEmit>", "<tpEmit>3</tpEmit>");
    expect(parseNfse(asInterm, opt)).toMatchObject({
      emitenteCnpj: interm,
      prestador: { cnpj: PREST },
    });
    // tpEmit=1 but emit is not the prestador, or tpEmit invalid
    const bad = nfse().replace(`<emit><CNPJ>${PREST}`, `<emit><CNPJ>${TOMA}`);
    expect(code(() => parseNfse(bad, opt))).toBe("invalid_field");
    expect(
      code(() => parseNfse(nfse().replace("<tpEmit>1</tpEmit>", "<tpEmit>4</tpEmit>"), opt)),
    ).toBe("invalid_field");
  });
});
