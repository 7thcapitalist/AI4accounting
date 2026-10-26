import {
  ANNEX_TABLES,
  type Annex,
  type AnnexBand,
  SIMPLES_CEILING,
  type SimplesTax,
} from "./simples-nacional-tables";
import type { Centavos } from "./types";

export * from "./simples-nacional-tables";

/** LC 123/2006 art. 18 par. 5-J and 5-M: payroll / revenue ratio of 28% splits Annex III from Annex V. */
const FATOR_R_MIN_PCT = 28n;
/** LC 123/2006 art. 18 par. 1-B, I: ISS share of the effective rate is capped at 5% of the revenue. */
const ISS_CAP_BP = 500n;

const big = (n: number) => BigInt(n);

/** round(num / den) half up, for non-negative BigInts. */
function divRound(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den);
}

/**
 * RBT12 (receita bruta acumulada nos 12 meses anteriores), LC 123/2006 art. 18 par. 1 and
 * Resolucao CGSN 140/2018 art. 16 par. 1-2 (also applied to the 12-month payroll for fator R):
 * - 12+ prior months: sum of the last 12;
 * - 1 to 11 prior months: arithmetic mean of the prior months x 12;
 * - opening month (no prior months): revenue of the current month x 12.
 * `priorMonths` is ordered oldest first; only months since the start of the activity belong in it.
 */
export function annualize(priorMonths: Centavos[], currentMonth: Centavos): Centavos {
  for (const v of [...priorMonths, currentMonth]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`Invalid amount in centavos: ${v}`);
  }
  if (priorMonths.length >= 12) return priorMonths.slice(-12).reduce((a, b) => a + b, 0);
  if (priorMonths.length === 0) return currentMonth * 12;
  const sum = priorMonths.reduce((a, b) => a + b, 0);
  return Number(divRound(big(sum) * 12n, big(priorMonths.length)));
}

/** Annex III when payroll12 / rbt12 >= 28%, otherwise Annex V (integer comparison, no floats). */
export function annexByFatorR(payroll12: Centavos, rbt12: Centavos): "III" | "V" {
  if (rbt12 <= 0) throw new Error("RBT12 must be positive to compute fator R");
  return big(payroll12) * 100n >= FATOR_R_MIN_PCT * big(rbt12) ? "III" : "V";
}

export function findBand(annex: Annex, rbt12: Centavos): AnnexBand {
  if (!Number.isSafeInteger(rbt12) || rbt12 <= 0)
    throw new Error("RBT12 must be a positive integer");
  if (rbt12 > SIMPLES_CEILING)
    throw new Error("RBT12 above the Simples Nacional ceiling (R$ 4.800.000,00)");
  const band = ANNEX_TABLES[annex].find((b) => rbt12 <= b.upTo);
  if (!band) throw new Error("No band found");
  return band;
}

/**
 * Effective rate = (RBT12 x Aliq - PD) / RBT12 (LC 123/2006 art. 18 par. 1-A), returned in millionths
 * (1 = 0.0001%, i.e. a percentage with 4 decimals), truncated.
 * Assumption: the PGDAS-D shows the effective rate with 4 decimals; truncation vs rounding must be
 * confirmed against the PGDAS-D calculator.
 */
export function effectiveRate(annex: Annex, rbt12: Centavos): number {
  const band = findBand(annex, rbt12);
  // fraction = (rbt12*bp - 10000*pd) / (10000*rbt12); percentage with 4 decimals = fraction * 1e6
  const num = big(rbt12) * big(band.nominalBp) - 10000n * big(band.deductionCentavos);
  return Number((num * 100n) / big(rbt12));
}

export interface DasInput {
  /** Revenue of the period of apuracao (the month), in centavos. */
  revenue: Centavos;
  rbt12: Centavos;
  /** Annex III or V is resolved by `payroll12` (fator R); otherwise pass the annex directly. */
  annex: Annex | "FATOR_R";
  /** 12-month payroll (folha de salarios incl. encargos), required when annex is "FATOR_R". */
  payroll12?: Centavos;
}

export interface DasResult {
  annex: Annex;
  /** Effective rate in millionths (percentage with 4 decimals). */
  effectiveRate: number;
  total: Centavos;
  /** Split by tax; sums exactly to `total`. */
  taxes: Partial<Record<SimplesTax, Centavos>>;
}

/**
 * DAS amount and tax split. Total = round half up (revenue x effective rate). Each tax gets its
 * share of the effective rate (repartição), with the ISS capped at 5% of revenue and the excess
 * moved proportionally to the other taxes of the band (LC 123/2006 art. 18 par. 1-B, I).
 * Centavos are allocated by largest remainder so the parts always add up to the total.
 */
export function calculateDas(input: DasInput): DasResult {
  const { revenue, rbt12 } = input;
  if (!Number.isSafeInteger(revenue) || revenue < 0) throw new Error("Invalid revenue");
  let annex: Annex;
  if (input.annex === "FATOR_R") {
    if (input.payroll12 === undefined) throw new Error("payroll12 is required for fator R");
    annex = annexByFatorR(input.payroll12, rbt12);
  } else annex = input.annex;

  const band = findBand(annex, rbt12);
  const rate = big(effectiveRate(annex, rbt12));
  const rev = big(revenue);
  const total = divRound(rev * rate, 1_000_000n);

  // Exact rational amounts: numerator n_i / denominator den (per-tax share in bp of the total).
  const entries = Object.entries(band.shares) as [SimplesTax, number][];
  let den = 1_000_000n * 10_000n;
  let nums = new Map<SimplesTax, bigint>(entries.map(([t, s]) => [t, rev * rate * big(s)]));
  const issShare = band.shares.ISS ?? 0;
  if (issShare > 0) {
    const capNum = (rev * ISS_CAP_BP * den) / 10_000n; // 5% of revenue over `den`
    const issNum = nums.get("ISS") as bigint;
    if (issNum > capNum) {
      const others = entries.filter(([t]) => t !== "ISS");
      const sumOthers = big(others.reduce((a, [, s]) => a + s, 0));
      const excess = issNum - capNum;
      const scaled = new Map<SimplesTax, bigint>();
      for (const [t, s] of others) {
        scaled.set(t, (nums.get(t) as bigint) * sumOthers + excess * big(s));
      }
      scaled.set("ISS", capNum * sumOthers);
      nums = scaled;
      den *= sumOthers;
    }
  }

  const floors = entries.map(([t]) => {
    const n = nums.get(t) as bigint;
    return { t, floor: n / den, rem: n % den };
  });
  let left = total - floors.reduce((a, f) => a + f.floor, 0n);
  for (const f of [...floors].sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0))) {
    if (left <= 0n) break;
    f.floor += 1n;
    left -= 1n;
  }
  return {
    annex,
    effectiveRate: Number(rate),
    total: Number(total),
    taxes: Object.fromEntries(floors.map((f) => [f.t, Number(f.floor)])),
  };
}
