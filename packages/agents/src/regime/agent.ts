import { clients, competencias, type Store } from "@ai4a/db";
import { type Centavos, SIMPLES_CEILING, SIMPLES_SUBLIMIT } from "@ai4a/fiscal-core";
import { eq } from "drizzle-orm";
import type { Agent, AgentEvent, AgentFinding, AgentResult, AgentTask } from "../types";
import type { RegimeContextProvider } from "./context";
import {
  compareRegimes,
  excessConsequence,
  fatorR,
  projectRba,
  runRate,
  SRC_CEILING,
  SRC_FATOR_R,
  SRC_SUBLIMIT,
} from "./engine";
import { brl, ceilingText, comparisonText, fatorRText, sublimitText } from "./text";

export interface RegimeAgentDeps {
  store: Store;
  context: RegimeContextProvider;
}

/**
 * Regime agent (ROADMAP 3.8, ADR 0009): every month, for Simples clients, projects when the calendar-year revenue (RBA) crosses
 * the Simples ceiling and the calendar-year revenue crosses the ICMS/ISS sublimit, tracks fator R and
 * the payroll that keeps Annex III, and compares annual Simples x Lucro Presumido. It only raises
 * flags with the numbers behind them: never a legal conclusion and nothing is filed. No LLM.
 */
export class RegimeAgent implements Agent {
  readonly name = "regime";

  constructor(private d: RegimeAgentDeps) {}

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
    if (row.regime !== "simples" && row.regime !== "presumido") {
      findings.push({
        severity: "warning",
        message: `Regime "${row.regime}" fora do escopo do acompanhamento de enquadramento`,
        source: "ADR 0009",
      });
      return { events, findings };
    }
    const ctx = await context.contextFor({ cnpj: row.cnpj, month: row.month });
    const last = ctx.revenue.at(-1);
    if (last?.competencia !== row.month || ctx.revenue.length < 12) {
      findings.push({
        severity: "warning",
        message: `Historico de receita insuficiente (${ctx.revenue.length} meses ate ${last?.competencia ?? "nenhum"}): sem projecao de limites`,
        source: "regime",
      });
      return { events, findings };
    }
    const rbt12 = ctx.revenue.slice(-12).reduce((a, m) => a + m.amount, 0);
    const rate = runRate(ctx.revenue);
    const ytd: Centavos = ctx.revenue
      .filter((m) => m.competencia.slice(0, 4) === row.month.slice(0, 4))
      .reduce((a, m) => a + m.amount, 0);
    const sublimit = ctx.sublimit ?? SIMPLES_SUBLIMIT;
    events.push({
      kind: "regime.snapshot",
      payload: { regime: row.regime, month: row.month, rbt12, runRate: rate, ytd, sublimit },
    });

    if (row.regime === "simples") {
      // Exclusion by excess is judged on the calendar-year revenue (RBA), not on the rolling RBT12.
      const ceiling = projectRba(ytd, row.month, rate, SIMPLES_CEILING);
      const cons = excessConsequence(ceiling.atEnd, SIMPLES_CEILING);
      events.push({ kind: "regime.ceiling", payload: { ...ceiling, consequence: cons } });
      if (ceiling.alreadyAbove || ceiling.month) {
        findings.push({
          severity: ceiling.alreadyAbove ? "blocker" : "warning",
          message: ceilingText(row.month, ytd, ceiling, cons),
          source: SRC_CEILING,
        });
      }

      const sub = projectRba(ytd, row.month, rate, sublimit);
      const subCons = excessConsequence(sub.atEnd, sublimit);
      events.push({ kind: "regime.sublimit", payload: { ...sub, consequence: subCons } });
      if (sub.alreadyAbove || sub.month) {
        findings.push({
          severity: "warning",
          message: sublimitText(sub, sublimit, subCons),
          source: SRC_SUBLIMIT,
        });
      }

      if (ctx.annex === "FATOR_R" || ctx.annex === "III" || ctx.annex === "V") {
        const fr = fatorR(ctx.payroll12, rbt12);
        events.push({ kind: "regime.fator_r", payload: fr });
        const nearLoss = fr.annex === "III" && ctx.payroll12 * 100 < rbt12 * 30;
        if (fr.annex === "V" || nearLoss) {
          findings.push({
            severity: "warning",
            message: fatorRText(fr, rbt12, ctx.payroll12),
            source: SRC_FATOR_R,
          });
        }
      }
    }

    if (rbt12 <= SIMPLES_CEILING) {
      const cmp = compareRegimes({
        annualRevenue: rbt12,
        payroll12: ctx.payroll12,
        annex: ctx.annex,
        activity: ctx.activity,
        issRateBp: ctx.issRateBp,
        year: Number(row.month.slice(0, 4)),
        sublimit,
      });
      events.push({ kind: "regime.comparison", payload: { basis: "RBT12", rbt12, ...cmp } });
      findings.push({
        severity: "info",
        message: comparisonText(row.regime, rbt12, cmp),
        source:
          "LC 123/2006 art. 18; Lei 9.249/1995 arts. 3, 15 e 20; Lei 9.430/1996 art. 1; Lei 9.718/1998 art. 8",
      });
    } else {
      findings.push({
        severity: "info",
        message: `RBT12 de ${brl(rbt12)} acima do teto do Simples: comparacao anual nao se aplica`,
        source: SRC_CEILING,
      });
    }
    return { events, findings };
  }
}
