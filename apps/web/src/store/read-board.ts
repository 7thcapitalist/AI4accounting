import {
  agentRuns,
  approvals,
  clients as clientsTable,
  competencias,
  PHASES as DB_PHASES,
  documents as documentsTable,
  type EventRow,
  findings as findingsTable,
  openReader,
  phaseStates,
  type Store,
  tasks,
} from "@ai4a/db";
import { AGENT_BY_PHASE, SAVED_MINUTES } from "../sim/data";
import {
  AGENT_IDS,
  type AgentCounters,
  type AgentId,
  type Client,
  type ClientProgress,
  type Document,
  type DocumentKind,
  type FeedEvent,
  type Finding,
  PHASES,
  type Phase,
  type Regime,
  type Severity,
  type SimState,
} from "../sim/types";
import { PHASE_LABEL } from "../ui/format";

const PHASE_BY_DB = Object.fromEntries(DB_PHASES.map((p, i) => [p, PHASES[i]])) as Record<
  string,
  Phase
>;
const SEVERITY: Record<string, Severity> = { info: "baixa", warning: "media", blocker: "alta" };
const DOC_KIND: Record<string, DocumentKind> = {
  nfe: "NF-e",
  nfse: "NFS-e",
  ofx: "Extrato",
  ledger: "Guia",
};

function regimeOf(raw: string): { regime: Regime; label: string } {
  if (raw === "presumido") return { regime: "LucroPresumido", label: "Lucro Presumido" };
  return { regime: "SimplesAnexoIII", label: "Simples Nacional" };
}

