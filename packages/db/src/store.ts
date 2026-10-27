import { type Client, createClient } from "@libsql/client";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "./migrate";
import * as s from "./schema";

export type Db = ReturnType<typeof drizzle<typeof s>>;
export type EventRow = typeof s.events.$inferSelect;
export type NewEvent = Omit<typeof s.events.$inferInsert, "seq" | "payload"> & {
  payload?: unknown;
};

export interface Store {
  db: Db;
  client: Client;
  /** Append-only: there is no update or delete for events. */
  appendEvent(e: NewEvent): Promise<void>;
  listEvents(competenciaId?: string): Promise<EventRow[]>;
  getPhaseState(competenciaId: string, phase: s.Phase): Promise<s.PhaseStatus | undefined>;
  setPhaseState(
    competenciaId: string,
    phase: s.Phase,
    status: s.PhaseStatus,
    at: number,
  ): Promise<void>;
  close(): void;
}

/** Opens a libSQL file (or ":memory:") and creates the schema. */
export async function openStore(path: string): Promise<Store> {
  const client = createClient({ url: path === ":memory:" ? ":memory:" : `file:${path}` });
  await migrate(client);
  const db = drizzle(client, { schema: s });
  return {
    db,
    client,
    async appendEvent(e) {
      await db.insert(s.events).values({ ...e, payload: JSON.stringify(e.payload ?? {}) });
    },
    async listEvents(competenciaId) {
      const q = db.select().from(s.events);
      return (competenciaId ? q.where(eq(s.events.competenciaId, competenciaId)) : q).orderBy(
        asc(s.events.seq),
      );
    },
    async getPhaseState(competenciaId, phase) {
      const rows = await db
        .select()
        .from(s.phaseStates)
        .where(eq(s.phaseStates.id, `${competenciaId}:${phase}`));
      return rows[0]?.status as s.PhaseStatus | undefined;
    },
    async setPhaseState(competenciaId, phase, status, at) {
      const id = `${competenciaId}:${phase}`;
      await db
        .insert(s.phaseStates)
        .values({ id, competenciaId, phase, status, updatedAt: at })
        .onConflictDoUpdate({ target: s.phaseStates.id, set: { status, updatedAt: at } });
    },
    close: () => client.close(),
  };
}
