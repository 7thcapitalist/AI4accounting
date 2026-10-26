import type { Centavos } from "./types";

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a decimal string from an XML (e.g. "1234.56", "10", "0.5") into integer centavos
 * without going through floats. XML amounts use "." as separator. More than 2 decimals is
 * accepted only when the extra digits are zeros (e.g. "1.2300"); otherwise it throws,
 * since rounding would silently change a tax amount.
 */
export function parseCentavos(value: string): Centavos {
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal amount: "${value}"`);
  const [, sign, int = "0", frac = ""] = match;
  if (/[1-9]/.test(frac.slice(2))) {
    throw new Error(`Amount has more than 2 significant decimals: "${value}"`);
  }
  const centavos = Number(int) * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) throw new Error(`Amount out of range: "${value}"`);
  return sign ? -centavos : centavos;
}

/** Formats integer centavos as a decimal string with 2 decimals ("123456" -> "1234.56"). */
export function formatCentavos(centavos: Centavos): string {
  if (!Number.isSafeInteger(centavos)) throw new Error(`Not an integer centavos: ${centavos}`);
  const abs = Math.abs(centavos);
  const frac = String(abs % 100).padStart(2, "0");
  return `${centavos < 0 ? "-" : ""}${Math.floor(abs / 100)}.${frac}`;
}
