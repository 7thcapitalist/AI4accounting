import {
  ANNEX_TABLES,
  type Annex,
  type AnnexBand,
  SIMPLES_CEILING,
  SIMPLES_SUBLIMIT,
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

const isNonNegInt = (v: number) => Number.isSafeInteger(v) && v >= 0;

/**
 * Annex III when fator r = FS12 / RBT12 >= 0,28, otherwise Annex V (CGSN 140/2018 art. 26; Manual
 * PGDAS-D 2018 v4 sec. 8.2). The PGDAS-D truncates fator r to 2 decimals (0,2774 -> 0,27), which is
 * equivalent to the exact integer test payroll12 x 100 >= 28 x RBT12 (no floats). Zero denominators:
 * - FS12 = 0 (any RBT12, including 0): fator r = 0,01 -> Annex V;
 * - FS12 > 0 and RBT12 = 0: fator r = 0,28 -> Annex III.
 * For a company in its opening month pass the payroll and revenue of the month on the same basis
 * (both annualized x12 or both raw); the ratio is what matters.
 */
export function annexByFatorR(payroll12: Centavos, rbt12: Centavos): "III" | "V" {
  if (!isNonNegInt(payroll12)) throw new Error(`Invalid payroll (folha) in centavos: ${payroll12}`);
  if (!isNonNegInt(rbt12)) throw new Error(`Invalid RBT12 in centavos: ${rbt12}`);
  if (payroll12 === 0) return "V";
  if (rbt12 === 0) return "III";
  return big(payroll12) * 100n >= FATOR_R_MIN_PCT * big(rbt12) ? "III" : "V";
}

/** Band lookup. RBT12 = 0 (opening month without history) falls in band 1. */
export function findBand(annex: Annex, rbt12: Centavos): AnnexBand {
  if (!isNonNegInt(rbt12)) throw new Error("RBT12 must be a non-negative integer");
  if (rbt12 > SIMPLES_CEILING)
    throw new Error("RBT12 above the Simples Nacional ceiling (R$ 4.800.000,00)");
  const band = ANNEX_TABLES[annex].find((b) => rbt12 <= b.upTo);
  if (!band) throw new Error("No band found");
  return band;
}

/** CGSN 140/2018 / Manual PGDAS-D sec. 8.1: when RBT12 = 0 the effective rate uses RBT12 = R$ 1,00. */
const RBT12_ZERO_SUBSTITUTE: Centavos = 100;

/** Effective rate of a band as an exact fraction: (RBT12 x Aliq - PD) / RBT12, over 10000 x RBT12. */
function rateFraction(band: AnnexBand, rbt12: Centavos): { num: bigint; den: bigint } {
  const base = big(rbt12 === 0 ? RBT12_ZERO_SUBSTITUTE : rbt12);
  return {
    num: base * big(band.nominalBp) - 10000n * big(band.deductionCentavos),
    den: 10000n * base,
  };
}

/**
 * Effective rate (LC 123/2006 art. 18 par. 1-A; CGSN 140/2018 art. 21) in millionths (1 = 0.0001%),
 * truncated, FOR DISPLAY ONLY. The PGDAS-D computes the amount due with all decimal places (Manual
 * PGDAS-D 2018 v4 sec. 12), so `calculateDas` never uses this rounded value.
 */
export function effectiveRate(annex: Annex, rbt12: Centavos): number {
  const { num, den } = rateFraction(findBand(annex, rbt12), rbt12);
  return Number((num * 1_000_000n) / den);
}

/** Optional sublimit chosen by the state (LC 123/2006 art. 19, I and II): R$ 1,8 mi or R$ 3,6 mi. */
export const SIMPLES_SUBLIMIT_OPTIONAL: Centavos = 180_000_000;
/** Excess over the sublimit tolerated before ICMS/ISS leave the DAS: 20% (LC 123/2006 art. 20 par. 1-3). */
const SUBLIMIT_TOLERANCE_PCT = 120n;

export interface DasInput {
  /** Revenue of the period of apuracao (the month, RPA), in centavos. */
  revenue: Centavos;
  rbt12: Centavos;
  /** Annex III or V is resolved by `payroll12` (fator R); otherwise pass the annex directly. */
  annex: Annex | "FATOR_R";
  /** 12-month payroll (folha de salarios incl. encargos), required when annex is "FATOR_R". */
  payroll12?: Centavos;
  /**
   * RBA: gross revenue accumulated in the calendar year up to and INCLUDING this month (`revenue`).
   * With it, the revenue of the month that crosses the sublimit is split into P1 (up to the
   * sublimit) and P2 (the excess, `min(revenue, rba - sublimit)`), Manual PGDAS-D 2018 v4 sec. 12,
   * ex. 8 and 9. Without it the whole `revenue` is treated as P1.
   */
  rba?: Centavos;
  /**
   * RBAA: gross revenue of the previous calendar year. When above the sublimit, ICMS/ISS are barred
   * from the DAS for the whole year (Manual sec. 8.4.1).
   */
  rbaa?: Centavos;
  /**
   * Sublimit applicable to the establishment's state: R$ 3,6 mi (default, mandatory sublimit) or
   * R$ 1,8 mi (`SIMPLES_SUBLIMIT_OPTIONAL`, states that adopt it).
   */
  sublimit?: Centavos;
  /**
   * Overrides the barred state derived from `rbaa` and `rba` (ICMS/ISS collected outside the DAS).
   * Derived as: RBAA above the sublimit, or RBA before this month above 120% of it. When RBT12 is
   * above R$ 3,6 mi, this flag or `rbaa` is required (CGSN 140/2018 art. 21, III, b). Barred: ICMS/ISS
   * are left out of the DAS (the remaining taxes keep their values) and there is no P1/P2 split.
   */
  icmsIssBarred?: boolean;
}

export interface DasResult {
  annex: Annex;
  /** Effective rate in millionths (percentage with 4 decimals), display only. */
  effectiveRate: number;
  total: Centavos;
  /** Split by tax; sums exactly to `total`. */
  taxes: Partial<Record<SimplesTax, Centavos>>;
  /** Present when the revenue of the month crossed the sublimit: totals of P1 and P2 (sum = total). */
  split?: { p1Revenue: Centavos; p2Revenue: Centavos; p1Total: Centavos; p2Total: Centavos };
}

/** Where ICMS/ISS come from when they are not those of the band of RBT12: band + RBT12-like base. */
interface IssSource {
  band: AnnexBand;
  base: Centavos;
}

interface PartResult {
  total: bigint;
  taxes: Map<SimplesTax, bigint>;
}

/**
 * DAS of one part of the revenue, computed as an exact fraction in BigInt and rounded half up once,
 * at the end (revenue x (RBT12 x Aliq - PD) / RBT12, CGSN 140/2018 art. 21). Each tax gets its share
 * of the effective rate (repartição), with the ISS capped at 5% of revenue and the excess moved
 * proportionally to the other taxes of the band (LC 123/2006 art. 18 par. 1-B, I). Centavos are
 * allocated by largest remainder so the parts always add up to the total.
 * `iss`: undefined = ICMS/ISS of the band itself; null = barred (left out); otherwise taken from
 * the formula of `iss.band` at `iss.base` while the federal taxes keep the band of RBT12.
 */
function dasPart(
  band: AnnexBand,
  rbt12: Centavos,
  revenue: Centavos,
  iss: IssSource | null | undefined,
): PartResult {
  const rev = big(revenue);
  const { num: rateNum, den: rateDen } = rateFraction(band, rbt12);
  const own = iss === undefined;
  const alt = iss ? rateFraction(iss.band, iss.base) : null;
  // Federal terms are over rateDen x 10000, the ICMS/ISS terms over alt.den x 10000 (share in 0.01%);
  // bring both to the common denominator `den`.
  const denFed = rateDen * 10_000n;
  const denIss = (alt?.den ?? rateDen) * 10_000n;
  let den = denFed * (alt ? denIss : 1n);
  const fedMul = alt ? denIss : 1n;
  const issMul = alt ? denFed : 1n;
  const nums = new Map<SimplesTax, bigint>();
  const add = (t: SimplesTax, n: bigint) => nums.set(t, (nums.get(t) ?? 0n) + n);
  for (const [t, s] of Object.entries(band.shares) as [SimplesTax, number][]) {
    const local = t === "ICMS" || t === "ISS";
    if (local && !own) continue;
    add(t, rev * rateNum * big(s) * fedMul);
  }
  // ISS cap redistribution uses the non-ICMS/ISS shares of the band that carries the ISS.
  let issBand = band;
  if (iss && alt) {
    issBand = iss.band;
    for (const t of ["ICMS", "ISS"] as const) {
      const s = iss.band.shares[t];
      if (s) add(t, rev * alt.num * big(s) * issMul);
    }
  }

  const total = divRound(
    [...nums.values()].reduce((a, b) => a + b, 0n),
    den,
  );

  if (nums.has("ISS")) {
    const capNum = (rev * ISS_CAP_BP * den) / 10_000n; // 5% of revenue over `den`
    const issNum = nums.get("ISS") as bigint;
    if (issNum > capNum) {
      const others = (Object.entries(issBand.shares) as [SimplesTax, number][]).filter(
        ([t]) => t !== "ISS" && t !== "ICMS" && nums.has(t),
      );
      const sumOthers = big(others.reduce((a, [, s]) => a + s, 0));
      const excess = issNum - capNum;
      const scaled = new Map<SimplesTax, bigint>();
      for (const [t, n] of nums) scaled.set(t, n * sumOthers);
      for (const [t, s] of others)
        scaled.set(t, (nums.get(t) as bigint) * sumOthers + excess * big(s));
      scaled.set("ISS", capNum * sumOthers);
      for (const [t, n] of scaled) nums.set(t, n);
      den *= sumOthers;
    }
  }

  const floors = [...nums].map(([t, n]) => ({ t, floor: n / den, rem: n % den }));
  let left = total - floors.reduce((a, f) => a + f.floor, 0n);
  for (const f of [...floors].sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0))) {
    if (left <= 0n) break;
    f.floor += 1n;
    left -= 1n;
  }
  return { total, taxes: new Map(floors.map((f) => [f.t, f.floor])) };
}

