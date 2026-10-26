import { buildCompany, type Company, generateMonth, type PriorMonth, type SimMonth } from "./month";
import { DEFAULT_PORTFOLIO, PROFILES, type ProfileKey } from "./profiles";

export interface Portfolio {
  seed: number;
  companies: { company: Company; months: SimMonth[] }[];
}

/** Competencias simulated by default: the third quarter of 2026 (closes a Lucro Presumido quarter). */
export const DEFAULT_MONTHS = ["2026-07", "2026-08", "2026-09"];

export function generatePortfolio(
  seed: number,
  months: string[] = DEFAULT_MONTHS,
  profiles: ProfileKey[] = DEFAULT_PORTFOLIO,
): Portfolio {
  const companies = profiles.map((key, i) => {
    const company = buildCompany(seed, i, PROFILES[key]);
    const prior: PriorMonth[] = [];
    const simulated: SimMonth[] = [];
    for (const competencia of months) {
      const m = generateMonth(seed, company, competencia, prior);
      simulated.push(m);
      prior.push({ revenue: m.expected.revenue, retencoes: m.expected.retencoes });
    }
    return { company, months: simulated };
  });
  return { seed, companies };
}
