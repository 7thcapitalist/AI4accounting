import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clients, competencias, documents, type Store } from "@ai4a/db";
import { eq } from "drizzle-orm";
import type { Agent, AgentEvent, AgentFinding, AgentResult, AgentTask } from "../types";
import type { CapturedKind, CaptureProvider } from "./provider";

const EXT: Record<CapturedKind, string> = { nfe: "xml", nfse: "xml", ofx: "ofx", ledger: "csv" };

export interface CaptureAgentDeps {
  store: Store;
  provider: CaptureProvider;
  /** Directory for the raw files, outside git (AI4_DATA_DIR in real runs). */
  dataDir: string;
}

/**
 * Agent 1: pulls the month's documents through a `CaptureProvider`, stores each file once
 * (content-addressed by sha256, never overwritten) and emits one event per document.
 * No LLM. Deciding what is wrong with a document is the Check agent's job.
 */
export class CaptureAgent implements Agent {
  readonly name = "capture";

  constructor(private d: CaptureAgentDeps) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const { store, provider, dataDir } = this.d;
    const [row] = await store.db
      .select({ cnpj: clients.cnpj, month: competencias.month })
      .from(competencias)
      .innerJoin(clients, eq(clients.id, competencias.clientId))
      .where(eq(competencias.id, task.competenciaId));
    if (!row) throw new Error(`unknown competencia ${task.competenciaId}`);

    const { files, rejected } = await provider.capture({ cnpj: row.cnpj, month: row.month });
    mkdirSync(dataDir, { recursive: true });

    const events: AgentEvent[] = [];
    const findings: AgentFinding[] = [];
    const seen = new Set<string>();
    let stored = 0;
    for (const f of files) {
      const sha256 = createHash("sha256").update(f.content).digest("hex");
      const documentId = `doc-${task.competenciaId}-${sha256.slice(0, 16)}`;
      if (seen.has(documentId)) {
        events.push({ kind: "document.duplicate", documentId, payload: { name: f.name, sha256 } });
        continue;
      }
      seen.add(documentId);
      const storagePath = join(dataDir, `${sha256}.${EXT[f.kind]}`);
      // "wx": a stored file is never overwritten; same hash means same bytes.
      try {
        writeFileSync(storagePath, f.content, { flag: "wx" });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      const inserted = await store.db
        .insert(documents)
        .values({
          id: documentId,
          competenciaId: task.competenciaId,
          kind: f.kind,
          key: f.key,
          amountCentavos: f.amountCentavos,
          storagePath,
        })
        .onConflictDoNothing()
        .returning({ id: documents.id });
      if (inserted.length === 0) {
        events.push({ kind: "document.duplicate", documentId, payload: { name: f.name, sha256 } });
        continue;
      }
      stored++;
      events.push({
        kind: "document.captured",
        documentId,
        payload: {
          documentKind: f.kind,
          name: f.name,
          key: f.key,
          amountCentavos: f.amountCentavos,
          sha256,
          provider: provider.name,
        },
      });
    }
    for (const r of rejected) {
      findings.push({
        severity: "warning",
        message: `Arquivo ${r.name} ignorado na captura: ${r.reason}`,
        source: `capture:${provider.name}`,
      });
    }
    if (files.length === 0) {
      findings.push({
        severity: "warning",
        message: `Nenhum documento capturado para ${row.month}`,
        source: `capture:${provider.name}`,
      });
    }
    events.push({
      kind: "capture.summary",
      payload: { provider: provider.name, stored, files: files.length, rejected: rejected.length },
    });
    return { events, findings };
  }
}
