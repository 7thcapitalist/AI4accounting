import { readFileSync } from "node:fs";
import { clients, competencias, documents, events, type Store } from "@ai4a/db";
import { and, eq } from "drizzle-orm";
import type { Agent, AgentFinding, AgentResult, AgentTask } from "../types";
import type { LlmProvider } from "./llm";
import { parseOfx } from "./ofx";
import { type CheckDoc, type CheckFinding, runChecks } from "./rules";

export interface CheckAgentDeps {
  store: Store;
  /** Optional: writes the pt-BR explanation of each finding. Findings never depend on it. */
  llm?: LlmProvider;
}

/** Prompt carries the rule only (id, message template without document data, source): no client data. */
export function explainPrompt(f: Pick<CheckFinding, "ruleId" | "source">): string {
  return [
    "Voce ajuda um contador brasileiro. Explique em 2 frases curtas, em portugues, por que a regra abaixo",
    "importa e o que o contador deve conferir. Nao invente valores, aliquotas nem artigos de lei.",
    `Regra: ${f.ruleId}`,
    `Fonte: ${f.source}`,
  ].join("\n");
}

/**
 * Agent 3: runs the deterministic rules over the month's captured documents. The LLM only adds a
 * plain-language explanation; whether something is a finding is decided by the rules alone.
 */
export class CheckAgent implements Agent {
  readonly name = "check";

  constructor(private d: CheckAgentDeps) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const { store, llm } = this.d;
    const [row] = await store.db
      .select({ cnpj: clients.cnpj, regime: clients.regime, month: competencias.month })
      .from(competencias)
      .innerJoin(clients, eq(clients.id, competencias.clientId))
      .where(eq(competencias.id, task.competenciaId));
    if (!row) throw new Error(`unknown competencia ${task.competenciaId}`);

    const docs = await store.db
      .select()
      .from(documents)
      .where(eq(documents.competenciaId, task.competenciaId));
    const checkDocs: CheckDoc[] = [];
    let bank: ReturnType<typeof parseOfx> = [];
    for (const d of docs) {
      if (!d.storagePath) continue;
      const text = readFileSync(d.storagePath, "utf8");
      if (d.kind === "nfe" || d.kind === "nfse")
        checkDocs.push({ id: d.id, kind: d.kind, xml: text });
      else if (d.kind === "ofx") bank = bank.concat(parseOfx(text));
    }

    const found = runChecks({
      client: { cnpj: row.cnpj, regime: row.regime },
      month: row.month,
      docs: checkDocs,
      bank,
    });

    // The capture agent drops byte-identical files before they reach the store; those are duplicates too.
    const dropped = await store.db
      .select({ documentId: events.documentId })
      .from(events)
      .where(
        and(eq(events.competenciaId, task.competenciaId), eq(events.kind, "document.duplicate")),
      );
    for (const e of dropped) {
      if (
        !e.documentId ||
        found.some((f) => f.ruleId === "CHECK-DUPLICADO" && f.docId === e.documentId)
      )
        continue;
      found.push({
        ruleId: "CHECK-DUPLICADO",
        errorType: "duplicate",
        severity: "warning",
        message: `Arquivo identico ao documento ${e.documentId} foi capturado de novo e descartado`,
        source: "Captura: arquivos com o mesmo sha256 sao o mesmo documento",
        ref: e.documentId,
        docId: e.documentId,
      });
    }

    const explained = new Map<string, string>();
    if (llm) {
      for (const ruleId of new Set(found.map((f) => f.ruleId))) {
        const f = found.find((x) => x.ruleId === ruleId);
        if (!f) continue;
        try {
          const text = (await llm.complete(explainPrompt(f))).trim();
          if (text) explained.set(ruleId, text);
        } catch {
          // explanation is optional; the finding stands without it
        }
      }
    }

    const findings: AgentFinding[] = found.map((f) => {
      const why = explained.get(f.ruleId);
      return {
        severity: f.severity,
        message: why ? `${f.message}. ${why}` : f.message,
        documentId: f.docId,
        source: `${f.ruleId} | ${f.source} | ref ${f.ref}`,
      };
    });
    return {
      events: [
        {
          kind: "check.summary",
          payload: { documents: checkDocs.length, findings: found.length, llm: llm?.name ?? null },
        },
      ],
      findings,
    };
  }
}
