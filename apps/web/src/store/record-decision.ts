import { competencias, openStore } from "@ai4a/db";

export type Decision = "approved" | "sent_back";
export type DecisionResult = "recorded" | "unknown_client" | "not_waiting";

// Same literal as ACCOUNTANT_DECISION in @ai4a/agents (the web app only depends on the db package).
const DECISION_EVENT = "accountant.decision";

/**
 * Records the accountant's decision for a client's latest competencia. The Coordinator running
 * `month:run --accountant` is polling for this event; nothing else is changed here, so the
 * append-only log stays the single source of truth.
 */
export async function recordDecision(
  path: string,
  clientId: string,
  decision: Decision,
): Promise<DecisionResult> {
  const store = await openStore(path);
  try {
    const comps = (await store.db.select().from(competencias))
      .filter((c) => c.clientId === clientId)
      .sort((a, b) => a.month.localeCompare(b.month));
    const comp = comps.at(-1);
    if (!comp) return "unknown_client";
    if ((await store.getPhaseState(comp.id, "aprovacao")) !== "waiting") return "not_waiting";
    await store.appendEvent({
      at: Date.now(),
      competenciaId: comp.id,
      kind: DECISION_EVENT,
      payload: { decision, by: "contador" },
    });
    return "recorded";
  } finally {
    store.close();
  }
}
