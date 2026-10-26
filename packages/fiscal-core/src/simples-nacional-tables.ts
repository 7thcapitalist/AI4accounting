import type { Centavos } from "./types";

/**
 * Simples Nacional annex tables.
 * Source: Lei Complementar 123/2006, Anexos I to V, as amended by LC 155/2016 (in force since 2018-01-01);
 * same tables reproduced in Resolucao CGSN 140/2018, Anexos I a V.
 * https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm
 * Nominal rates and shares are stored in basis points of percent (1 = 0.01%), PD in centavos.
 */
export type Annex = "I" | "II" | "III" | "IV" | "V";
export type SimplesTax = "IRPJ" | "CSLL" | "COFINS" | "PIS" | "CPP" | "ICMS" | "IPI" | "ISS";

export interface AnnexBand {
  /** Inclusive upper bound of RBT12 for this band, in centavos. */
  upTo: Centavos;
  /** Aliquota nominal, in 0.01%. */
  nominalBp: number;
  /** Parcela a deduzir, in centavos. */
  deductionCentavos: Centavos;
  /** Repartição dos tributos (% of the effective rate), in 0.01%; sums to 10000. */
  shares: Partial<Record<SimplesTax, number>>;
}

const R = (reais: number): Centavos => reais * 100;

/** LC 123/2006 art. 3, II: ceiling of R$ 4.800.000,00 of annual gross revenue. */
export const SIMPLES_CEILING: Centavos = R(4_800_000);
/** LC 123/2006 art. 19, I (R$ 3.600.000,00): above it, ICMS/ISS are collected outside the DAS (CGSN 140/2018 art. 13). */
export const SIMPLES_SUBLIMIT: Centavos = R(3_600_000);

const LIMITS = [180_000, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000].map(R);

type Row = [nominalPct100: number, deductionReais: number, shares: number[]];

function build(taxes: SimplesTax[], rows: Row[]): AnnexBand[] {
  return rows.map(([nominalBp, pd, shares], i) => {
    const sum = shares.reduce((a, b) => a + b, 0);
    if (sum !== 10000 || shares.length !== taxes.length) {
      throw new Error(`Annex table row ${i + 1} is inconsistent`);
    }
    return {
      upTo: LIMITS[i] as Centavos,
      nominalBp,
      deductionCentavos: R(pd),
      shares: Object.fromEntries(taxes.map((t, j) => [t, shares[j]])),
    };
  });
}

const T_COM: SimplesTax[] = ["IRPJ", "CSLL", "COFINS", "PIS", "CPP", "ICMS"];
const T_IND: SimplesTax[] = ["IRPJ", "CSLL", "COFINS", "PIS", "CPP", "IPI", "ICMS"];
const T_SRV: SimplesTax[] = ["IRPJ", "CSLL", "COFINS", "PIS", "CPP", "ISS"];
const T_IV: SimplesTax[] = ["IRPJ", "CSLL", "COFINS", "PIS", "ISS"];

export const ANNEX_TABLES: Record<Annex, AnnexBand[]> = {
  // Anexo I - Comercio
  I: build(T_COM, [
    [400, 0, [550, 350, 1274, 276, 4150, 3400]],
    [730, 5_940, [550, 350, 1274, 276, 4150, 3400]],
    [950, 13_860, [550, 350, 1274, 276, 4200, 3350]],
    [1070, 22_500, [550, 350, 1274, 276, 4200, 3350]],
    [1430, 87_300, [550, 350, 1274, 276, 4200, 3350]],
    [1900, 378_000, [1350, 1000, 2827, 613, 4210, 0]],
  ]),
  // Anexo II - Industria
  II: build(T_IND, [
    [450, 0, [550, 350, 1151, 249, 3750, 750, 3200]],
    [780, 5_940, [550, 350, 1151, 249, 3750, 750, 3200]],
    [1000, 13_860, [550, 350, 1151, 249, 3750, 750, 3200]],
    [1120, 22_500, [550, 350, 1151, 249, 3750, 750, 3200]],
    [1470, 85_500, [550, 350, 1151, 249, 3750, 750, 3200]],
    [3000, 720_000, [850, 750, 2096, 454, 2350, 3500, 0]],
  ]),
  // Anexo III - Servicos (locacao de bens moveis e servicos nao sujeitos ao fator R / com fator R >= 28%)
  III: build(T_SRV, [
    [600, 0, [400, 350, 1282, 278, 4340, 3350]],
    [1120, 9_360, [400, 350, 1405, 305, 4340, 3200]],
    [1350, 17_640, [400, 350, 1364, 296, 4340, 3250]],
    [1600, 35_640, [400, 350, 1364, 296, 4340, 3250]],
    [2100, 125_640, [400, 350, 1282, 278, 4340, 3350]],
    [3300, 648_000, [3500, 1500, 1603, 347, 3050, 0]],
  ]),
  // Anexo IV - Servicos (construcao, vigilancia, limpeza, advocacia); CPP is paid outside the DAS
  IV: build(T_IV, [
    [450, 0, [1880, 1520, 1767, 383, 4450]],
    [900, 8_100, [1980, 1520, 2055, 445, 4000]],
    [1020, 12_420, [2080, 1520, 1973, 427, 4000]],
    [1400, 39_780, [1780, 1920, 1890, 410, 4000]],
    [2200, 183_780, [1880, 1920, 1890, 410, 3900]],
    [3300, 828_000, [5350, 2150, 2055, 445, 0]],
  ]),
  // Anexo V - Servicos intelectuais/tecnicos (fator R < 28%)
  V: build(T_SRV, [
    [1550, 0, [2500, 1500, 1410, 305, 2885, 1400]],
    [1800, 4_500, [2300, 1500, 1410, 305, 2785, 1700]],
    [1950, 9_900, [2400, 1500, 1492, 323, 2385, 1900]],
    [2050, 17_100, [2100, 1500, 1574, 341, 2385, 2100]],
    [2300, 62_100, [2300, 1250, 1410, 305, 2385, 2350]],
    [3050, 540_000, [3500, 1550, 1644, 356, 2950, 0]],
  ]),
};
