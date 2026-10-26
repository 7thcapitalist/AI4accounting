/**
 * CNPJ check digits (modulo 11).
 * Source: Receita Federal, IN RFB 2.229/2024 (alphanumeric CNPJ from July 2026) and the
 * classic rule it keeps: each character's value is its ASCII code minus 48 ("0"-"9" -> 0-9,
 * "A"-"Z" -> 17-42); weights run 2..9 from right to left over the preceding characters;
 * DV = 0 when the remainder is 0 or 1, otherwise 11 - remainder. The first DV covers the
 * first 12 characters, the second covers the first 12 plus the first DV.
 */
const CNPJ_FORMAT = /^[0-9A-Z]{12}\d{2}$/;

function cnpjDigit(chars: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = chars.length - 1; i >= 0; i--) {
    sum += (chars.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Removes ".", "/" and "-" and upper-cases. Does not validate. */
export function normalizeCnpj(value: string): string {
  return value.replace(/[./-]/g, "").toUpperCase();
}

/** True when the CNPJ (formatted or not) has a valid format and valid check digits. */
export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (!CNPJ_FORMAT.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // all-equal digits pass the math but are invalid
  const base = cnpj.slice(0, 12);
  const dv1 = cnpjDigit(base);
  const dv2 = cnpjDigit(base + dv1);
  return cnpj.slice(12) === `${dv1}${dv2}`;
}
