import type { Rng } from "./rng";

/** Check digit with the Receita Federal module-11 rule (same rule fiscal-core validates). */
function digit(chars: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = chars.length - 1; i >= 0; i--) {
    sum += (chars.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * Synthetic numeric CNPJ with valid check digits. The root starts with "9" and the branch is 0001,
 * so it never collides with the published example CNPJs used in other fixtures. Not a real company.
 */
export function syntheticCnpj(rng: Rng): string {
  const base = `9${rng.digits(7)}0001`;
  const d1 = digit(base);
  const d2 = digit(base + d1);
  return `${base}${d1}${d2}`;
}
