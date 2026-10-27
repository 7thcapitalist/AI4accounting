import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findings as findingsTable, openStore } from "@ai4a/db";
import {
  ERROR_TYPES,
  evaluate,
  generatePortfolio,
  injectErrors,
  type SimDocument,
} from "@ai4a/simulator";
import { describe, expect, it } from "vitest";
import { runSimMonth } from "../month";
import { CheckAgent } from "./agent";
import { ClaudeCliProvider, type ExecFn, FakeLlm } from "./llm";
import { parseOfx } from "./ofx";
import { checkPipeline } from "./pipeline";
import { type CheckInput, runChecks } from "./rules";

const MONTH = "2026-09";
const portfolio = generatePortfolio(3, [MONTH]);
const find = (pred: (c: (typeof portfolio.companies)[number]) => boolean) => {
  const c = portfolio.companies.find(pred);
  const m = c?.months[0];
  if (!c || !m) throw new Error("no matching company");
  return { company: c.company, m };
};
const inputOf = (
  c: ReturnType<typeof find>,
  docs: SimDocument[] = c.m.documents,
  bank = c.m.bank,
): CheckInput => ({
  client: { cnpj: c.company.cnpj, regime: c.company.profile.regime },
  month: MONTH,
  docs: docs.map((d) => ({ id: d.file, kind: d.kind, xml: d.xml })),
  bank,
});
const nfeCompany = () => find((c) => c.company.profile.sells === "nfe");
const nfseSimples = () => find((c) => c.company.profile.key === "servicos_simples");
const clinic = () => find((c) => c.company.profile.key === "clinica_presumido");
const ids = (i: CheckInput) => runChecks(i).map((f) => f.ruleId);
const swap = (d: SimDocument, from: string | RegExp, to: string): SimDocument => ({
  ...d,
  xml: d.xml.replace(from, to),
});

