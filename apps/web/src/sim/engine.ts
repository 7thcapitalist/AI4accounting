import { AGENT_BY_PHASE, buildClients, FINDING_TEMPLATES, SAVED_MINUTES } from "./data";
import { Rng } from "./prng";
import {
  AGENT_IDS,
  type AgentCounters,
  type AgentId,
  type Client,
  type ClientProgress,
  type Document,
  type DocumentKind,
  type FeedEventKind,
  type Finding,
  PHASES,
  type Phase,
  type SimState,
} from "./types";

export const TICKS_PER_DAY = 6;
export const COMPETENCE = "2026-09";
/** Due day (month after the competence) per obligation. */
export const DEADLINE_DAYS = {
  /** PGDAS-D: LC 123/2006, art. 21, III. */
  "PGDAS-D": 20,
  /** IRPJ/CSLL trimestral do Lucro Presumido: último dia útil do mês seguinte ao trimestre (Lei 9.430/1996, art. 5º). Competência 2026-09 fecha o 3º tri; outubro/2026 termina no sábado 31, então vence sexta 30. */
  "IRPJ/CSLL": 30,
} as const;
export const DEADLINE_DAY = DEADLINE_DAYS["PGDAS-D"];

/** Phases an accountant may send a client back to: agents upstream of Aprovacao only. */
export const RETURNABLE_AGENTS: readonly AgentId[] = PHASES.filter(
  (ph) => ph !== "Aprovacao" && ph !== "Entrega",
).map((ph) => AGENT_BY_PHASE[ph]);

function emptyCounters(): Record<AgentId, AgentCounters> {
  const out = {} as Record<AgentId, AgentCounters>;
  for (const id of AGENT_IDS) out[id] = { actions: 0, findings: 0, returned: 0 };
  return out;
}

const DOC_KINDS: DocumentKind[] = ["NFS-e", "NF-e", "Extrato", "Guia"];

function buildDocuments(clients: Client[], rng: Rng): Document[] {
  const docs: Document[] = [];
  for (const c of clients) {
    const count = rng.int(4, 8);
    for (let i = 0; i < count; i++) {
      const kind =
        i === 0
          ? "Extrato"
          : c.regime === "SimplesAnexoI"
            ? "NF-e"
            : rng.pick(DOC_KINDS.slice(0, 2));
      docs.push({
        id: `${c.id}-d${i + 1}`,
        clientId: c.id,
        kind,
        number: String(rng.int(100, 9999)),
        amountCents: Math.round(c.monthlyRevenueCents / count / 100) * 100,
      });
    }
  }
  return docs;
}

function phaseTicks(rng: Rng): number {
  return rng.int(1, 3);
}

export function createSim(seed: number): SimState {
  const rng = new Rng(seed >>> 0);
  const clients = buildClients();
  const documents = buildDocuments(clients, rng);
  const progress: ClientProgress[] = clients.map((c) => ({
    clientId: c.id,
    phase: "Captura",
    status: "waiting",
    ticksLeft: phaseTicks(rng),
    reworked: false,
    savedMinutes: 0,
  }));
  const state: SimState = {
    seed,
    rng: rng.state,
    tick: 0,
    competence: COMPETENCE,
    clients,
    documents,
    progress,
    findings: [],
    feed: [],
    counters: emptyCounters(),
    nextEventId: 1,
    nextFindingId: 1,
  };
  emit(
    state,
    "Coordenador",
    null,
    null,
    "info",
    `Fechamento de ${COMPETENCE} aberto para ${clients.length} clientes`,
  );
  return state;
}

function emit(
  s: SimState,
  agent: AgentId,
  clientId: string | null,
  phase: Phase | null,
  kind: FeedEventKind,
  text: string,
): void {
  s.feed.push({ id: s.nextEventId++, tick: s.tick, agent, clientId, phase, kind, text });
  s.counters[agent].actions++;
}

function clientOf(s: SimState, id: string): Client {
  const c = s.clients.find((x) => x.id === id);
  if (!c) throw new Error(`unknown client ${id}`);
  return c;
}

function progressOf(s: SimState, id: string): ClientProgress {
  const p = s.progress.find((x) => x.clientId === id);
  if (!p) throw new Error(`unknown client ${id}`);
  return p;
}

function docNumber(s: SimState, clientId: string, rng: Rng): string {
  const docs = s.documents.filter((d) => d.clientId === clientId && d.kind !== "Extrato");
  return docs.length ? rng.pick(docs).number : String(rng.int(100, 9999));
}

const PHASE_DONE_TEXT: Record<Phase, (c: Client, n: number) => string> = {
  Captura: (c, n) => `Captura: ${n} documentos de ${c.name} capturados nos portais`,
  Coleta: (c) => `Coleta: extratos e documentos de ${c.name} recebidos`,
  Conferencia: (c) => `Conferencia: notas de ${c.name} conferidas, sem divergências`,
  Conciliacao: (c) => `Conciliacao: notas de ${c.name} conciliadas com o extrato`,
  Apuracao: (c) => `Apuracao: ${c.obligation} de ${c.name} calculado`,
  Aprovacao: (c) => `Coordenador: ${c.name} aguardando aprovação do contador`,
  Entrega: (c) => `Entrega: ${c.obligation} de ${c.name} entregue ao cliente`,
};

