import type { Annex, Centavos, PresumidoActivity, Retencoes } from "@ai4a/fiscal-core";
import { generatePortfolio, type Portfolio } from "@ai4a/simulator";

export type Regime = "simples" | "presumido";

/** Inputs the documents of the month cannot give: history of the company and municipal data. */
export type TaxContext =
  | {
      regime: "simples";
      annex: Annex | "FATOR_R";
      /** Gross revenue of the 12 months before the competencia (RBT12), centavos. */
      rbt12: Centavos;
      /** 12-month payroll, for fator R. */
      payroll12: Centavos;
      /** Revenue of the calendar year before the competencia (RBA without the month). */
      rbaBefore: Centavos;
      /** Revenue of the previous calendar year (RBAA). */
      rbaa: Centavos;
    }
  | {
      regime: "presumido";
      activity: PresumidoActivity;
      /** Municipal ISS rate in bp; 0 when the company does not render services. */
      issRateBp: number;
      /** Months of the same quarter before the competencia, with revenue and federal withholdings. */
      quarterPrior: { competencia: string; revenue: Centavos; retencoes: Retencoes }[];
    };

export interface TaxContextRequest {
  cnpj: string;
  month: string;
  regime: Regime;
}

/** Where the history comes from: the firm's ERP in real runs, the simulator in CI (ADR 0007). */
export interface TaxContextProvider {
  readonly name: string;
  contextFor(req: TaxContextRequest): Promise<TaxContext>;
}

const SIM_START = "2026-07";

/** History of the fictional companies, derived from their past revenue (never from the expected taxes). */
export class SimulatorTaxContext implements TaxContextProvider {
  readonly name = "simulator";
  private cache = new Map<string, Portfolio>();

  constructor(private seed: number) {}

  private portfolio(month: string): Portfolio {
    let p = this.cache.get(month);
    if (!p) {
      const months: string[] = [];
      for (let m = SIM_START; m <= month; m = nextMonth(m)) months.push(m);
      if (months.length === 0) throw new Error(`simulator starts at ${SIM_START}, got ${month}`);
      p = generatePortfolio(this.seed, months);
      this.cache.set(month, p);
    }
    return p;
  }

  async contextFor({ cnpj, month, regime }: TaxContextRequest): Promise<TaxContext> {
    const entry = this.portfolio(month).companies.find((c) => c.company.cnpj === cnpj);
    if (!entry) throw new Error(`simulator has no company with CNPJ ${cnpj}`);
    const { company, months } = entry;
    const profile = company.profile;
    if (profile.regime !== regime) throw new Error(`regime mismatch for ${cnpj}`);
    const before = months.filter((m) => m.competencia < month);
    if (regime === "simples") {
      const rbt12 = [...company.history, ...before.map((m) => m.expected.revenue)]
        .slice(-12)
        .reduce((a, b) => a + b, 0);
      return {
        regime,
        annex: profile.annex ?? "III",
        rbt12,
        payroll12: Math.round(rbt12 * company.payrollRatio),
        rbaBefore: company.yearToDate + before.reduce((a, m) => a + m.expected.revenue, 0),
        rbaa: company.rbaa,
      };
    }
    const quarterStart =
      month.slice(0, 5) + String(Math.floor((+month.slice(5) - 1) / 3) * 3 + 1).padStart(2, "0");
    return {
      regime,
      activity: profile.activity ?? "servicos_geral",
      issRateBp: profile.sells === "nfse" ? (profile.issRateBp ?? 0) : 0,
      quarterPrior: before
        .filter((m) => m.competencia >= quarterStart)
        .map((m) => ({
          competencia: m.competencia,
          revenue: m.expected.revenue,
          retencoes: m.expected.retencoes,
        })),
    };
  }
}

function nextMonth(m: string): string {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
