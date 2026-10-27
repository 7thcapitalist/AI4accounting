import { describe, expect, it } from "vitest";
import {
  chaveCheckDigit,
  formatCentavos,
  isValidChave,
  isValidChaveWithCnpj,
  isValidCnpj,
  parseCentavos,
  parseChave,
} from "./index";

// All identifiers below are synthetic (check digits computed by hand from the official rule).
// CNPJ 11.222.333/0001-81 is the widely published example CNPJ, not a real client.
const CNPJ = "11222333000181";

function makeChave(first43: string): string {
  return first43 + chaveCheckDigit(first43);
}

const FIRST43 = `35${"2609"}${CNPJ}55001000000123${"1"}12345678`;

describe("money", () => {
  it.each([
    ["0", 0, "0.00"],
    ["1", 100, "1.00"],
    ["1234.5", 123450, "1234.50"],
    ["1234.56", 123456, "1234.56"],
    ["0.05", 5, "0.05"],
    ["-10.01", -1001, "-10.01"],
    ["1.2300", 123, "1.23"],
  ])("parses %s", (input, centavos, out) => {
    expect(parseCentavos(input)).toBe(centavos);
    expect(formatCentavos(centavos)).toBe(out);
    expect(parseCentavos(formatCentavos(centavos))).toBe(centavos);
  });

  it("round-trips 0, 1 and 2 decimals", () => {
    expect(formatCentavos(parseCentavos("12"))).toBe("12.00");
    expect(formatCentavos(parseCentavos("12.3"))).toBe("12.30");
    expect(formatCentavos(parseCentavos("12.34"))).toBe("12.34");
  });

  it("avoids float errors", () => {
    expect(parseCentavos("1.15")).toBe(115);
    expect(parseCentavos("0.29")).toBe(29);
  });

  it("rejects bad input and lossy rounding", () => {
    expect(() => parseCentavos("")).toThrow();
    expect(() => parseCentavos("1,50")).toThrow();
    expect(() => parseCentavos("abc")).toThrow();
    expect(() => parseCentavos("1.234")).toThrow();
    expect(() => formatCentavos(1.5)).toThrow();
  });
});

describe("CNPJ", () => {
  it("accepts valid CNPJ, formatted or not", () => {
    expect(isValidCnpj(CNPJ)).toBe(true);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("accepts a valid alphanumeric CNPJ", () => {
    // Synthetic: 12ABC34501DE + DVs computed per the rule (value = ASCII - 48).
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
  });

  it("rejects wrong digits, bad length and repeated digits", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("11222333000191")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });
});

describe("chave de acesso", () => {
  const chave = makeChave(FIRST43);

  it("has 44 digits and validates", () => {
    expect(chave).toHaveLength(44);
    expect(isValidChave(chave)).toBe(true);
    expect(isValidChaveWithCnpj(chave)).toBe(true);
  });

  it("matches a hand-computed check digit", () => {
    // 43 zeros -> sum 0 -> DV 0; 42 zeros + "1" -> sum 2 -> DV 9.
    expect(chaveCheckDigit("0".repeat(43))).toBe(0);
    expect(chaveCheckDigit(`${"0".repeat(42)}1`)).toBe(9);
    // 42 zeros + "5": sum 10 -> rest 10 -> DV 1.
    expect(chaveCheckDigit(`${"0".repeat(42)}5`)).toBe(1);
    // weights restart at 2 after 9: the 9th digit from the right has weight 2 again.
    // "1" there -> sum 2 -> DV 9.
    expect(chaveCheckDigit(`${"0".repeat(34)}1${"0".repeat(8)}`)).toBe(9);
  });

  it("rejects a wrong check digit, tampered digits and bad format", () => {
    const wrongDv = chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10);
    expect(isValidChave(wrongDv)).toBe(false);
    const tampered = `${chave[0] === "9" ? "1" : "9"}${chave.slice(1)}`;
    expect(isValidChave(tampered)).toBe(false);
    expect(isValidChave(chave.slice(1))).toBe(false);
    expect(isValidChave(`${chave.slice(0, 43)}x`)).toBe(false);
  });

  it("parses components", () => {
    expect(parseChave(chave)).toEqual({
      cUF: chave.slice(0, 2),
      aamm: chave.slice(2, 6),
      cnpj: CNPJ,
      mod: "55",
      serie: "001",
      nNF: "000000123",
      tpEmis: "1",
      cNF: "12345678",
      cDV: chave[43],
    });
    expect(parseChave("123")).toBeNull();
  });

  it("flags a chave whose embedded CNPJ is invalid", () => {
    const bad = makeChave(`${FIRST43.slice(0, 6)}11222333000182${FIRST43.slice(20)}`);
    expect(isValidChave(bad)).toBe(true);
    expect(isValidChaveWithCnpj(bad)).toBe(false);
  });
});
