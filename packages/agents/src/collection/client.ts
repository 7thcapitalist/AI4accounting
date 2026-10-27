import type { CapturedFile, CaptureProvider } from "../capture";

export interface MissingDoc {
  /** Chave (NF-e) or number (NFS-e), as in the ledger. */
  ref: string;
  date: string;
  counterpart: string;
  amountCentavos: number;
}

export interface ClientReplyRequest {
  cnpj: string;
  month: string;
  missing: MissingDoc[];
}

/** The client side of the conversation. In simulation, the simulator plays the client. */
export interface ClientResponder {
  readonly name: string;
  reply(req: ClientReplyRequest): Promise<CapturedFile[]>;
}

/**
 * Plays the client: answers a request with the files it has, taken from a complete (error-free)
 * source. A ref the source does not hold stays unanswered, like a client who never found the file.
 */
export class SimulatedClient implements ClientResponder {
  readonly name = "simulated-client";

  constructor(private source: CaptureProvider) {}

  async reply({ cnpj, month, missing }: ClientReplyRequest): Promise<CapturedFile[]> {
    const { files } = await this.source.capture({ cnpj, month });
    const wanted = new Set(missing.map((m) => m.ref));
    return files.filter((f) => f.key !== undefined && wanted.has(f.key));
  }
}
