import { readFileSync } from "node:fs";
import { clients, competencias, documents, type Store } from "@ai4a/db";
import { eq } from "drizzle-orm";
import type { Agent, AgentEvent, AgentResult, AgentTask } from "../types";
import {
  type BankEntry,
  type DocFact,
  type LedgerEntry,
  parseDocFact,
  parseLedgerCsv,
  parseOfx,
} from "./parse";
import { reconcile } from "./reconcile";

const SEVERITY = {
  missing_invoice: "blocker",
  bank_without_document: "blocker",
  amount_mismatch: "warning",
  cancelled: "blocker",
} as const;

/**
 * Agent 3 (phase `conciliacao`): crosses the stored documents, the ERP ledger and the bank
 * statement. Every item that does not match becomes a finding. No LLM: matching is rules.
 */
export class ReconciliationAgent implements Agent {
  readonly name = "reconciliation";

  constructor(private d: { store: Store }) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const { db } = this.d.store;
    const [row] = await db
      .select({ cnpj: clients.cnpj })
      .from(competencias)
      .innerJoin(clients, eq(clients.id, competencias.clientId))
      .where(eq(competencias.id, task.competenciaId));
    if (!row) throw new Error(`unknown competencia ${task.competenciaId}`);
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.competenciaId, task.competenciaId));

    const facts: DocFact[] = [];
    const bank: BankEntry[] = [];
    const ledger: LedgerEntry[] = [];
    const read = (path: string | null) => (path ? readFileSync(path, "utf8") : "");
    for (const r of rows) {
      if (r.kind === "ofx") bank.push(...parseOfx(read(r.storagePath)));
      else if (r.kind === "ledger") ledger.push(...parseLedgerCsv(read(r.storagePath)));
      else if (r.kind === "nfe" || r.kind === "nfse") {
        const f = parseDocFact(r.kind, read(r.storagePath), row.cnpj);
        if (f) facts.push(f);
      }
    }

    const found = reconcile({ documents: facts, ledger, bank });
    const events: AgentEvent[] = [
      {
        kind: "reconciliation.summary",
        payload: {
          documents: facts.length,
          ledger: ledger.length,
          bank: bank.length,
          findings: found.length,
        },
      },
    ];
    return {
      events,
      findings: found.map((f) => ({
        severity: SEVERITY[f.type],
        message: f.message,
        source: f.source,
      })),
    };
  }
}
