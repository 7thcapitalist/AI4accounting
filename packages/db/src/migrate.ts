import type { Client } from "@libsql/client";

// Hand-written DDL kept in sync with schema.ts (no drizzle-kit migrations yet).
const DDL = [
  `CREATE TABLE IF NOT EXISTS firms (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id), name TEXT NOT NULL, cnpj TEXT NOT NULL, regime TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS competencias (id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), month TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS phase_states (id TEXT PRIMARY KEY, competencia_id TEXT NOT NULL REFERENCES competencias(id), phase TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, competencia_id TEXT NOT NULL REFERENCES competencias(id), phase TEXT NOT NULL, agent TEXT NOT NULL, status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), agent TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, competencia_id TEXT NOT NULL, kind TEXT NOT NULL, agent TEXT, document_id TEXT, payload TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS events_competencia_idx ON events (competencia_id)`,
  `CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events is append-only'); END`,
  `CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, competencia_id TEXT NOT NULL REFERENCES competencias(id), run_id TEXT NOT NULL REFERENCES agent_runs(id), severity TEXT NOT NULL, message TEXT NOT NULL, document_id TEXT, source TEXT, resolved INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, competencia_id TEXT NOT NULL REFERENCES competencias(id), phase TEXT NOT NULL, decision TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, competencia_id TEXT NOT NULL REFERENCES competencias(id), kind TEXT NOT NULL, key TEXT, amount_centavos INTEGER, storage_path TEXT)`,
];

export async function migrate(client: Client): Promise<void> {
  await client.batch(DDL, "write");
}
