import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clients, competencias, documents, type Store } from "@ai4a/db";
import { eq } from "drizzle-orm";
import type { Agent, AgentEvent, AgentFinding, AgentResult, AgentTask } from "../types";
import type { ClientResponder, MissingDoc } from "./client";
import { draftCollectionMessage } from "./message";

export interface CollectionAgentDeps {
  store: Store;
  responder: ClientResponder;
  /** Directory for files the client sends back, outside git. */
  dataDir: string;
}

/**
 * Agent 2 (phase "coleta"): compares the ERP ledger with the captured documents, drafts a pt-BR
 * WhatsApp-style message listing what is missing and hands it to the `ClientResponder`.
 * It never sends anything: the draft is an event for the accountant, and in simulation the
 * simulator answers. No LLM: the text is a template.
 */
export class CollectionAgent implements Agent {
  readonly name = "collection";

  constructor(private d: CollectionAgentDeps) {}

  private async missing(cid: string): Promise<MissingDoc[]> {
    const { store } = this.d;
    const rows = await store.db
      .select({ kind: documents.kind, key: documents.key, path: documents.storagePath })
      .from(documents)
      .where(eq(documents.competenciaId, cid));
    const have = new Set(rows.filter((r) => r.key).map((r) => r.key));
    const ledger = rows.find((r) => r.kind === "ledger");
    if (!ledger?.path) return [];
    const [, ...lines] = readFileSync(ledger.path, "utf8").trim().split("\n");
    const out: MissingDoc[] = [];
    for (const line of lines) {
      const [date, , ref, counterpart, valor] = line.split(";");
      if (!date || !ref || have.has(ref)) continue;
      out.push({
        date,
        ref,
        counterpart: counterpart ?? "",
        amountCentavos: Math.round(Number(valor) * 100),
      });
    }
    return out;
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const { store, responder, dataDir } = this.d;
    const cid = task.competenciaId;
    const [row] = await store.db
      .select({ name: clients.name, cnpj: clients.cnpj, month: competencias.month })
      .from(competencias)
      .innerJoin(clients, eq(clients.id, competencias.clientId))
      .where(eq(competencias.id, cid));
    if (!row) throw new Error(`unknown competencia ${cid}`);

    const events: AgentEvent[] = [];
    const findings: AgentFinding[] = [];
    const missing = await this.missing(cid);
    if (missing.length === 0) {
      events.push({ kind: "collection.nothing_missing" });
      return { events, findings };
    }

    events.push({
      kind: "collection.message.drafted",
      payload: {
        channel: "whatsapp",
        sent: false,
        text: draftCollectionMessage(row.name, row.month, missing),
        missing: missing.map((m) => m.ref),
      },
    });

    const files = await responder.reply({ cnpj: row.cnpj, month: row.month, missing });
    mkdirSync(dataDir, { recursive: true });
    for (const f of files) {
      const sha256 = createHash("sha256").update(f.content).digest("hex");
      const storagePath = join(
        dataDir,
        `${sha256}.${f.kind === "nfe" || f.kind === "nfse" ? "xml" : f.kind}`,
      );
      try {
        writeFileSync(storagePath, f.content, { flag: "wx" });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      const documentId = `doc-${cid}-${sha256.slice(0, 16)}`;
      const inserted = await store.db
        .insert(documents)
        .values({
          id: documentId,
          competenciaId: cid,
          kind: f.kind,
          key: f.key,
          amountCentavos: f.amountCentavos,
          storagePath,
        })
        .onConflictDoNothing()
        .returning({ id: documents.id });
      if (inserted.length === 0) continue;
      events.push({
        kind: "document.captured",
        documentId,
        payload: {
          documentKind: f.kind,
          name: f.name,
          key: f.key,
          amountCentavos: f.amountCentavos,
          sha256,
          provider: responder.name,
        },
      });
    }

    const still = await this.missing(cid);
    events.push({
      kind: "collection.summary",
      payload: {
        asked: missing.length,
        received: missing.length - still.length,
        pending: still.length,
      },
    });
    for (const m of still) {
      findings.push({
        severity: "warning",
        message: `Documento ${m.ref} (${m.counterpart}) continua faltando depois do contato com o cliente`,
        source: `collection:${responder.name}`,
      });
    }
    return { events, findings };
  }
}
