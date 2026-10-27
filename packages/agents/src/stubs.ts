import { PHASES, type Phase } from "@ai4a/db";
import { prng } from "./prng";
import type { Agent, Approver } from "./types";

/** Stub agents: no real work, deterministic output from the seed. Replaced by 3.2+ . */
export function stubAgents(seed: number): Record<Phase, Agent> {
  const rand = prng(seed);
  const out = {} as Record<Phase, Agent>;
  for (const phase of PHASES) {
    out[phase] = {
      name: `stub-${phase}`,
      async run() {
        const findings =
          rand() < 0.3
            ? [
                {
                  severity: "warning" as const,
                  message: `stub finding in ${phase}`,
                  source: "stub",
                },
              ]
            : [];
        return { events: [{ kind: "stub.work", payload: { phase } }], findings };
      },
    };
  }
  return out;
}

export const simApprover: Approver = {
  async decide() {
    return { decision: "approved", by: "sim-accountant" };
  },
};
