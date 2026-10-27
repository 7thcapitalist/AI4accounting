import type { Phase } from "@ai4a/db";

export interface AgentTask {
  taskId: string;
  competenciaId: string;
  phase: Phase;
}

export interface AgentEvent {
  kind: string;
  documentId?: string;
  payload?: unknown;
}

export interface AgentFinding {
  severity: "info" | "warning" | "blocker";
  message: string;
  documentId?: string;
  source?: string;
}

export interface AgentResult {
  events: AgentEvent[];
  findings: AgentFinding[];
}

/** Workers take a task and return events and findings; the Coordinator persists them. */
export interface Agent {
  readonly name: string;
  run(task: AgentTask): Promise<AgentResult>;
}

export interface ApprovalDecision {
  decision: "approved" | "sent_back";
  by: string;
}

/** The accountant. In simulation, a stub decides. */
export interface Approver {
  decide(competenciaId: string): Promise<ApprovalDecision>;
}
