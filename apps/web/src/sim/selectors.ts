import { AGENT_BY_PHASE, AGENTS, SAVED_MINUTES } from "./data";
import { DEADLINE_DAYS, TICKS_PER_DAY } from "./engine";
import {
  type AgentStats,
  type Kpis,
  type ObligationDeadline,
  PHASES,
  type QueueItem,
  type SimState,
} from "./types";

/** Simulated day of the month after the competence (starts at 1). */
export function selectDay(s: SimState): number {
  return 1 + Math.floor(s.tick / TICKS_PER_DAY);
}

export function selectDeadlines(s: SimState): ObligationDeadline[] {
  const out: ObligationDeadline[] = [];
  for (const obligation of ["PGDAS-D", "IRPJ/CSLL"] as const) {
    const ids = s.clients.filter((c) => c.obligation === obligation).map((c) => c.id);
    if (!ids.length) continue;
    const dueDay = DEADLINE_DAYS[obligation];
    out.push({
      obligation,
      dueDay,
      daysLeft: dueDay - selectDay(s),
      clients: ids.length,
      closed: s.progress.filter((p) => ids.includes(p.clientId) && p.status === "done").length,
      label: `${obligation} vence dia ${dueDay}`,
    });
  }
  return out;
}

export function selectKpis(s: SimState): Kpis {
  const deadlines = selectDeadlines(s);
  const open = deadlines.filter((d) => d.closed < d.clients);
  const minutes = s.progress.reduce((sum, p) => sum + p.savedMinutes, 0);
  return {
    totalClients: s.clients.length,
    closedClients: s.progress.filter((p) => p.status === "done").length,
    openExceptions: s.findings.filter((f) => f.status === "open").length,
    hoursSaved: Math.round((minutes / 60) * 10) / 10,
    daysToDeadline: Math.min(...(open.length ? open : deadlines).map((d) => d.daysLeft)),
    deadlineLabel: deadlines.map((d) => d.label).join(" · "),
    deadlines,
  };
}

/**
 * What needs the accountant, across clients: approvals (agents finished) and exceptions (blocked
 * with open findings). Approvals come first, oldest first.
 */
export function selectAccountantQueue(s: SimState): QueueItem[] {
  const queue: QueueItem[] = [];
  for (const p of s.progress) {
    const client = s.clients.find((c) => c.id === p.clientId);
    if (!client) continue;
    const findings = s.findings.filter((f) => f.clientId === p.clientId && f.status === "open");
    if (p.status === "awaiting_approval") queue.push({ client, findings, kind: "approval" });
    else if (p.status === "blocked" && findings.length)
      queue.push({ client, findings, kind: "exception" });
  }
  return queue.sort((a, b) => Number(b.kind === "approval") - Number(a.kind === "approval"));
}

/** Minutes saved by `agent`: its phase counts once per client that moved past it. */
function savedBy(s: SimState, agent: AgentStats["agent"]): number {
  let minutes = 0;
  for (const p of s.progress) {
    const client = s.clients.find((c) => c.id === p.clientId);
    if (!client) continue;
    for (const ph of PHASES) {
      if (AGENT_BY_PHASE[ph] !== agent.id) continue;
      const passed = p.status === "done" || PHASES.indexOf(ph) < PHASES.indexOf(p.phase);
      if (passed) minutes += SAVED_MINUTES[client.regime][ph];
    }
  }
  return minutes;
}

export function selectAgentStats(s: SimState): AgentStats[] {
  const days = Math.max(selectDay(s) - 1, 1);
  return AGENTS.map((agent) => {
    const active = s.progress.filter(
      (p) => p.status === "working" && AGENT_BY_PHASE[p.phase] === agent.id,
    );
    const counters = s.counters[agent.id];
    return {
      agent,
      ...counters,
      activeClients: active.length,
      currentClients: active
        .map((p) => s.clients.find((c) => c.id === p.clientId)?.name)
        .filter((n): n is string => n !== undefined),
      savedMinutes: savedBy(s, agent),
      perDay: Math.round((counters.actions / days) * 10) / 10,
    };
  });
}

/** True when every client reached Entrega. */
export function selectIsFinished(s: SimState): boolean {
  return s.progress.every((p) => p.status === "done");
}

/** True when nothing can advance without an accountant action. */
export function selectNeedsAccountant(s: SimState): boolean {
  return (
    !selectIsFinished(s) &&
    s.progress.every((p) => p.status === "awaiting_approval" || p.status === "done")
  );
}