function completePhase(s: SimState, p: ClientProgress, rng: Rng): void {
  const client = clientOf(s, p.clientId);
  const phase = p.phase;
  const agent = AGENT_BY_PHASE[phase];
  p.savedMinutes += SAVED_MINUTES[client.regime][phase];

  let raised: Finding | null = null;
  if (!p.reworked) {
    const candidates = FINDING_TEMPLATES.filter(
      (t) => t.phase === phase && (t.regimes === "all" || t.regimes.includes(client.regime)),
    );
    for (const t of candidates) {
      // The clinic always trips its IRRF/CSRF rule: that is the showcase scenario.
      const mandatory =
        client.regime === "ClinicaMedica" && t.regimes !== "all" && t.agent === "Conferencia";
      if (mandatory || rng.chance(0.3)) {
        const n = docNumber(s, client.id, rng);
        raised = {
          id: `f${s.nextFindingId++}`,
          clientId: client.id,
          agent: t.agent,
          phase,
          severity: t.severity,
          message: t.message.replace("{n}", n),
          reasoning: t.reasoning,
          rule: t.rule,
          source: t.source,
          status: "open",
        };
        break;
      }
    }
  }

  if (raised) {
    s.findings.push(raised);
    s.counters[agent].findings++;
    emit(s, agent, client.id, phase, "finding", `${agent}: ${raised.message} (${client.name})`);
  } else {
    emit(
      s,
      agent,
      client.id,
      phase,
      "info",
      PHASE_DONE_TEXT[phase](client, s.documents.filter((d) => d.clientId === client.id).length),
    );
  }

  const next = PHASES[PHASES.indexOf(phase) + 1];
  if (!next) {
    p.status = "done";
    p.protocol = `SIM-${s.competence.replace("-", "")}-${client.id.toUpperCase()}`;
    return;
  }
  p.phase = next;
  p.ticksLeft = phaseTicks(rng);
  if (next === "Aprovacao") {
    p.status = "awaiting_approval";
    const open = s.findings.filter((f) => f.clientId === client.id && f.status === "open").length;
    const note = open ? ` (${open} exceção(ões) para revisar)` : "";
    emit(
      s,
      "Coordenador",
      client.id,
      "Aprovacao",
      "info",
      `Coordenador: ${client.name} pronto para aprovação${note}`,
    );
  }
}

/** Advances the simulation one tick. Pure: returns a new state. */
export function step(prev: SimState): SimState {
  const s = structuredClone(prev);
  s.tick++;
  const rng = new Rng(s.rng);
  for (const p of s.progress) {
    const client = clientOf(s, p.clientId);
    if (p.status === "waiting" && s.tick >= client.startsAtTick) {
      p.status = "working";
      emit(
        s,
        "Coordenador",
        client.id,
        p.phase,
        "info",
        `Coordenador: fechamento de ${client.name} iniciado`,
      );
    }
    if (p.status !== "working") continue;
    p.ticksLeft--;
    if (p.ticksLeft <= 0) completePhase(s, p, rng);
  }
  s.rng = rng.state;
  return s;
}

/** Accountant approves: open findings are accepted and the client moves to Entrega. */
export function approve(prev: SimState, clientId: string): SimState {
  const s = structuredClone(prev);
  const p = progressOf(s, clientId);
  if (p.status !== "awaiting_approval") return prev;
  const client = clientOf(s, clientId);
  for (const f of s.findings) {
    if (f.clientId === clientId && f.status === "open") {
      f.status = "resolved";
      f.resolution = "approved";
    }
  }
  const rng = new Rng(s.rng);
  p.phase = "Entrega";
  p.status = "working";
  p.ticksLeft = phaseTicks(rng);
  s.rng = rng.state;
  emit(
    s,
    "Coordenador",
    clientId,
    "Aprovacao",
    "approval",
    `Coordenador: contador aprovou ${client.name}, enviando para entrega`,
  );
  return s;
}

/**
 * Accountant sends the client back. Goes to the agent that raised the oldest open finding
 * (or to `agent` if given, or Conferencia). The rework pass raises no new findings.
 */
export function returnToAgent(prev: SimState, clientId: string, agent?: AgentId): SimState {
  const s = structuredClone(prev);
  const p = progressOf(s, clientId);
  if (p.status !== "awaiting_approval") return prev;
  const client = clientOf(s, clientId);
  const open = s.findings.filter((f) => f.clientId === clientId && f.status === "open");
  const target = agent ?? open[0]?.agent ?? "Conferencia";
  if (!RETURNABLE_AGENTS.includes(target)) return prev;
  const phase = PHASES.find((ph) => AGENT_BY_PHASE[ph] === target);
  if (!phase) return prev;
  for (const f of open) {
    f.status = "resolved";
    f.resolution = "returned";
  }
  const rng = new Rng(s.rng);
  p.phase = phase;
  p.status = "working";
  p.reworked = true;
  p.ticksLeft = phaseTicks(rng);
  s.rng = rng.state;
  s.counters[target].returned++;
  emit(
    s,
    "Coordenador",
    clientId,
    "Aprovacao",
    "return",
    `Coordenador: contador devolveu ${client.name} para ${target}`,
  );
  return s;
}
