import type { Client } from "./types";

/**
 * Simples Nacional ceiling: R$ 4.800.000,00 of gross revenue in the last 12 months (RBT12),
 * LC 123/2006, art. 3º, II (amount from LC 155/2016). State ICMS/ISS sublimit: R$ 3.600.000,00,
 * LC 123/2006, art. 19, I and II (same LC 155/2016 wording).
 * Lucro Presumido: R$ 78.000.000,00 per year, Lei 9.718/1998, art. 13 (Lei 12.814/2013).
 */
export const SIMPLES_CEILING_CENTS = 480_000_000;
export const SIMPLES_SUBLIMIT_CENTS = 360_000_000;
export const PRESUMIDO_CEILING_CENTS = 7_800_000_000;

export interface CeilingUsage {
  usedCents: number;
  limitCents: number;
  /** Share of the limit used, 0..100+ (rounded). */
  pct: number;
  /** "ok" below 80%, "perto" from 80% to the limit, "acima" over it. */
  level: "ok" | "perto" | "acima";
  /** pt-BR, e.g. "teto do Simples". */
  label: string;
  /** Simples only: true when RBT12 passed the state sublimit. */
  overSublimit: boolean;
}

export function ceilingUsage(
  client: Pick<Client, "regime" | "rbt12Cents" | "monthlyRevenueCents">,
): CeilingUsage {
  const used = client.rbt12Cents ?? client.monthlyRevenueCents * 12;
  const simples = client.regime.startsWith("Simples");
  const limit = simples ? SIMPLES_CEILING_CENTS : PRESUMIDO_CEILING_CENTS;
  const pct = Math.round((used / limit) * 100);
  return {
    usedCents: used,
    limitCents: limit,
    pct,
    level: pct > 100 ? "acima" : pct >= 80 ? "perto" : "ok",
    label: simples ? "teto do Simples" : "limite Presumido",
    overSublimit: simples && used > SIMPLES_SUBLIMIT_CENTS,
  };
}
