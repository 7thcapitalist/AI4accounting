import { isValidCnpj, parseNfeProc, parseNfse } from "@ai4a/fiscal-core";
import { describe, expect, it } from "vitest";
import { generatePortfolio, PROFILES, toLedgerCsv, toOfx } from "./index";

const portfolio = generatePortfolio(7);
const all = portfolio.companies.flatMap(({ company, months }) =>
  months.map((m) => ({ company, m })),
);

describe("generatePortfolio", () => {
  it("builds 15 companies x 3 months by default", () => {
    expect(portfolio.companies).toHaveLength(15);
    for (const c of portfolio.companies)
      expect(c.months.map((m) => m.competencia)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("is deterministic by seed and changes with the seed", () => {
    expect(JSON.stringify(generatePortfolio(7))).toBe(JSON.stringify(portfolio));
    expect(JSON.stringify(generatePortfolio(8))).not.toBe(JSON.stringify(portfolio));
  });

  it("uses synthetic CNPJs with valid check digits, all distinct", () => {
    const cnpjs = portfolio.companies.map((c) => c.company.cnpj);
    for (const c of cnpjs) expect(isValidCnpj(c)).toBe(true);
    expect(new Set(cnpjs).size).toBe(cnpjs.length);
  });

  it("has only Simples Nacional and Lucro Presumido companies", () => {
    const regimes = new Set(portfolio.companies.map((c) => c.company.profile.regime));
    expect([...regimes].sort()).toEqual(["presumido", "simples"]);
  });
});

describe("documents round-trip through the fiscal-core parsers", () => {
  it("every XML parses, with the right role, total and competencia", () => {
    let count = 0;
    for (const { company, m } of all) {
      for (const d of m.documents) {
        const doc =
          d.kind === "nfe"
            ? parseNfeProc(d.xml, { clientCnpj: company.cnpj })
            : parseNfse(d.xml, { clientCnpj: company.cnpj });
        expect(doc.role).toBe(d.role);
        expect(doc.valorTotal).toBe(d.valor);
        expect(doc.competencia).toBe(m.competencia);
        if (d.kind === "nfe") expect(doc.chave).toBe(d.ref);
        count++;
      }
    }
    expect(count).toBeGreaterThan(300);
  });

  it("issued documents add up exactly to the month revenue", () => {
    for (const { m } of all) {
      const issued = m.documents.filter((d) => d.role === "saida").reduce((s, d) => s + d.valor, 0);
      expect(issued).toBe(m.expected.revenue);
    }
  });
});

describe("bank statement and ERP ledger", () => {
  it("credits match issued invoices net of withholdings", () => {
    for (const { m } of all) {
      const credits = m.bank.filter((b) => b.valor > 0).reduce((s, b) => s + b.valor, 0);
      const r = m.expected.retencoes;
      expect(credits).toBe(m.expected.revenue - (r.irrf + r.csll + r.pis + r.cofins));
    }
  });

  it("ledger has one line per document and exports OFX/CSV", () => {
    const { company, m } =
      all[0] ??
      (() => {
        throw new Error("empty portfolio");
      })();
    expect(m.ledger).toHaveLength(m.documents.length);
    expect(toOfx(company, m)).toContain("<STMTTRN>");
    expect(toLedgerCsv(m).split("\n")[0]).toBe("data;conta;documento;contraparte;valor");
  });
});

describe("expected taxes", () => {
  it("Simples months carry a DAS, Presumido months carry PIS/COFINS and the Q3 IRPJ/CSLL", () => {
    for (const { company, m } of all) {
      if (company.profile.regime === "simples") {
        expect(m.expected.das?.total).toBeGreaterThan(0);
        expect(m.expected.rbt12).toBeGreaterThan(0);
      } else {
        expect(m.expected.presumidoMes?.pis.devido).toBeGreaterThan(0);
        if (m.competencia === "2026-09")
          expect(m.expected.presumidoTrimestre?.irpj.devido).toBeGreaterThan(0);
      }
    }
  });

  it("fator R decides the annex: high payroll stays in III, low payroll goes to V", () => {
    const annexes = portfolio.companies
      .filter((c) => c.company.profile.key === "fator_r_simples")
      .map((c) => c.months[0]?.expected.das?.annex);
    expect(annexes.sort()).toEqual(["III", "V"]);
  });

  it("Presumido consultancy has IRRF/CSRF withheld on some invoices", () => {
    const withheld = all
      .filter(({ company }) => company.profile === PROFILES.servicos_presumido)
      .some(({ m }) => m.expected.retencoes.irrf > 0);
    expect(withheld).toBe(true);
  });
});
