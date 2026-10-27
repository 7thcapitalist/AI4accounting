import type { CaptureProvider, CaptureRequest, CaptureResult } from "./provider";

/**
 * NFS-e Nacional (ADN) distribution. Stub: the real call needs the client's A1 certificate
 * and is not allowed in CI (ADR 0007). Enabled only by ADN_NFSE_BASE_URL, and even then
 * it refuses until the mTLS client is built (Phase 6).
 */
export class AdnNfseProvider implements CaptureProvider {
  readonly name = "adn-nfse";

  constructor(private env: Record<string, string | undefined> = process.env) {}

  async capture(_req: CaptureRequest): Promise<CaptureResult> {
    if (!this.env.ADN_NFSE_BASE_URL)
      throw new Error("ADN NFS-e provider disabled: ADN_NFSE_BASE_URL is not set");
    throw new Error(
      "ADN NFS-e provider is a stub: the A1 certificate client is not implemented yet",
    );
  }
}
