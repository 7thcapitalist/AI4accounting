import { generatePortfolio, type Portfolio, toLedgerCsv, toOfx } from "@ai4a/simulator";
import type { CapturedFile, CaptureProvider, CaptureRequest, CaptureResult } from "./provider";

/** Serves the month of a simulated company (seeded, fictional) as if it had been captured. */
export class SimulatorProvider implements CaptureProvider {
  readonly name = "simulator";
  private portfolios = new Map<string, Portfolio>();

  constructor(private seed: number) {}

  private portfolio(month: string): Portfolio {
    let p = this.portfolios.get(month);
    if (!p) {
      p = generatePortfolio(this.seed, [month]);
      this.portfolios.set(month, p);
    }
    return p;
  }

  async capture({ cnpj, month }: CaptureRequest): Promise<CaptureResult> {
    const entry = this.portfolio(month).companies.find((c) => c.company.cnpj === cnpj);
    const sim = entry?.months[0];
    if (!entry || !sim) throw new Error(`simulator has no company with CNPJ ${cnpj}`);
    const files: CapturedFile[] = sim.documents.map((d) => ({
      kind: d.kind,
      name: d.file,
      content: Buffer.from(d.xml, "utf8"),
      key: d.ref,
      amountCentavos: d.valor,
    }));
    files.push({
      kind: "ofx",
      name: "extrato.ofx",
      content: Buffer.from(toOfx(entry.company, sim), "utf8"),
    });
    files.push({
      kind: "ledger",
      name: "razao.csv",
      content: Buffer.from(toLedgerCsv(sim), "utf8"),
    });
    return { files, rejected: [] };
  }
}
