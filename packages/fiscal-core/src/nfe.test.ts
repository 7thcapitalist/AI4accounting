import { describe, expect, it } from "vitest";
import { applyCancelEvent, NfeParseError, parseNfeCancelEvent, parseNfeProc } from "./index";
import {
  CHAVE,
  cancelEventXml,
  DEST_CNPJ,
  EMIT_CNPJ,
  IBSCBS_ITEM,
  IBSCBS_TOT,
  ICMS_00,
  ICMS_10,
  ICMS_60,
  ICMS_SN101,
  NPROT,
  nfeProcXml,
} from "./nfe-fixtures";

const sale = () => nfeProcXml({ items: [{ icms: ICMS_00 }], vNF: "100.00" });

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof NfeParseError ? e.code : `other:${String(e)}`;
  }
}

describe("parseNfeProc: normal sale (goods, regime normal)", () => {
  const doc = parseNfeProc(sale());

  it("fills the FiscalDocument fields", () => {
    expect(doc).toMatchObject({
      kind: "nfe",
      role: "saida",
      status: "completo",
      chave: CHAVE,
      emitenteCnpj: EMIT_CNPJ,
      destinatarioCnpj: DEST_CNPJ,
      emissao: "2026-10-15",
      competencia: "2026-10",
      valorTotal: 10000,
    });
  });

  it("reads ide, parties and protocol", () => {
    expect(doc.ide).toMatchObject({ serie: "1", numero: "123", tpNF: "1", finNFe: "1" });
    expect(doc.emitente).toMatchObject({ cnpj: EMIT_CNPJ, crt: "3", uf: "SP" });
    expect(doc.destinatario).toMatchObject({ cnpj: DEST_CNPJ, uf: "RJ" });
    expect(doc.protocolo).toMatchObject({ chave: CHAVE, cStat: "100", nProt: NPROT });
  });

  it("reads per-item fields and totals in centavos", () => {
    expect(doc.itens).toHaveLength(1);
    expect(doc.itens[0]).toMatchObject({
      nItem: 1,
      cProd: "P1",
      ncm: "84713012",
      cfop: "5102",
      qCom: "2.0000",
      vProd: 10000,
      vDesc: 0,
      icms: { orig: "0", cst: "00", vBC: 10000, vICMS: 1800 },
    });
    expect(doc.itens[0]?.icms.st).toBeUndefined();
    expect(doc.totais).toMatchObject({ vBC: 10000, vICMS: 1800, vProd: 10000, vNF: 10000 });
    expect(doc.totais.ibsCbs).toBeUndefined();
  });
});

describe("CFOP / CSOSN (Simples Nacional issuer)", () => {
  it("reads CSOSN instead of CST and per-item CFOP", () => {
    const doc = parseNfeProc(
      nfeProcXml({
        crt: "1",
        vICMS: "0.00",
        vNF: "200.00",
        items: [
          { icms: ICMS_SN101, cfop: "5102" },
          { icms: ICMS_SN101, cfop: "6102" },
        ],
      }),
    );
    expect(doc.emitente.crt).toBe("1");
    expect(doc.itens.map((i) => i.cfop)).toEqual(["5102", "6102"]);
    expect(doc.itens.map((i) => i.nItem)).toEqual([1, 2]);
    expect(doc.itens[0]?.icms).toEqual({ orig: "0", csosn: "101" });
    expect(doc.valorTotal).toBe(20000);
  });
});

describe("ICMS ST absent / present", () => {
  it("captures ST charged on the item and in the totals", () => {
    const doc = parseNfeProc(
      nfeProcXml({
        items: [{ icms: ICMS_10 }],
        vBCST: "140.00",
        vST: "7.20",
        vNF: "107.20",
      }),
    );
    expect(doc.itens[0]?.icms.st).toEqual({ vBC: 14000, vICMS: 720 });
    expect(doc.totais).toMatchObject({ vBCST: 14000, vST: 720, vNF: 10720 });
  });

  it("keeps previously withheld ST apart from charged ST", () => {
    const doc = parseNfeProc(
      nfeProcXml({ items: [{ icms: ICMS_60 }], vICMS: "0.00", vNF: "100.00" }),
    );
    expect(doc.itens[0]?.icms.st).toBeUndefined();
    expect(doc.itens[0]?.icms.stRetido).toEqual({ vBC: 10000, vICMS: 1800 });
  });
});

