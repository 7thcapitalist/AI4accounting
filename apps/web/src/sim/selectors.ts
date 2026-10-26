import { AGENT_BY_PHASE, AGENTS } from "./data";
import { DEADLINE_DAYS, TICKS_PER_DAY } from "./engine";
import type { AgentStats, Kpis, ObligationDeadline, QueueItem, SimState } from "./types";

/** Simulated day of the month after the competence (starts at 1). */
export function selectDay(s: SimState): number {
  return 1 + Math.floor(s.tick / TICKS_PER_DAY);
}

export function selectDeadlines(s: SimState): ObligationDeadline[] {
  const out: ObligationDeadline[] = [];
  for (const obligation of ["PGDAS-D", "DARF"] as const) {
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
  const minutes = s.progress.reduce((sum, p) => sum + p.savedMinutes, 0);
  return {
    totalClients: s.clients.length,
    closedClients: s.progress.filter((p) => p.status === "done").length,
    openExceptions: s.findings.filter((f) => f.status === "open").length,
    hoursSaved: Math.round((minutes / 60) * 10) / 10,
    daysToDeadline: Math.min(...deadlines.map((d) => d.daysLeft)),
    deadlineLabel: deadlines.map((d) => d.label).join(" · "),
    deadlines,
  };
}

/** Clients waiting for the accountant, oldest first. */
export function selectAccountantQueue(s: SimState): QueueItem[] {
  const queue: QueueItem[] = [];
  for (const p of s.progress) {
    const client = s.clients.find((c) => c.id === p.clientId);
    if (p.status !== "awaiting_approval" || !client) continue;
    queue.push({
      client,
      findings: s.findings.filter((f) => f.clientId === p.clientId && f.status === "open"),
    });
  }
  return queue;
}

export function selectAgentStats(s: SimState): AgentStats[] {
  return AGENTS.map((agent) => ({
    agent,
    ...s.counters[agent.id],
    activeClients: s.progress.filter(
      (p) => p.status === "working" && AGENT_BY_PHASE[p.phase] === agent.id,
    ).length,
  }));
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
