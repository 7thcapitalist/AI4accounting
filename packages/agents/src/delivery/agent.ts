import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { approvals, clients, competencias, documents, type Store } from "@ai4a/db";
import { desc, eq } from "drizzle-orm";
import type { Agent, AgentEvent, AgentFinding, AgentResult, AgentTask } from "../types";
import type { DasIssuer, IssuedDas } from "./issuer";
import { draftDeliveryMessage } from "./message";

export interface DeliveryAgentDeps {
  store: Store;
  issuer: DasIssuer;
  /** Directory for the DAS PDFs, outside git. */
  dataDir: string;
}

/**
 * Agent 6 (phase "entrega"): after the accountant approved, issues the DAS (PGDAS-D) through the
 * `DasIssuer`, stores the slip as a `das` document of the client month and drafts the delivery
 * message. It never sends the message. The issued amount must match what the Tax agent drafted,
 * otherwise the month is blocked. No LLM.
 */
export class DeliveryAgent implements Agent {
  readonly name = "delivery";

  constructor(private d: DeliveryAgentDeps) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const { store, issuer, dataDir } = this.d;
    const cid = task.competenciaId;
    const events: AgentEvent[] = [];
    const findings: AgentFinding[] = [];
    const blocker = (message: string, source = "delivery") =>
      findings.push({ severity: "blocker", message, source });

    const [row] = await store.db
      .select({ name: clients.name, cnpj: clients.cnpj, month: competencias.month })
      .from(competencias)
      .innerJoin(clients, eq(clients.id, competencias.clientId))
      .where(eq(competencias.id, cid));
    if (!row) throw new Error(`unknown competencia ${cid}`);

    const [approval] = await store.db
      .select({ decision: approvals.decision, by: approvals.by })
      .from(approvals)
      .where(eq(approvals.competenciaId, cid))
      .orderBy(desc(approvals.at))
      .limit(1);
    if (approval?.decision !== "approved") {
      blocker("Entrega sem aprovacao do contador: DAS nao emitido");
      return { events, findings };
    }

    const drafts = (await store.listEvents(cid))
      .filter((e) => e.kind === "tax.draft")
      .map((e) => JSON.parse(e.payload) as { guide: string; amountCentavos: number });
    const draft = drafts.filter((g) => g.guide === "PGDAS-D").at(-1);
    if (!draft) {
      events.push({
        kind: "delivery.no_das",
        payload: { reason: "no PGDAS-D draft", drafts: drafts.length },
      });
      if (drafts.length === 0) blocker("Nenhuma guia apurada para entregar", "tax");
      return { events, findings };
    }
    if (draft.amountCentavos === 0) {
      events.push({ kind: "delivery.no_das", payload: { reason: "zero amount" } });
      return { events, findings };
    }

    let das: IssuedDas;
    try {
      das = await issuer.issue({
        cnpj: row.cnpj,
        month: row.month,
        expectedCentavos: draft.amountCentavos,
      });
    } catch (err) {
      blocker(`Falha ao gerar o DAS (${issuer.name}): ${(err as Error).message}`, issuer.name);
      return { events, findings };
    }
    if (das.amountCentavos !== draft.amountCentavos) {
      blocker(
        `Valor do DAS (${das.amountCentavos}) difere da apuracao (${draft.amountCentavos}); guia nao anexada`,
        issuer.name,
      );
      return { events, findings };
    }

    const sha256 = createHash("sha256").update(das.pdf).digest("hex");
    mkdirSync(dataDir, { recursive: true });
    const storagePath = join(dataDir, `${sha256}.pdf`);
    writeFileSync(storagePath, das.pdf);
    const documentId = `doc-${cid}-das-${das.numeroDas}`;
    await store.db
      .insert(documents)
      .values({
        id: documentId,
        competenciaId: cid,
        kind: "das",
        key: das.numeroDas,
        amountCentavos: das.amountCentavos,
        storagePath,
      })
      .onConflictDoNothing();
    events.push({
      kind: "delivery.das.issued",
      documentId,
      payload: {
        numeroDas: das.numeroDas,
        amountCentavos: das.amountCentavos,
        sha256,
        issuer: issuer.name,
        approvedBy: approval.by,
      },
    });
    events.push({
      kind: "delivery.message.drafted",
      payload: {
        channel: "whatsapp",
        sent: false,
        text: draftDeliveryMessage(row.name, row.month, das),
        attachment: documentId,
      },
    });
    return { events, findings };
  }
}
