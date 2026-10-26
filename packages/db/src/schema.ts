import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Enums are text columns checked in code (ADR 0002). Money is integer centavos.
export const PHASES = [
  "captura",
  "coleta",
  "conferencia",
  "conciliacao",
  "apuracao",
  "aprovacao",
  "entrega",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_STATUSES = ["pending", "running", "waiting", "blocked", "done"] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const TASK_STATUSES = ["queued", "running", "done", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const firms = sqliteTable("firms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id),
  name: text("name").notNull(),
  cnpj: text("cnpj").notNull(),
  regime: text("regime").notNull(),
});

export const competencias = sqliteTable("competencias", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  month: text("month").notNull(), // YYYY-MM
});

export const phaseStates = sqliteTable("phase_states", {
  id: text("id").primaryKey(),
  competenciaId: text("competencia_id")
    .notNull()
    .references(() => competencias.id),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  competenciaId: text("competencia_id")
    .notNull()
    .references(() => competencias.id),
  phase: text("phase").notNull(),
  agent: text("agent").notNull(),
  status: text("status").notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  agent: text("agent").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  error: text("error"),
});

// Append-only: the store exposes insert and read only.
export const events = sqliteTable(
  "events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    at: integer("at").notNull(),
    competenciaId: text("competencia_id").notNull(),
    kind: text("kind").notNull(),
    agent: text("agent"),
    documentId: text("document_id"),
    payload: text("payload").notNull(),
  },
  (t) => [index("events_competencia_idx").on(t.competenciaId)],
);

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  competenciaId: text("competencia_id")
    .notNull()
    .references(() => competencias.id),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  documentId: text("document_id"),
  source: text("source"), // rule/legal source behind the finding
  resolved: integer("resolved").notNull().default(0),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  competenciaId: text("competencia_id")
    .notNull()
    .references(() => competencias.id),
  phase: text("phase").notNull(),
  decision: text("decision").notNull(), // approved | sent_back
  by: text("by").notNull(),
  at: integer("at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  competenciaId: text("competencia_id")
    .notNull()
    .references(() => competencias.id),
  kind: text("kind").notNull(), // nfe | nfse | ofx | ledger
  key: text("key"), // chave de acesso when applicable
  amountCentavos: integer("amount_centavos"),
  storagePath: text("storage_path"),
});
