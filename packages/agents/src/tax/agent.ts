import { readFileSync } from "node:fs";
import { clients, competencias, documents, type Store } from "@ai4a/db";
import {
  apurarMesPresumido,
  apurarTrimestrePresumido,
  type Centavos,
  calculateDas,
  type FiscalDocument,
  parseNfeProc,
  parseNfse,
  type Retencoes,
  retencoesServico,
  somarRetencoes,
} from "@ai4a/fiscal-core";
import { eq } from "drizzle-orm";
import type { Agent, AgentEvent, AgentFinding, AgentResult, AgentTask } from "../types";
import type { Regime, TaxContextProvider } from "./context";

export interface TaxAgentDeps {
  store: Store;
  context: TaxContextProvider;
}

/** A payment guide drafted for the accountant. Never sent anywhere (that is the Delivery agent). */
export interface GuideDraft {
  guide: "PGDAS-D" | "DARF" | "ISS";
  /** Receita code of the DARF (Sicalc), absent for PGDAS-D (DAS) and the municipal ISS. */
  code?: string;
  description: string;
  /** Period of apuracao: YYYY-MM, or "YYYY-Tn" for quarterly taxes. */
  period: string;
  amountCentavos: Centavos;
  /** Official source of the rule behind the amount. */
  source: string;
}

const SRC_DAS = "LC 123/2006 art. 18-20; Resolucao CGSN 140/2018 art. 21; Manual PGDAS-D 2018";
const SRC_PIS = "Lei 9.718/1998 art. 8; Lei 10.637/2002 art. 8 II; Receita Federal, codigo 8109";
const SRC_COFINS =
  "Lei 9.718/1998 art. 8; Lei 10.833/2003 art. 10 II; Receita Federal, codigo 2172";
const SRC_IRPJ = "Lei 9.249/1995 arts. 3 e 15; Lei 9.430/1996 art. 1; Receita Federal, codigo 2089";
const SRC_CSLL = "Lei 9.249/1995 art. 20; Lei 7.689/1988 art. 3; Receita Federal, codigo 2372";
const SRC_ISS = "LC 116/2003 (guia municipal, fora do DARF)";

/**
 * Agent 5 (phase `apuracao`): picks the regime of the client and drafts the guides of the month.
 * Simples: PGDAS-D from the Simples engine. Lucro Presumido: monthly PIS/COFINS (+ municipal ISS),
 * and IRPJ/CSLL when the month closes a quarter. Revenue is read from the stored XML of the
 * issued invoices, one `tax.revenue` event per document. No LLM: only fiscal-core engines.
 */
export class TaxAgent implements Agent {
  readonly name = "tax";

  constructor(private d: TaxAgentDeps) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const { store, context } = this.d;
    const [row] = await store.db
      .select({ cnpj: clients.cnpj, regime: clients.regime, month: competencias.month })
      .from(competencias)
      .innerJoin(clients, eq(clients.id, competencias.clientId))
      .where(eq(competencias.id, task.competenciaId));
    if (!row) throw new Error(`unknown competencia ${task.competenciaId}`);
    const events: AgentEvent[] = [];
    const findings: AgentFinding[] = [];
    const blocker = (message: string, source: string, documentId?: string) =>
      findings.push({ severity: "blocker", message, source, documentId });

    if (row.regime !== "simples" && row.regime !== "presumido") {
      blocker(`Regime "${row.regime}" fora do escopo da apuracao`, "ADR 0009");
      return { events, findings };
    }
    const regime: Regime = row.regime;
    events.push({ kind: "tax.regime", payload: { regime, month: row.month } });

    const rev = await this.revenue(task.competenciaId, row.cnpj, row.month, events, findings);
    if (findings.some((f) => f.severity === "blocker")) return { events, findings };

