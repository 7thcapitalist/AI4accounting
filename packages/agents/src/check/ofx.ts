import { parseCentavos } from "@ai4a/fiscal-core";
import type { BankEntry } from "./rules";

/** Reads the STMTTRN lines of an OFX 1.02 (SGML) statement. Lines it cannot read are skipped. */
export function parseOfx(text: string): BankEntry[] {
  const out: BankEntry[] = [];
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g)) {
    const body = m[1] ?? "";
    const field = (tag: string) => new RegExp(`<${tag}>([^<\\r\\n]*)`).exec(body)?.[1]?.trim();
    const amount = field("TRNAMT");
    const fitid = field("FITID");
    if (!amount || !fitid) continue;
    try {
      out.push({
        valor: parseCentavos(amount.replace(",", ".")),
        memo: field("MEMO") ?? "",
        fitid,
      });
    } catch {
      // unreadable amount: leave the line out rather than guess a number
    }
  }
  return out;
}