describe("rules", () => {
  it("clean months produce no findings except the open federal-withholding hint", () => {
    for (const { company, months } of portfolio.companies) {
      const m = months[0];
      if (!m) continue;
      const res = runChecks({
        client: { cnpj: company.cnpj, regime: company.profile.regime },
        month: MONTH,
        docs: m.documents.map((d) => ({ id: d.file, kind: d.kind, xml: d.xml })),
        bank: m.bank,
      }).filter((f) => f.ruleId !== "CHECK-RETENCAO-FEDERAL");
      expect(res).toEqual([]);
    }
  });

  it("flags an issued sale with an entrada CFOP (Ajuste SINIEF 07/2001)", () => {
    const c = nfeCompany();
    const sale = c.m.documents.find((d) => d.kind === "nfe" && d.role === "saida");
    if (!sale) throw new Error("no sale");
    const bad = swap(sale, /<CFOP>5102<\/CFOP>/g, "<CFOP>1102</CFOP>");
    const docs = c.m.documents.map((d) => (d === sale ? bad : d));
    const f = runChecks(inputOf(c, docs)).filter((x) => x.ruleId === "CHECK-CFOP-DIRECAO");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0]).toMatchObject({ ref: sale.ref, errorType: "wrong_cfop" });
    expect(f[0]?.source).toContain("SINIEF");
  });

  it("flags CFOP 5xxx on an interstate sale", () => {
    const c = nfeCompany();
    const sale = c.m.documents.find((d) => d.kind === "nfe" && d.role === "saida");
    if (!sale) throw new Error("no sale");
    const bad = swap(sale, /<dest>(.*?)<UF>GO<\/UF>/s, "<dest>$1<UF>SP</UF>");
    const docs = c.m.documents.map((d) => (d === sale ? bad : d));
    expect(ids(inputOf(c, docs))).toContain("CHECK-CFOP-UF");
  });

  it("flags CST on a Simples issuer and a non-8-digit NCM", () => {
    const c = find((x) => x.company.profile.key === "comercio_simples");
    const sale = c.m.documents.find((d) => d.kind === "nfe" && d.role === "saida");
    if (!sale) throw new Error("no sale");
    const bad = swap(
      swap(
        sale,
        "<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>",
        "<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>1.00</vBC><pICMS>17.00</pICMS><vICMS>0.17</vICMS></ICMS00>",
      ),
      /<NCM>\d+<\/NCM>/g,
      "<NCM>8471</NCM>",
    );
    const got = ids(
      inputOf(
        c,
        c.m.documents.map((d) => (d === sale ? bad : d)),
      ),
    );
    expect(got).toContain("CHECK-CSOSN");
    expect(got).toContain("CHECK-NCM-FORMATO");
  });

  it("flags a withheld ISS paid in full, and not when paid net", () => {
    const c = nfseSimples();
    const taken = c.m.documents.find((d) => d.kind === "nfse" && d.role === "entrada");
    if (!taken) throw new Error("no taken service");
    const bad = swap(taken, "<tpRetISSQN>1</tpRetISSQN>", "<tpRetISSQN>2</tpRetISSQN>");
    const docs = c.m.documents.map((d) => (d === taken ? bad : d));
    const f = runChecks(inputOf(c, docs)).filter((x) => x.ruleId === "CHECK-ISS-RETIDO");
    expect(f).toHaveLength(1);
    expect(f[0]?.ref).toBe(taken.ref);
    const net = c.m.bank.map((b) =>
      b.valor === -taken.valor ? { ...b, valor: b.valor + Math.round(taken.valor * 0.02) } : b,
    );
    expect(ids(inputOf(c, docs, net))).not.toContain("CHECK-ISS-RETIDO");
  });

  it("checks IRRF/CSRF on issued services billed to companies (Presumido clinic)", () => {
    const c = clinic();
    const toCompany = c.m.documents.find(
      (d) => d.kind === "nfse" && d.role === "saida" && d.counterpart.length === 14,
    );
    if (!toCompany) throw new Error("no clinic invoice to a company");
    const wrong = swap(toCompany, /<vTotalRet>[^<]*<\/vTotalRet>/, "<vTotalRet>1.00</vTotalRet>");
    const f = runChecks(
      inputOf(
        c,
        c.m.documents.map((d) => (d === toCompany ? wrong : d)),
      ),
    ).filter((x) => x.ruleId === "CHECK-RETENCAO-FEDERAL");
    expect(f.some((x) => x.ref === toCompany.ref && x.severity === "warning")).toBe(true);
    expect(f[0]?.source).toContain("Lei 10.833");
    const none = swap(toCompany, /<vTotalRet>[^<]*<\/vTotalRet>/, "<vTotalRet>0.00</vTotalRet>");
    const g = runChecks(
      inputOf(
        c,
        c.m.documents.map((d) => (d === toCompany ? none : d)),
      ),
    );
    expect(g.find((x) => x.ref === toCompany.ref)?.severity).toBe("info");
  });

  it("NFS-e duplicate identity is numero + prestador", () => {
    const c = nfseSimples();
    const a = c.m.documents.find((d) => d.kind === "nfse" && d.role === "saida");
    if (!a) throw new Error("no nfse");
    const dups = (docs: SimDocument[]) =>
      runChecks(inputOf(c, docs)).filter((x) => x.errorType === "duplicate");
    expect(dups([a, { ...a, file: "copy.xml" }]).length).toBe(1);
    const otherPrest = swap(a, /(<prest>\s*<CNPJ>)\d{14}/, "$100000000000191");
    expect(dups([a, { ...otherPrest, file: "other.xml" }])).toEqual([]);
  });

  it("only homologated cancellation (cStat 101/151) is CHECK-CANCELADA", () => {
    const c = nfeCompany();
    const a = c.m.documents[0];
    if (!a) throw new Error("no doc");
    const run = (cStat: string) =>
      runChecks(inputOf(c, [swap(a, "<cStat>100</cStat>", `<cStat>${cStat}</cStat>`)]));
    expect(run("101").some((x) => x.ruleId === "CHECK-CANCELADA")).toBe(true);
    expect(run("151").some((x) => x.ruleId === "CHECK-CANCELADA")).toBe(true);
    for (const st of ["301", "302", "110", "204"]) {
      const got = run(st);
      expect(got.some((x) => x.ruleId === "CHECK-CANCELADA" || x.errorType === "cancelled")).toBe(
        false,
      );
      expect(got.some((x) => x.ruleId === "CHECK-ILEGIVEL")).toBe(true);
    }
  });

  it("flags cancelled, duplicate and foreign documents", () => {
    const c = nfeCompany();
    const [a, b, d] = c.m.documents;
    if (!a || !b || !d) throw new Error("need 3 docs");
    const cancelled = swap(a, "<cStat>100</cStat>", "<cStat>101</cStat>");
    const copy = { ...b, file: "copy.xml" };
    const input = inputOf(c, [cancelled, b, copy, d]);
    const got = runChecks(input);
    expect(got.find((x) => x.errorType === "cancelled")?.ref).toBe(a.ref);
    expect(got.find((x) => x.errorType === "duplicate")?.ref).toBe(b.ref);
    const other = portfolio.companies.find((x) => x.company.cnpj !== c.company.cnpj);
    const foreign = other?.months[0]?.documents[0];
    if (!foreign) throw new Error("no foreign doc");
    const res = runChecks(inputOf(c, [...c.m.documents, foreign]));
    expect(res.find((x) => x.errorType === "other_company")?.ref).toBe(foreign.ref);
  });
});

