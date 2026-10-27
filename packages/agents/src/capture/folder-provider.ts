import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseNfeProc, parseNfse } from "@ai4a/fiscal-core";
import type {
  CapturedFile,
  CaptureProvider,
  CaptureRequest,
  CaptureResult,
  RejectedFile,
} from "./provider";

/**
 * Reads a folder of XML (NF-e nfeProc, NFS-e Padrao Nacional), `.ofx` and `.csv` (ERP ledger).
 * The month folder is the first that exists of `<root>/*<cnpj>*\/<month>`, `<root>/<month>`, `<root>`,
 * which matches what `pnpm --filter @ai4a/simulator sim` writes.
 */
export class FolderProvider implements CaptureProvider {
  readonly name = "folder";

  constructor(private root: string) {}

  private dirFor({ cnpj, month }: CaptureRequest): string {
    const dirs = readdirSync(this.root).sort();
    for (const d of dirs) {
      const p = join(this.root, d, month);
      if (d.includes(cnpj) && existsSync(p)) return p;
    }
    const byMonth = join(this.root, month);
    return existsSync(byMonth) ? byMonth : this.root;
  }

  async capture(req: CaptureRequest): Promise<CaptureResult> {
    const dir = this.dirFor(req);
    const files: CapturedFile[] = [];
    const rejected: RejectedFile[] = [];
    const names = readdirSync(dir)
      .filter((n) => statSync(join(dir, n)).isFile())
      .sort();
    for (const name of names) {
      const content = readFileSync(join(dir, name), "utf8");
      const lower = name.toLowerCase();
      if (lower.endsWith(".ofx")) files.push({ kind: "ofx", name, content });
      else if (lower.endsWith(".csv")) files.push({ kind: "ledger", name, content });
      else if (lower.endsWith(".xml")) {
        try {
          const f = parseXmlFile(name, content, req);
          if (f) files.push(f);
          else rejected.push({ name, reason: "outside the competencia" });
        } catch (err) {
          rejected.push({ name, reason: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return { files, rejected };
  }
}

/** Returns undefined for a valid document that belongs to another competencia. */
function parseXmlFile(
  name: string,
  content: string,
  req: CaptureRequest,
): CapturedFile | undefined {
  if (content.includes("<nfeProc")) {
    const d = parseNfeProc(content, { clientCnpj: req.cnpj });
    if (d.competencia !== req.month) return undefined;
    return { kind: "nfe", name, content, key: d.chave, amountCentavos: d.valorTotal };
  }
  if (content.includes("<NFSe")) {
    const d = parseNfse(content, { clientCnpj: req.cnpj });
    if (d.competencia !== req.month) return undefined;
    return { kind: "nfse", name, content, key: d.chave ?? d.numero, amountCentavos: d.valorTotal };
  }
  throw new Error("unrecognized XML (expected nfeProc or NFSe)");
}
