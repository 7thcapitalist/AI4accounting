import { AGENT_BY_PHASE, AGENTS } from "./data";
import { DEADLINE_DAY, TICKS_PER_DAY } from "./engine";
import type { AgentStats, Kpis, QueueItem, SimState } from "./types";

/** Simulated day of the month after the competence (starts at 1). */
export function selectDay(s: SimState): number {
  return 1 + Math.floor(s.tick / TICKS_PER_DAY);
}

export function selectKpis(s: SimState): Kpis {
  const minutes = s.progress.reduce((sum, p) => sum + p.savedMinutes, 0);
  return {
    totalClients: s.clients.length,
    closedClients: s.progress.filter((p) => p.status === "done").length,
    openExceptions: s.findings.filter((f) => f.status === "open").length,
    hoursSaved: Math.round((minutes / 60) * 10) / 10,
    daysToDeadline: DEADLINE_DAY - selectDay(s),
    deadlineLabel: `PGDAS-D vence dia ${DEADLINE_DAY}`,
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
