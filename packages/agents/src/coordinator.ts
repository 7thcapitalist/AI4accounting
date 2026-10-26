import { randomUUID } from "node:crypto";
import {
  agentRuns,
  approvals,
  findings,
  PHASES,
  type Phase,
  type PhaseStatus,
  type Store,
  tasks,
} from "@ai4a/db";
import { eq } from "drizzle-orm";
import type { Agent, Approver } from "./types";

const TRANSITIONS: Record<PhaseStatus, PhaseStatus[]> = {
  pending: ["running"],
  running: ["done", "waiting", "blocked"],
  waiting: ["running", "done", "blocked"],
  blocked: ["running"],
  done: [],
};

export function canTransition(from: PhaseStatus, to: PhaseStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface CoordinatorDeps {
  store: Store;
  agents: Record<Phase, Agent>;
  approver: Approver;
  /** Monotonic clock; injected so event logs are reproducible. */
  now: () => number;
  /** Id generator; defaults to random UUIDs so separate instances never collide in one store. */
  newId?: () => string;
}

export type MonthOutcome = { status: "closed" } | { status: "blocked"; phase: Phase };

/** Moves one (client, competencia) through Captura -> ... -> Entrega, logging every step. */
export class Coordinator {
  constructor(private d: CoordinatorDeps) {}

  private id(prefix: string): string {
    return `${prefix}-${(this.d.newId ?? randomUUID)()}`;
  }

  private async transition(cid: string, phase: Phase, to: PhaseStatus): Promise<void> {
    const from = (await this.d.store.getPhaseState(cid, phase)) ?? "pending";
    if (!canTransition(from, to))
      throw new Error(`invalid phase transition ${from} -> ${to} (${phase})`);
    const at = this.d.now();
    await this.d.store.setPhaseState(cid, phase, to, at);
    await this.d.store.appendEvent({
      at,
      competenciaId: cid,
      kind: "phase.changed",
      payload: { phase, from, to },
    });
  }

  async runCompetencia(cid: string): Promise<MonthOutcome> {
    const { store, agents, approver } = this.d;
    for (const phase of PHASES) {
      if ((await store.getPhaseState(cid, phase)) === "done") continue;
      await this.transition(cid, phase, "running");
      const agent = agents[phase];
      const taskId = this.id("task");
      const runId = this.id("run");
      await store.db
        .insert(tasks)
        .values({ id: taskId, competenciaId: cid, phase, agent: agent.name, status: "running" });
      await store.db
        .insert(agentRuns)
        .values({ id: runId, taskId, agent: agent.name, startedAt: this.d.now() });
      await store.appendEvent({
        at: this.d.now(),
        competenciaId: cid,
        kind: "agent.started",
        agent: agent.name,
        payload: { phase, taskId, runId },
      });
      let blocked = false;
      try {
        const res = await agent.run({ taskId, competenciaId: cid, phase });
        for (const e of res.events) {
          await store.appendEvent({
            at: this.d.now(),
            competenciaId: cid,
            kind: e.kind,
            agent: agent.name,
            documentId: e.documentId,
            payload: e.payload,
          });
        }
        for (const f of res.findings) {
          const fid = this.id("finding");
          await store.db.insert(findings).values({
            id: fid,
            competenciaId: cid,
            runId,
            severity: f.severity,
            message: f.message,
            documentId: f.documentId,
            source: f.source,
          });
          await store.appendEvent({
            at: this.d.now(),
            competenciaId: cid,
            kind: "finding.created",
            agent: agent.name,
            documentId: f.documentId,
            payload: { id: fid, severity: f.severity, message: f.message },
          });
          if (f.severity === "blocker") blocked = true;
        }
        await store.db
          .update(agentRuns)
          .set({ finishedAt: this.d.now() })
          .where(eq(agentRuns.id, runId));
        await store.db.update(tasks).set({ status: "done" }).where(eq(tasks.id, taskId));
        await store.appendEvent({
          at: this.d.now(),
          competenciaId: cid,
          kind: "agent.finished",
          agent: agent.name,
          payload: { phase, taskId, runId },
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await store.db
          .update(agentRuns)
          .set({ finishedAt: this.d.now(), error })
          .where(eq(agentRuns.id, runId));
        await store.db.update(tasks).set({ status: "failed" }).where(eq(tasks.id, taskId));
        await store.appendEvent({
          at: this.d.now(),
          competenciaId: cid,
          kind: "agent.failed",
          agent: agent.name,
          payload: { phase, taskId, runId, error },
        });
        blocked = true;
      }
      if (blocked) {
        await this.transition(cid, phase, "blocked");
        return { status: "blocked", phase };
      }
      if (phase === "aprovacao") {
        await this.transition(cid, phase, "waiting");
        const dec = await approver.decide(cid);
        await store.db.insert(approvals).values({
          id: this.id("approval"),
          competenciaId: cid,
          phase,
          decision: dec.decision,
          by: dec.by,
          at: this.d.now(),
        });
        await store.appendEvent({
          at: this.d.now(),
          competenciaId: cid,
          kind: `approval.${dec.decision}`,
          payload: { by: dec.by },
        });
        if (dec.decision === "sent_back") {
          await this.transition(cid, phase, "blocked");
          return { status: "blocked", phase };
        }
      }
      await this.transition(cid, phase, "done");
    }
    await this.d.store.appendEvent({
      at: this.d.now(),
      competenciaId: cid,
      kind: "competencia.closed",
    });
    return { status: "closed" };
  }
}
