import { isValidCnpj, parseNfeProc, parseNfse, SIMPLES_SUBLIMIT } from "@ai4a/fiscal-core";
import { describe, expect, it } from "vitest";
import {
  ERROR_TYPES,
  evaluate,
  expectedMonthlyTax,
  generatePortfolio,
  injectErrors,
  type Pipeline,
  PROFILES,
  stubPipeline,
  toLedgerCsv,
  toOfx,
} from "./index";

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

  it("clinics withhold on invoices to companies/health plans, never to individuals", () => {
    const clinics = all.filter(({ company }) => company.profile.key === "clinica_presumido");
    const withheld = clinics.flatMap(({ m }) => m.documents).filter((d) => d.retencoes);
    expect(withheld.length).toBeGreaterThan(0);
    for (const d of withheld) expect(d.counterpart).toHaveLength(14);
    expect(clinics.some(({ m }) => m.expected.retencoes.irrf > 0)).toBe(true);
  });

  it("the Simples sublimite company crosses R$ 3,6 mi RBT12 during the simulated months", () => {
    const c = portfolio.companies.find((x) => x.company.profile.key === "sublimite_simples");
    const rbt12 = c?.months.map((m) => m.expected.rbt12 ?? 0) ?? [];
    expect(rbt12[0]).toBeLessThanOrEqual(SIMPLES_SUBLIMIT);
    expect(rbt12.at(-1)).toBeGreaterThan(SIMPLES_SUBLIMIT);
  });
});

describe("injectErrors and evaluate", () => {
  const injected = injectErrors(generatePortfolio(7), { rate: 0.5 });

  it("is deterministic by seed and does not touch the clean portfolio", () => {
    const clean = JSON.stringify(generatePortfolio(7));
    expect(JSON.stringify(injectErrors(generatePortfolio(7), { rate: 0.5 }))).toBe(
      JSON.stringify(injected),
    );
    expect(JSON.stringify(generatePortfolio(7))).toBe(clean);
  });

  it("plants every error type and the key points at real artifacts", () => {
    expect(new Set(injected.answerKey.map((a) => a.type))).toEqual(new Set(ERROR_TYPES));
    for (const a of injected.answerKey) {
      const m = injected.companies
        .find((c) => c.company.id === a.companyId)
        ?.months.find((x) => x.competencia === a.competencia);
      expect(m).toBeDefined();
      if (a.type === "bank_without_document")
        expect(m?.bank.some((b) => b.fitid === a.ref)).toBe(true);
      else if (a.type === "wrong_revenue") expect(m?.declaredRevenue).not.toBe(m?.expected.revenue);
      else if (a.type === "missing_invoice")
        expect(m?.documents.some((d) => d.ref === a.ref)).toBe(false);
      else expect(m?.documents.some((d) => d.ref === a.ref)).toBe(true);
    }
  });

  it("scores the stub at zero recall and an oracle at 100%", async () => {
    const stub = await evaluate(injected, stubPipeline);
    expect(stub.planted).toBe(injected.answerKey.length);
    for (const s of stub.byType) expect(s.recall === 0 || s.recall === null).toBe(true);
    expect(stub.tax.exact).toBe(0);

    const oracle: Pipeline = ({ company, month }) => {
      const e = injected.companies
        .find((c) => c.company.id === company.id)
        ?.months.find((x) => x.competencia === month.competencia)?.expected;
      return {
        findings: injected.answerKey
          .filter((a) => a.companyId === company.id && a.competencia === month.competencia)
          .map(({ type, ref }) => ({ type, ref })),
        tax: e && expectedMonthlyTax(e),
      };
    };
    const perfect = await evaluate(injected, oracle);
    for (const s of perfect.byType) {
      expect(s.fp).toBe(0);
      expect(s.fn).toBe(0);
    }
    expect(perfect.tax.rate).toBe(1);
  });

  it("counts wrong findings as false positives", async () => {
    const first = injected.answerKey[0];
    if (!first) throw new Error("empty answer key");
    const r = await evaluate(injected, ({ company }) => ({
      findings: company.id === first.companyId ? [{ type: "duplicate", ref: "nope" }] : [],
    }));
    const dup = r.byType.find((s) => s.type === "duplicate");
    expect(dup?.fp).toBeGreaterThan(0);
    expect(dup?.precision).toBe(0);
  });
});
