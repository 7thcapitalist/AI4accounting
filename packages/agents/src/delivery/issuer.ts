import { gerarDas, type IntegraContadorClient } from "@ai4a/integra-contador";

export interface DasRequest {
  cnpj: string;
  /** Period of apuracao, YYYY-MM. */
  month: string;
  /** Amount the Tax agent drafted; a simulated issuer echoes it, the real one ignores it. */
  expectedCentavos: number;
}

export interface IssuedDas {
  numeroDas: string;
  amountCentavos: number;
  pdf: Buffer;
}

/** Issues the DAS for a Simples month. Real implementation: Integra Contador, demonstration env only. */
export interface DasIssuer {
  readonly name: string;
  issue(req: DasRequest): Promise<IssuedDas>;
}

interface GerarDasItem {
  detalhamento?: { numeroDas?: string; valorTotalDas?: number };
  pdf?: string;
}

/**
 * PGDAS-D GERARDAS12 through the Integra Contador client (trial host only, enforced by the client).
 * `valorTotalDas` comes in reais; money inside the repo is integer centavos.
 */
export class IntegraDasIssuer implements DasIssuer {
  readonly name = "integra-contador-trial";

  constructor(private client: IntegraContadorClient) {}

  async issue({ cnpj, month }: DasRequest): Promise<IssuedDas> {
    const res = await gerarDas(this.client, cnpj, month.replace("-", ""));
    const item = (Array.isArray(res.dados) ? res.dados[0] : undefined) as GerarDasItem | undefined;
    const numeroDas = item?.detalhamento?.numeroDas;
    const valor = item?.detalhamento?.valorTotalDas;
    if (!numeroDas || typeof valor !== "number" || !item?.pdf) {
      throw new Error("Integra Contador: resposta do GERARDAS12 sem numeroDas, valor ou pdf");
    }
    return {
      numeroDas,
      amountCentavos: Math.round(valor * 100),
      pdf: Buffer.from(item.pdf, "base64"),
    };
  }
}

/** Offline stand-in for demo runs and tests: a synthetic slip with the drafted amount. */
export class SimulatedDasIssuer implements DasIssuer {
  readonly name = "simulated-das";

  async issue({ month, expectedCentavos }: DasRequest): Promise<IssuedDas> {
    const numeroDas = `SIM${month.replace("-", "")}${String(expectedCentavos).padStart(10, "0")}`;
    return {
      numeroDas,
      amountCentavos: expectedCentavos,
      pdf: Buffer.from(`%PDF-1.4 synthetic DAS ${numeroDas}\n`, "utf8"),
    };
  }
}
