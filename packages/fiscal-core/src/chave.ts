import { isValidCnpj } from "./cnpj";

/**
 * Chave de acesso: 44 digits = cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1)
 * cNF(8) cDV(1).
 * Source: Manual de Orientacao do Contribuinte NF-e (MOC), Visao Geral, "Chave de Acesso da
 * NF-e": cDV is modulo 11 over the first 43 digits, weights 2..9 from right to left
 * (restarting at 2); DV = 0 when the remainder is 0 or 1, otherwise 11 - remainder.
 * CT-e uses the same layout and rule (MOC CT-e).
 * Note: the 2026 alphanumeric CNPJ also changes this field; numeric chaves only for now.
 */
export interface ChaveAcesso {
  cUF: string;
  aamm: string;
  cnpj: string;
  mod: string;
  serie: string;
  nNF: string;
  tpEmis: string;
  cNF: string;
  cDV: string;
}

const CHAVE_FORMAT = /^\d{44}$/;

/** Computes the cDV for the first 43 digits of a chave. */
export function chaveCheckDigit(first43: string): number {
  if (!/^\d{43}$/.test(first43)) throw new Error("Expected 43 digits");
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(first43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Splits a 44-digit chave into its components, or returns null if the format is wrong. */
export function parseChave(chave: string): ChaveAcesso | null {
  if (!CHAVE_FORMAT.test(chave)) return null;
  return {
    cUF: chave.slice(0, 2),
    aamm: chave.slice(2, 6),
    cnpj: chave.slice(6, 20),
    mod: chave.slice(20, 22),
    serie: chave.slice(22, 25),
    nNF: chave.slice(25, 34),
    tpEmis: chave.slice(34, 35),
    cNF: chave.slice(35, 43),
    cDV: chave.slice(43),
  };
}

/** True when the chave has 44 digits and a correct check digit. */
export function isValidChave(chave: string): boolean {
  return CHAVE_FORMAT.test(chave) && chaveCheckDigit(chave.slice(0, 43)) === Number(chave[43]);
}

/** Stricter: also requires the embedded issuer CNPJ to have valid check digits. */
export function isValidChaveWithCnpj(chave: string): boolean {
  const parts = parseChave(chave);
  return parts !== null && isValidChave(chave) && isValidCnpj(parts.cnpj);
}