function payloadOf(e: EventRow): Record<string, unknown> {
  try {
    return JSON.parse(e.payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function feedText(e: EventRow, phase: Phase | null, extra: string): string | null {
  const label = phase ? PHASE_LABEL[phase] : "etapa";
  switch (e.kind) {
    case "agent.started":
      return `Agente de ${label} começou a trabalhar${extra}`;
    case "agent.finished":
      return `Agente de ${label} concluiu a etapa${extra}`;
    case "agent.failed":
      return `Agente de ${label} falhou: ${String(payloadOf(e).error ?? "erro")}${extra}`;
    case "finding.created":
      return `Exceção em ${label}: ${String(payloadOf(e).message ?? "")}${extra}`;
    case "approval.approved":
      return `Contador aprovou o fechamento${extra}`;
    case "approval.sent_back":
      return `Contador devolveu o fechamento para ajuste${extra}`;
    case "competencia.closed":
      return `Fechamento concluído e entregue${extra}`;
    default:
      return null;
  }
}

/** Reads the store and builds the same `SimState` the board already renders. */
export async function readBoard(store: Pick<Store, "db" | "listEvents">): Promise<SimState | null> {
  const { db } = store;
  const comps = await db.select().from(competencias);
  if (!comps.length) return null;
  const month = comps
    .map((c) => c.month)
    .sort()
    .at(-1) as string;
  const current = comps.filter((c) => c.month === month);
  const compIds = new Set(current.map((c) => c.id));
  const clientRows = await db.select().from(clientsTable);
  const events = (await store.listEvents()).filter((e) => compIds.has(e.competenciaId));
  const states = await db.select().from(phaseStates);
  const runs = await db.select().from(agentRuns);
  const taskRows = await db.select().from(tasks);
  const phaseOfRun = new Map<string, Phase>();
  for (const r of runs) {
    const t = taskRows.find((x) => x.id === r.taskId);
    if (t) phaseOfRun.set(r.id, PHASE_BY_DB[t.phase] as Phase);
  }

  const clientByComp = new Map<string, string>();
  const clients: Client[] = [];
  for (const comp of current) {
    const row = clientRows.find((c) => c.id === comp.clientId);
    if (!row) continue;
    clientByComp.set(comp.id, row.id);
    const { regime, label } = regimeOf(row.regime);
    const snap = events
      .filter((e) => e.competenciaId === comp.id && e.kind === "regime.snapshot")
      .at(-1);
    const rbt12 = Number(payloadOf(snap ?? ({ payload: "{}" } as EventRow)).rbt12Cents);
    clients.push({
      id: row.id,
      name: row.name,
      regime,
      regimeLabel: label,
      monthlyRevenueCents: Number.isFinite(rbt12) ? Math.round(rbt12 / 12) : 0,
      rbt12Cents: Number.isFinite(rbt12) ? rbt12 : undefined,
      obligation: regime === "LucroPresumido" ? "IRPJ/CSLL" : "PGDAS-D",
      startsAtTick: 0,
    });
  }

  const resolvedBy = new Map<string, "approved" | "returned">();
  for (const a of await db.select().from(approvals))
    if (compIds.has(a.competenciaId))
      resolvedBy.set(a.competenciaId, a.decision === "approved" ? "approved" : "returned");

  const findings: Finding[] = (await db.select().from(findingsTable))
    .filter((f) => compIds.has(f.competenciaId))
    .map((f) => {
      const phase = phaseOfRun.get(f.runId) ?? "Conferencia";
      const resolved = f.resolved === 1 || resolvedBy.get(f.competenciaId) === "approved";
      return {
        id: f.id,
        clientId: clientByComp.get(f.competenciaId) as string,
        agent: AGENT_BY_PHASE[phase],
        phase,
        severity: SEVERITY[f.severity] ?? "media",
        message: f.message,
        reasoning: `O agente de ${phase} sinalizou esta exceção ao processar o mês deste cliente.`,
        rule: f.source ? `Regra aplicada: ${f.source}` : "Regra não registrada pelo agente.",
        source: f.source ?? "sem fonte registrada",
        action: "Revise o ponto e decida: aprovar o fechamento ou devolver para o agente.",
        status: resolved ? "resolved" : "open",
        resolution: resolved ? "approved" : undefined,
      } satisfies Finding;
    });

  const documents: Document[] = (await db.select().from(documentsTable))
    .filter((d) => compIds.has(d.competenciaId))
    .map((d) => ({
      id: d.id,
      clientId: clientByComp.get(d.competenciaId) as string,
      kind: DOC_KIND[d.kind] ?? "NF-e",
      number: d.key ?? d.id,
      amountCents: d.amountCentavos ?? 0,
    }));

  const progress: ClientProgress[] = current.map((comp) => {
    const clientId = clientByComp.get(comp.id) as string;
    const client = clients.find((c) => c.id === clientId) as Client;
    const status = (phase: string) => states.find((s) => s.id === `${comp.id}:${phase}`)?.status;
    const done = DB_PHASES.filter((p) => status(p) === "done");
    const closed = done.length === DB_PHASES.length;
    const idx = closed ? DB_PHASES.length - 1 : done.length;
    const dbPhase = DB_PHASES[idx] as (typeof DB_PHASES)[number];
    const st = status(dbPhase);
    return {
      clientId,
      phase: PHASE_BY_DB[dbPhase] as Phase,
      status: closed
        ? "done"
        : st === "running"
          ? "working"
          : st === "waiting" || st === "blocked"
            ? "awaiting_approval"
            : "waiting",
      ticksLeft: 0,
      reworked: false,
      savedMinutes: done.reduce(
        (sum, p) => sum + SAVED_MINUTES[client.regime][PHASE_BY_DB[p] as Phase],
        0,
      ),
      protocol: closed ? `PROT-${comp.id}` : undefined,
    };
  });

  const counters = Object.fromEntries(
    AGENT_IDS.map((id) => [id, { actions: 0, findings: 0, returned: 0 }]),
  ) as Record<AgentId, AgentCounters>;
  const feed: FeedEvent[] = [];
  // Board clock: the store's `at` is a raw event counter, so time is the average number of phases
  // finished per client (6 per simulated day, TICKS_PER_DAY): the month closes in about a day.
  let finished = 0;
  const clock = () => Math.round(finished / Math.max(clients.length, 1));
  const findingPhase = new Map(findings.map((f) => [f.id, f.phase]));
  for (const e of events) {
    const p = payloadOf(e);
    const phase =
      e.kind === "finding.created"
        ? (findingPhase.get(String(p.id)) ?? null)
        : p.phase
          ? (PHASE_BY_DB[String(p.phase)] ?? null)
          : null;
    const agent = phase ? AGENT_BY_PHASE[phase] : "Coordenador";
    if (e.kind === "agent.finished") {
      counters[agent].actions++;
      finished++;
    }
    if (e.kind === "finding.created") counters[agent].findings++;
    if (e.kind === "approval.sent_back") counters.Coordenador.returned++;
    const clientId = clientByComp.get(e.competenciaId) ?? null;
    const name = clients.find((c) => c.id === clientId)?.name;
    const text = feedText(e, phase, name ? ` (${name})` : "");
    if (!text) continue;
    const kind = e.kind.startsWith("finding")
      ? "finding"
      : e.kind === "approval.approved"
        ? "approval"
        : e.kind === "approval.sent_back"
          ? "return"
          : e.kind === "competencia.closed"
            ? "delivery"
            : "info";
    feed.push({ id: e.seq, tick: clock(), agent, clientId, phase, kind, text });
  }

  return {
    seed: 0,
    rng: 0,
    tick: clock(),
    competence: month,
    clients,
    documents,
    progress,
    findings,
    feed,
    counters,
    nextEventId: (events.at(-1)?.seq ?? 0) + 1,
    nextFindingId: findings.length + 1,
  };
}

/** Reads a store file without touching its schema (the writer may be mid-run) and closes it. */
export async function readBoardFile(path: string): Promise<SimState | null> {
  const store = openReader(path);
  try {
    return await readBoard(store);
  } finally {
    store.close();
  }
}