/**
 * DAS amount and tax split (see `dasPart`), with the P1/P2 split of the month that crosses the
 * sublimit (Manual PGDAS-D 2018 v4 sec. 12, ex. 8 and 9; LC 123/2006 art. 19-20):
 * - P1 (revenue up to the sublimit): normal calculation; above R$ 3,6 mi of RBT12, federal taxes by
 *   the 6th band and ICMS/ISS by the 5th band formula at RBT12 (CGSN 140/2018 art. 21, III, b);
 * - P2 (excess): same federal taxes, ICMS/ISS by the formula of the band of the sublimit evaluated
 *   at its maximum revenue (R$ 3,6 mi or R$ 1,8 mi);
 * - barred (see `icmsIssBarred`): no ICMS/ISS in the DAS and no split.
 * The two parts are rounded half up separately and added.
 */
export function calculateDas(input: DasInput): DasResult {
  const { revenue, rbt12, rba, rbaa } = input;
  if (!isNonNegInt(revenue)) throw new Error("Invalid revenue");
  for (const [name, v] of [
    ["rba", rba],
    ["rbaa", rbaa],
  ] as const) {
    if (v !== undefined && !isNonNegInt(v)) throw new Error(`Invalid ${name}`);
  }
  if (rba !== undefined && rba < revenue)
    throw new Error("rba must include the revenue of the month");
  const sublimit = input.sublimit ?? SIMPLES_SUBLIMIT;
  if (sublimit !== SIMPLES_SUBLIMIT && sublimit !== SIMPLES_SUBLIMIT_OPTIONAL) {
    throw new Error("sublimit must be R$ 1.800.000,00 or R$ 3.600.000,00");
  }
  let annex: Annex;
  if (input.annex === "FATOR_R") {
    if (input.payroll12 === undefined) throw new Error("payroll12 is required for fator R");
    annex = annexByFatorR(input.payroll12, rbt12);
  } else annex = input.annex;

  const band = findBand(annex, rbt12);
  const above = rbt12 > SIMPLES_SUBLIMIT;
  if (above && input.icmsIssBarred === undefined && rbaa === undefined) {
    throw new Error("icmsIssBarred or rbaa is required when RBT12 exceeds R$ 3.600.000,00");
  }
  const priorRba = rba === undefined ? 0 : rba - revenue;
  const barred =
    input.icmsIssBarred ??
    ((rbaa ?? 0) > sublimit || big(priorRba) * 100n > SUBLIMIT_TOLERANCE_PCT * big(sublimit));

  const bands = ANNEX_TABLES[annex];
  const fifth = bands[4] as AnnexBand;
  const sublimitBand = bands.find((b) => b.upTo === sublimit) as AnnexBand;
  // P1 ICMS/ISS source: the 5th band formula at RBT12 when RBT12 is above the 5th band.
  const p1Iss: IssSource | null | undefined = barred
    ? null
    : above
      ? { band: fifth, base: rbt12 }
      : undefined;

  const p2Revenue =
    barred || rba === undefined ? 0 : Math.min(revenue, Math.max(0, rba - sublimit));
  const p1Revenue = revenue - p2Revenue;
  const p1 = dasPart(band, rbt12, p1Revenue, p1Iss);
  const parts = [p1];
  if (p2Revenue > 0) {
    parts.push(dasPart(band, rbt12, p2Revenue, { band: sublimitBand, base: sublimit }));
  }

  const taxes = new Map<SimplesTax, bigint>();
  for (const part of parts) {
    for (const [t, v] of part.taxes) taxes.set(t, (taxes.get(t) ?? 0n) + v);
  }
  const total = parts.reduce((a, p) => a + p.total, 0n);
  return {
    annex,
    effectiveRate: effectiveRate(annex, rbt12),
    total: Number(total),
    taxes: Object.fromEntries([...taxes].map(([t, v]) => [t, Number(v)])),
    ...(p2Revenue > 0
      ? {
          split: {
            p1Revenue,
            p2Revenue,
            p1Total: Number(parts[0]?.total),
            p2Total: Number(parts[1]?.total),
          },
        }
      : {}),
  };
}