    const ctx = await context.contextFor({ cnpj: row.cnpj, month: row.month, regime });
    const guides: GuideDraft[] = [];
    let monthlyTax = 0;
    if (ctx.regime === "simples") {
      const das = calculateDas({
        revenue: rev.total,
        rbt12: ctx.rbt12,
        annex: ctx.annex,
        payroll12: ctx.payroll12,
        rba: ctx.rbaBefore + rev.total,
        rbaa: ctx.rbaa,
      });
      guides.push({
        guide: "PGDAS-D",
        description: `DAS Simples Nacional, Anexo ${das.annex}`,
        period: row.month,
        amountCentavos: das.total,
        source: SRC_DAS,
      });
      events.push({
        kind: "tax.calc",
        payload: {
          revenue: rev.total,
          rbt12: ctx.rbt12,
          annex: das.annex,
          effectiveRate: das.effectiveRate,
          taxes: das.taxes,
          split: das.split,
        },
      });
      monthlyTax = das.total;
    } else {
      const mes = apurarMesPresumido({
        competencia: row.month,
        receitas: [{ activity: ctx.activity, receitaBruta: rev.total }],
        retencoes: { irrf: 0, csll: 0, pis: rev.retencoes.pis, cofins: rev.retencoes.cofins },
        issRateBp: ctx.issRateBp,
      });
      guides.push(
        {
          guide: "DARF",
          code: "8109",
          description: "PIS faturamento (cumulativo)",
          period: row.month,
          amountCentavos: mes.pis.aPagar,
          source: SRC_PIS,
        },
        {
          guide: "DARF",
          code: "2172",
          description: "COFINS (cumulativo)",
          period: row.month,
          amountCentavos: mes.cofins.aPagar,
          source: SRC_COFINS,
        },
      );
      if (ctx.issRateBp > 0) {
        guides.push({
          guide: "ISS",
          description: "ISS municipal",
          period: row.month,
          amountCentavos: mes.iss.aPagar,
          source: SRC_ISS,
        });
      }
      monthlyTax = mes.pis.aPagar + mes.cofins.aPagar + mes.iss.aPagar;
      events.push({
        kind: "tax.calc",
        payload: { revenue: rev.total, retencoes: rev.retencoes, mes },
      });

      if (/-(03|06|09|12)$/.test(row.month)) {
        if (ctx.quarterPrior.length !== 2) {
          blocker(
            `Trimestre sem os 2 meses anteriores (${ctx.quarterPrior.length} encontrados): IRPJ/CSLL nao apurados`,
            "Lei 9.430/1996 art. 1",
          );
        } else {
          const ret = somarRetencoes([...ctx.quarterPrior.map((m) => m.retencoes), rev.retencoes]);
          const tri = apurarTrimestrePresumido({
            competenciaFim: row.month,
            receitas: [
              {
                activity: ctx.activity,
                receitaBruta: ctx.quarterPrior.reduce((a, m) => a + m.revenue, rev.total),
              },
            ],
            retencoes: { irrf: ret.irrf, csll: ret.csll, pis: 0, cofins: 0 },
          });
          const period = `${row.month.slice(0, 4)}-T${Number(row.month.slice(5)) / 3}`;
          guides.push(
            {
              guide: "DARF",
              code: "2089",
              description: "IRPJ lucro presumido (trimestral)",
              period,
              amountCentavos: tri.irpj.aPagar,
              source: SRC_IRPJ,
            },
            {
              guide: "DARF",
              code: "2372",
              description: "CSLL lucro presumido (trimestral)",
              period,
              amountCentavos: tri.csll.aPagar,
              source: SRC_CSLL,
            },
          );
          events.push({ kind: "tax.calc", payload: { quarter: period, tri } });
        }
      }
    }
    for (const g of guides) events.push({ kind: "tax.draft", payload: g });
    events.push({
      kind: "tax.summary",
      payload: {
        regime,
        revenue: rev.total,
        monthlyTax,
        guides: guides.length,
        context: context.name,
      },
    });
    return { events, findings };
  }

  /** Sums the issued invoices of the month from their stored XML; withholdings come from issued NFS-e. */
  private async revenue(
    competenciaId: string,
    cnpj: string,
    month: string,
    events: AgentEvent[],
    findings: AgentFinding[],
  ): Promise<{ total: Centavos; retencoes: Retencoes }> {
    const rows = await this.d.store.db
      .select()
      .from(documents)
      .where(eq(documents.competenciaId, competenciaId))
      .then((r) => r.filter((x) => x.kind === "nfe" || x.kind === "nfse"));
    let total = 0;
    const withheld: Retencoes[] = [];
    for (const r of rows) {
      let doc: FiscalDocument;
      let valor: Centavos;
      let vTotalRet = 0;
      try {
        const xml = readFileSync(r.storagePath ?? "", "utf8");
        if (r.kind === "nfe") {
          doc = parseNfeProc(xml, { clientCnpj: cnpj });
          valor = doc.valorTotal;
        } else {
          const n = parseNfse(xml, { clientCnpj: cnpj });
          doc = n;
          valor = n.valores.vServ;
          vTotalRet = n.valores.vTotalRet ?? 0;
        }
      } catch (err) {
        findings.push({
          severity: "blocker",
          message: `Documento ilegivel, receita do mes incompleta: ${(err as Error).message}`,
          source: "fiscal-core",
          documentId: r.id,
        });
        continue;
      }
      if (doc.role !== "saida" || doc.status === "cancelado" || doc.competencia !== month) continue;
      if (r.amountCentavos != null && r.amountCentavos !== valor) {
        findings.push({
          severity: "warning",
          message: `Valor capturado (${r.amountCentavos}) difere do XML (${valor}); usado o XML`,
          source: "tax",
          documentId: r.id,
        });
      }
      total += valor;
      events.push({
        kind: "tax.revenue",
        documentId: r.id,
        payload: { documentKind: r.kind, key: r.key, valor, vTotalRet },
      });
      if (vTotalRet > 0) {
        const ret = retencoesServico(valor, month);
        if (ret.irrf + ret.csll + ret.pis + ret.cofins !== vTotalRet) {
          findings.push({
            severity: "warning",
            message: "Retencoes do XML nao batem com IRRF 1,5% + CSRF 4,65%; usadas as da regra",
            source: "Lei 10.833/2003 art. 30",
            documentId: r.id,
          });
        }
        withheld.push(ret);
      }
    }
    return { total, retencoes: somarRetencoes(withheld) };
  }
}