describe("IBS/CBS (tax reform) group", () => {
  it("parses the optional item and total groups", () => {
    const doc = parseNfeProc(
      nfeProcXml({
        items: [{ icms: ICMS_00, extra: IBSCBS_ITEM }],
        vNF: "100.00",
        totExtra: IBSCBS_TOT,
      }),
    );
    expect(doc.itens[0]?.ibsCbs).toEqual({
      cst: "000",
      cClassTrib: "000001",
      vBC: 10000,
      vIBS: 10,
      vCBS: 90,
    });
    expect(doc.totais.ibsCbs).toEqual({ vBC: 10000, vIBS: 10, vCBS: 90 });
  });
});

describe("role", () => {
  it("uses clientCnpj when given", () => {
    expect(parseNfeProc(sale(), { clientCnpj: "11.444.777/0001-61" }).role).toBe("entrada");
    expect(parseNfeProc(sale(), { clientCnpj: EMIT_CNPJ }).role).toBe("saida");
  });

  it("rejects a client that is neither party", () => {
    expect(codeOf(() => parseNfeProc(sale(), { clientCnpj: "00000000000191" }))).toBe(
      "invalid_field",
    );
  });
});

describe("cancelled event linkage", () => {
  it("marks the note cancelado when chave and protocol match", () => {
    const event = parseNfeCancelEvent(cancelEventXml());
    expect(event).toMatchObject({ chave: CHAVE, nProtCancelado: NPROT, cStat: "135" });
    const cancelled = applyCancelEvent(parseNfeProc(sale()), event);
    expect(cancelled.status).toBe("cancelado");
    expect(cancelled.itens).toHaveLength(1);
  });

  it("does not mutate the original document", () => {
    const doc = parseNfeProc(sale());
    applyCancelEvent(doc, parseNfeCancelEvent(cancelEventXml()));
    expect(doc.status).toBe("completo");
  });

  it("refuses an event for another protocol", () => {
    const event = parseNfeCancelEvent(cancelEventXml({ nProt: "135260000009999" }));
    expect(codeOf(() => applyCancelEvent(parseNfeProc(sale()), event))).toBe("event_mismatch");
  });

  it("refuses an event for another chave", () => {
    const event = { ...parseNfeCancelEvent(cancelEventXml()), chave: "1".repeat(44) };
    expect(codeOf(() => applyCancelEvent(parseNfeProc(sale()), event))).toBe("event_mismatch");
  });

  it("rejects events SEFAZ did not homologate", () => {
    expect(codeOf(() => parseNfeCancelEvent(cancelEventXml({ cStat: "573" })))).toBe(
      "not_authorized",
    );
  });
});

describe("errors", () => {
  it.each([
    ["empty", "", "invalid_xml"],
    ["not xml", "hello", "invalid_xml"],
    ["broken xml", "<nfeProc><NFe></nfeProc>", "invalid_xml"],
    ["wrong root", "<other/>", "unsupported_layout"],
  ])("%s -> NfeParseError", (_n, xml, code) => {
    expect(codeOf(() => parseNfeProc(xml))).toBe(code);
  });

  it("rejects a denied note (cStat 301)", () => {
    expect(
      codeOf(() =>
        parseNfeProc(nfeProcXml({ items: [{ icms: ICMS_00 }], vNF: "100.00", cStat: "301" })),
      ),
    ).toBe("not_authorized");
  });

  it("rejects other layout versions", () => {
    expect(
      codeOf(() =>
        parseNfeProc(nfeProcXml({ items: [{ icms: ICMS_00 }], vNF: "100.00", versao: "3.10" })),
      ),
    ).toBe("unsupported_layout");
  });

  it("rejects amounts with sub-centavo precision instead of rounding", () => {
    expect(
      codeOf(() => parseNfeProc(nfeProcXml({ items: [{ icms: ICMS_00 }], vNF: "100.005" }))),
    ).toBe("invalid_field");
  });

  it("rejects a corrupted chave", () => {
    expect(codeOf(() => parseNfeProc(sale().replace(`NFe${CHAVE}`, `NFe${"0".repeat(44)}`)))).toBe(
      "invalid_field",
    );
  });
});
