export type CapturedKind = "nfe" | "nfse" | "ofx" | "ledger";

export interface CaptureRequest {
  /** CNPJ of the client, 14 digits. */
  cnpj: string;
  /** Competencia, YYYY-MM. */
  month: string;
}

export interface CapturedFile {
  kind: CapturedKind;
  /** Original file name, kept for the audit trail. */
  name: string;
  /** Raw file content, stored byte for byte. */
  content: Uint8Array;
  /** Chave de acesso (NF-e) or NFS-e number/chave, when the kind has one. */
  key?: string;
  amountCentavos?: number;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface CaptureResult {
  files: CapturedFile[];
  /** Files the provider saw but could not use; the agent turns each into a finding. */
  rejected: RejectedFile[];
}

/** Where documents come from. CI only uses implementations that never touch the network (ADR 0007). */
export interface CaptureProvider {
  readonly name: string;
  capture(req: CaptureRequest): Promise<CaptureResult>;
}
