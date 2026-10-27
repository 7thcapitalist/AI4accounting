import type { Store } from "@ai4a/db";
import type { ApprovalDecision, Approver } from "./types";

/** Event the web queue appends when the accountant decides; the Coordinator is waiting for it. */
export const ACCOUNTANT_DECISION = "accountant.decision";

export interface AccountantApproverOptions {
  pollMs?: number;
  /** Gives up (sends back) after this many ms; undefined waits forever. */
  timeoutMs?: number;
  by?: string;
}

/**
 * The real accountant: waits for an `accountant.decision` event for the competencia, written by
 * the web queue. Only decisions recorded after the wait began count, so an old one never settles
 * a new approval.
 */
export function accountantApprover(
  store: Pick<Store, "listEvents">,
  { pollMs = 500, timeoutMs, by = "contador" }: AccountantApproverOptions = {},
): Approver {
  return {
    async decide(competenciaId): Promise<ApprovalDecision> {
      const seen = (await store.listEvents(competenciaId)).at(-1)?.seq ?? 0;
      const started = Date.now();
      for (;;) {
        const hit = (await store.listEvents(competenciaId)).find(
          (e) => e.seq > seen && e.kind === ACCOUNTANT_DECISION,
        );
        if (hit) {
          const p = JSON.parse(hit.payload) as { decision?: string; by?: string };
          return {
            decision: p.decision === "sent_back" ? "sent_back" : "approved",
            by: p.by ?? by,
          };
        }
        if (timeoutMs !== undefined && Date.now() - started >= timeoutMs)
          return { decision: "sent_back", by: "timeout" };
        await new Promise((r) => setTimeout(r, pollMs));
      }
    },
  };
}
