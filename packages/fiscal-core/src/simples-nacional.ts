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

export interface DasInput {
  /** Revenue of the period of apuracao (the month), in centavos. */
  revenue: Centavos;
  rbt12: Centavos;
  /** Annex III or V is resolved by `payroll12` (fator R); otherwise pass the annex directly. */
  annex: Annex | "FATOR_R";
  /** 12-month payroll (folha de salarios incl. encargos), required when annex is "FATOR_R". */
  payroll12?: Centavos;
  /**
   * True when the establishment is barred from collecting ICMS/ISS inside the DAS: RBAA above the
   * sublimit of the state, or RBA above it by more than 20% (from the month after the excess), see
   * Manual PGDAS-D 2018 v4 sec. 8.4.1. The state sublimit (R$ 3,6 mi, or R$ 1,8 mi in states that
   * adopt it) and the RBA/RBAA are not derivable from RBT12, so the caller must say so; it is required
   * when RBT12 exceeds R$ 3,6 mi (CGSN 140/2018 art. 21, III, b) and optional (default false) otherwise.
   * Barred: ICMS/ISS are left out of the DAS (the remaining taxes keep their values).
   * Not barred above R$ 3,6 mi: federal taxes by the 6th band, ICMS/ISS by the 5th band formula.
   * Not modelled: the P1/P2 split of the revenue of the month around the sublimit (sec. 12, ex. 8).
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
}

/**
 * DAS amount and tax split, computed as an exact fraction in BigInt and rounded half up once, at the
 * end (revenue x (RBT12 x Aliq - PD) / RBT12, CGSN 140/2018 art. 21). Each tax gets its share of the
 * effective rate (repartição), with the ISS capped at 5% of revenue and the excess moved
 * proportionally to the other taxes of the band (LC 123/2006 art. 18 par. 1-B, I). Centavos are
 * allocated by largest remainder so the parts always add up to the total.
 */
export function calculateDas(input: DasInput): DasResult {
  const { revenue, rbt12 } = input;
  if (!isNonNegInt(revenue)) throw new Error("Invalid revenue");
  let annex: Annex;
  if (input.annex === "FATOR_R") {
    if (input.payroll12 === undefined) throw new Error("payroll12 is required for fator R");
    annex = annexByFatorR(input.payroll12, rbt12);
  } else annex = input.annex;

  const band = findBand(annex, rbt12);
  const above = rbt12 > SIMPLES_SUBLIMIT;
  if (above && input.icmsIssBarred === undefined) {
    throw new Error("icmsIssBarred is required when RBT12 exceeds R$ 3.600.000,00");
  }
  const barred = input.icmsIssBarred === true;

  const rev = big(revenue);
  const { num: rateNum, den: rateDen } = rateFraction(band, rbt12);
  // Every amount is rev x rateNum x share / den, share in 0.01% of the effective rate.
  let den = rateDen * 10_000n;
  const nums = new Map<SimplesTax, bigint>();
  const add = (t: SimplesTax, n: bigint) => nums.set(t, (nums.get(t) ?? 0n) + n);
  for (const [t, s] of Object.entries(band.shares) as [SimplesTax, number][]) {
    if (barred && (t === "ICMS" || t === "ISS")) continue;
    add(t, rev * rateNum * big(s));
  }

  // ISS cap redistribution uses the shares of the band that carries the ISS.
  let issBand = band;
  if (above && !barred) {
    // CGSN 140/2018 art. 21, III, b: RBT12 above the 5th band with the sublimit not exceeded:
    // federal taxes by the 6th band, ICMS/ISS by the 5th band formula (Manual sec. 12, ex. 8).
    issBand = ANNEX_TABLES[annex][4] as AnnexBand;
    const r5 = rateFraction(issBand, rbt12);
    for (const t of ["ICMS", "ISS"] as const) {
      const s = issBand.shares[t];
      if (s) add(t, rev * r5.num * big(s));
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
  return {
    annex,
    effectiveRate: effectiveRate(annex, rbt12),
    total: Number(total),
    taxes: Object.fromEntries(floors.map((f) => [f.t, Number(f.floor)])),
  };
}
