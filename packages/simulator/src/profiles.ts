import type { Annex, Centavos, PresumidoActivity } from "@ai4a/fiscal-core";

/** Kind of fictional company the simulator builds. All profiles are Simples Nacional or above (ADR 0009). */
export type ProfileKey =
  | "comercio_simples"
  | "servicos_simples"
  | "fator_r_simples"
  | "sublimite_simples"
  | "servicos_presumido"
  | "comercio_presumido"
  | "clinica_presumido";

export interface Profile {
  key: ProfileKey;
  /** pt-BR label for the UI. */
  label: string;
  regime: "simples" | "presumido";
  /** Simples: the annex, or FATOR_R to let payroll decide III vs V. */
  annex?: Annex | "FATOR_R";
  /** Lucro Presumido: activity for the presumption percentages. */
  activity?: PresumidoActivity;
  /** What the company issues to its customers. */
  sells: "nfe" | "nfse";
  /** Monthly gross revenue range, centavos. */
  revenue: [Centavos, Centavos];
  /** ISS rate in bp for service companies (Goiania, synthetic). */
  issRateBp?: number;
  /** Share of service invoices billed to companies that withhold IRRF/CSRF (Presumido services). */
  withheldShare?: number;
  /** cTribNac (6 digits) used on the NFS-e. */
  cTribNac?: string;
  service?: string;
}

const MIL = 100_000; // R$ 1.000,00 in centavos

export const PROFILES: Record<ProfileKey, Profile> = {
  comercio_simples: {
    key: "comercio_simples",
    label: "Comércio · Simples Anexo I",
    regime: "simples",
    annex: "I",
    sells: "nfe",
    revenue: [60 * MIL, 180 * MIL],
  },
  servicos_simples: {
    key: "servicos_simples",
    label: "Serviços · Simples Anexo III",
    regime: "simples",
    annex: "III",
    sells: "nfse",
    revenue: [30 * MIL, 90 * MIL],
    issRateBp: 300,
    cTribNac: "010701",
    service: "Suporte técnico em informática",
  },
  fator_r_simples: {
    key: "fator_r_simples",
    label: "Serviços · Simples com fator R",
    regime: "simples",
    annex: "FATOR_R",
    sells: "nfse",
    revenue: [40 * MIL, 120 * MIL],
    issRateBp: 300,
    cTribNac: "010101",
    service: "Análise e desenvolvimento de sistemas",
  },
  sublimite_simples: {
    key: "sublimite_simples",
    label: "Comércio · Simples perto do sublimite",
    regime: "simples",
    annex: "I",
    sells: "nfe",
    revenue: [330 * MIL, 420 * MIL],
  },
  servicos_presumido: {
    key: "servicos_presumido",
    label: "Consultoria · Lucro Presumido",
    regime: "presumido",
    activity: "servicos_geral",
    sells: "nfse",
    revenue: [80 * MIL, 260 * MIL],
    issRateBp: 500,
    withheldShare: 0.6,
    cTribNac: "170101",
    service: "Consultoria empresarial",
  },
  comercio_presumido: {
    key: "comercio_presumido",
    label: "Distribuidora · Lucro Presumido",
    regime: "presumido",
    activity: "comercio_industria",
    sells: "nfe",
    revenue: [250 * MIL, 600 * MIL],
  },
  clinica_presumido: {
    key: "clinica_presumido",
    label: "Clínica médica · Lucro Presumido",
    regime: "presumido",
    activity: "servicos_geral",
    sells: "nfse",
    revenue: [70 * MIL, 220 * MIL],
    issRateBp: 300,
    withheldShare: 0,
    cTribNac: "040301",
    service: "Consultas médicas ambulatoriais",
  },
};

/** The default 15-company portfolio: a mix a small firm in Goiania would have. */
export const DEFAULT_PORTFOLIO: ProfileKey[] = [
  "comercio_simples",
  "comercio_simples",
  "comercio_simples",
  "servicos_simples",
  "servicos_simples",
  "servicos_simples",
  "fator_r_simples",
  "fator_r_simples",
  "sublimite_simples",
  "servicos_presumido",
  "servicos_presumido",
  "servicos_presumido",
  "comercio_presumido",
  "clinica_presumido",
  "clinica_presumido",
];
