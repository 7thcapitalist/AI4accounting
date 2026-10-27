import { readFileSync } from "node:fs";
import {
  agentRuns,
  approvals,
  clients as clientsTable,
  competencias,
  PHASES as DB_PHASES,
  documents as documentsTable,
  type EventRow,
  findings as findingsTable,
  phaseStates,
  type Store,
  tasks,
} from "@ai4a/db";

type Reader = Pick<Store, "db" | "listEvents">;
export type DbPhase = (typeof DB_PHASES)[number];

export interface TimelineItem {
  seq: number;
  phase: DbPhase | null;
  agent: string | null;
  kind: string;
  text: string;
}
export interface DocumentView {
  id: string;
  kind: string;
  key: string | null;
  amountCents: number | null;
  hasSource: boolean;
}
export interface FindingView {
  id: string;
  phase: DbPhase;
  agent: string;
  severity: string;
  message: string;
  /** Rule id and official source parsed from the agent's `source` ("rule | source | ref x"). */
  rule: string | null;
  source: string | null;
  ref: string | null;
  documentId: string | null;
  resolved: boolean;
}
export interface ClientMonth {
  client: { id: string; name: string; cnpj: string; regime: string };
  month: string;
  phases: { phase: DbPhase; status: string }[];
  waitingApproval: boolean;
  timeline: TimelineItem[];
  documents: DocumentView[];
  findings: FindingView[];
  approvals: { decision: string; by: string; at: number }[];
}

function payloadOf(e: EventRow): Record<string, unknown> {
  try {
    return JSON.parse(e.payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** "rule | source | ref x" (Check agent) or a free-text source (other agents). */
export function splitSource(raw: string | null): Pick<FindingView, "rule" | "source" | "ref"> {
  if (!raw) return { rule: null, source: null, ref: null };
  const parts = raw.split(" | ");
  if (parts.length === 3)
    return {
      rule: parts[0] as string,
      source: parts[1] as string,
      ref: (parts[2] as string).replace(/^ref /, ""),
    };
  return { rule: null, source: raw, ref: null };
}

function describe(e: EventRow, p: Record<string, unknown>): string | null {
  switch (e.kind) {
    case "agent.started":
      return "O agente começou a trabalhar";
    case "agent.finished":
      return "O agente concluiu a etapa";
    case "agent.failed":
      return `O agente falhou: ${String(p.error ?? "erro")}`;
    case "document.captured":
      return `Documento capturado${p.key ? ` (${String(p.key)})` : ""}`;
    case "finding.created":
      return `Exceção: ${String(p.message ?? "")}`;
    case "approval.approved":
      return "Contador aprovou o fechamento";
    case "approval.sent_back":
      return "Contador devolveu o fechamento para ajuste";
    case "competencia.closed":
      return "Fechamento concluído e entregue";
    default:
      return null;
  }
}

/** One client's latest month, with everything the page shows traced back to events and documents. */
export async function readClientMonth(
  store: Reader,
  clientId: string,
): Promise<ClientMonth | null> {
  const { db } = store;
  const client = (await db.select().from(clientsTable)).find((r) => r.id === clientId);
  if (!client) return null;
  const comp = (await db.select().from(competencias))
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => a.month.localeCompare(b.month))
    .at(-1);
  if (!comp) return null;

  const states = (await db.select().from(phaseStates)).filter((r) => r.competenciaId === comp.id);
  const phases = DB_PHASES.map((phase) => ({
    phase,
    status: states.find((s) => s.phase === phase)?.status ?? "pending",
  }));

  const runs = await db.select().from(agentRuns);
  const taskRows = (await db.select().from(tasks)).filter((r) => r.competenciaId === comp.id);
  const phaseOfRun = new Map<string, DbPhase>();
  for (const r of runs) {
    const t = taskRows.find((x) => x.id === r.taskId);
    if (t) phaseOfRun.set(r.id, t.phase as DbPhase);
  }

  const timeline: TimelineItem[] = [];
  let current: DbPhase | null = null;
  for (const e of await store.listEvents(comp.id)) {
    const p = payloadOf(e);
    if (p.phase) current = String(p.phase) as DbPhase;
    const text = describe(e, p);
    if (text)
      timeline.push({
        seq: e.seq,
        phase: (p.phase as DbPhase) ?? current,
        agent: e.agent,
        kind: e.kind,
        text,
      });
  }

  const docs = (await db.select().from(documentsTable)).filter((r) => r.competenciaId === comp.id);
  const found = (await db.select().from(findingsTable)).filter((r) => r.competenciaId === comp.id);
  const decisions = (await db.select().from(approvals)).filter((r) => r.competenciaId === comp.id);

  return {
    client: { id: client.id, name: client.name, cnpj: client.cnpj, regime: client.regime },
    month: comp.month,
    phases,
    waitingApproval: phases.find((x) => x.phase === "aprovacao")?.status === "waiting",
    timeline,
    documents: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      key: d.key,
      amountCents: d.amountCentavos,
      hasSource: Boolean(d.storagePath),
    })),
    findings: found.map((f) => ({
      id: f.id,
      phase: phaseOfRun.get(f.runId) ?? "conferencia",
      agent: taskRows.find((t) => t.id === runs.find((r) => r.id === f.runId)?.taskId)?.agent ?? "",
      severity: f.severity,
      message: f.message,
      ...splitSource(f.source),
      documentId: f.documentId,
      resolved: f.resolved === 1,
    })),
    approvals: decisions
      .map((a) => ({ decision: a.decision, by: a.by, at: a.at }))
      .sort((a, b) => a.at - b.at),
  };
}

/** Source text of a stored document (XML, OFX or CSV). The path comes from the store, never the request. */
export async function readDocumentSource(
  store: Pick<Store, "db">,
  documentId: string,
): Promise<{ kind: string; text: string } | null> {
  const d = (await store.db.select().from(documentsTable)).find((r) => r.id === documentId);
  if (!d?.storagePath || d.storagePath.endsWith(".pdf")) return null;
  try {
    return { kind: d.kind, text: readFileSync(d.storagePath, "utf8") };
  } catch {
    return null;
  }
}
