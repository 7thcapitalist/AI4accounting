import type { Annex, Centavos, PresumidoActivity } from "@ai4a/fiscal-core";
import type { MonthAmount } from "./engine";

/** What the Regime agent needs beyond the documents of the month: the revenue and payroll history. */
export interface RegimeContext {
  /** Closed months of revenue through the competencia, oldest first (12 or more for a projection). */
  revenue: MonthAmount[];
  /** Payroll (folha incl. encargos) of the same last 12 months, centavos. */
  payroll12: Centavos;
  /** Simples annex of the company, or "FATOR_R" when it depends on the payroll ratio. */
  annex: Annex | "FATOR_R";
  /** Presumido activity and municipal ISS rate (bp) used by the comparison. */
  activity: PresumidoActivity;
  issRateBp: number;
  /** State sublimit in force: R$ 3,6 mi (default) or R$ 1,8 mi where the state adopts it. */
  sublimit?: Centavos;
}

export interface RegimeContextRequest {
  cnpj: string;
  month: string;
}

/** Where the history comes from: the firm's ERP in real runs, fictitious data in CI (ADR 0007). */
export interface RegimeContextProvider {
  readonly name: string;
  contextFor(req: RegimeContextRequest): Promise<RegimeContext>;
}

/** In-memory provider keyed by CNPJ, for tests and demos with fictitious companies. */
export class StaticRegimeContext implements RegimeContextProvider {
  readonly name = "static";
  constructor(private byCnpj: Record<string, RegimeContext>) {}
  async contextFor({ cnpj }: RegimeContextRequest): Promise<RegimeContext> {
    const ctx = this.byCnpj[cnpj];
    if (!ctx) throw new Error(`no regime context for CNPJ ${cnpj}`);
    return ctx;
  }
}