describe("parseOfx", () => {
  it("reads amounts in centavos and skips broken lines", () => {
    const ofx =
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>-12.30<FITID>A1<MEMO>PAGAMENTO 1</STMTTRN>\n<STMTTRN><TRNAMT>x<FITID>A2</STMTTRN>";
    expect(parseOfx(ofx)).toEqual([{ valor: -1230, memo: "PAGAMENTO 1", fitid: "A1" }]);
  });
});

describe("LlmProvider", () => {
  it("ClaudeCliProvider runs `claude -p` with the prompt on stdin and no API key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    let seen: { file: string; args: string[]; env: NodeJS.ProcessEnv; stdin: string } | undefined;
    const exec: ExecFn = (file, args, opts, cb) => {
      seen = { file, args, env: opts.env, stdin: "" };
      return {
        stdin: {
          end(input: string) {
            if (seen) seen.stdin = input;
            cb(null, " resposta \n");
          },
        },
      };
    };
    await expect(new ClaudeCliProvider({ exec }).complete("oi")).resolves.toBe("resposta");
    expect(seen).toMatchObject({ file: "claude", args: ["-p"], stdin: "oi" });
    expect(seen?.env.ANTHROPIC_API_KEY).toBeUndefined();
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe("CheckAgent in a simulated month", () => {
  it("runs as the conferencia phase, explains via the LlmProvider and never sends client data", async () => {
    const st = await openStore(":memory:");
    const llm = new FakeLlm(() => "Confira o documento.");
    const res = await runSimMonth(st, 3, {
      nClients: 4,
      dataDir: mkdtempSync(join(tmpdir(), "ai4a-check-")),
      llm,
    });
    expect(Object.keys(res.outcomes)).toHaveLength(4);
    const rows = await st.db.select().from(findingsTable);
    // Clean simulated months: the Check agent only raises the open federal-withholding hint.
    for (const r of rows.filter((x) => x.source?.startsWith("CHECK-")))
      expect(r.source).toContain("CHECK-RETENCAO-FEDERAL");
    for (const p of llm.prompts) expect(p).not.toMatch(/\d{14}/);
    st.close();
  });

  it("CheckAgent throws for an unknown competencia", async () => {
    const st = await openStore(":memory:");
    await expect(
      new CheckAgent({ store: st }).run({
        taskId: "t",
        competenciaId: "nope",
        phase: "conferencia",
      }),
    ).rejects.toThrow(/unknown competencia/);
    st.close();
  });
});

describe("pnpm eval: Check error types", () => {
  it("recall >= 90% on every injected type the Check agent owns, over several seeds", async () => {
    const owned = ["wrong_cfop", "iss_not_withheld", "other_company", "duplicate", "cancelled"];
    const tp = new Map<string, number>();
    const planted = new Map<string, number>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const inj = injectErrors(generatePortfolio(seed), { rate: 0.3 });
      const rep = await evaluate(inj, checkPipeline);
      for (const s of rep.byType) {
        tp.set(s.type, (tp.get(s.type) ?? 0) + s.tp);
        planted.set(s.type, (planted.get(s.type) ?? 0) + s.tp + s.fn);
        if (owned.includes(s.type)) expect(s.fp).toBe(0);
      }
    }
    for (const t of ERROR_TYPES.filter((x) => owned.includes(x))) {
      expect(planted.get(t) ?? 0).toBeGreaterThan(0);
      expect((tp.get(t) ?? 0) / (planted.get(t) ?? 1)).toBeGreaterThanOrEqual(0.9);
    }
  });
});
