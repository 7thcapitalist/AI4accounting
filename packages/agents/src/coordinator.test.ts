import { openStore, PHASES } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import { Coordinator, canTransition, runSimMonth, simApprover, stubAgents } from "./index";

describe("canTransition", () => {
  it("allows the happy path and rejects skipping", () => {
    expect(canTransition("pending", "running")).toBe(true);
    expect(canTransition("running", "done")).toBe(true);
    expect(canTransition("pending", "done")).toBe(false);
    expect(canTransition("done", "running")).toBe(false);
  });
});

describe("simulated month", () => {
  it("closes every competencia with a complete event log", async () => {
    const st = await openStore(":memory:");
    const { outcomes } = await runSimMonth(st, 42);
    expect(Object.values(outcomes).every((o) => o.status === "closed")).toBe(true);
    for (const cid of Object.keys(outcomes)) {
      const ev = await st.listEvents(cid);
      const done = ev
        .filter((e) => e.kind === "phase.changed" && JSON.parse(e.payload).to === "done")
        .map((e) => JSON.parse(e.payload).phase);
      expect(done).toEqual([...PHASES]);
      expect(ev.at(-1)?.kind).toBe("competencia.closed");
      expect(ev.some((e) => e.kind === "approval.approved")).toBe(true);
    }
    st.close();
  });

  it("is deterministic for a seed", async () => {
    const log = async (seed: number) => {
      const st = await openStore(":memory:");
      await runSimMonth(st, seed);
      const ev = (await st.listEvents()).map(({ at, competenciaId, kind, payload }) => ({
        at,
        competenciaId,
        kind,
        payload,
      }));
      st.close();
      return ev;
    };
    expect(await log(7)).toEqual(await log(7));
  });
});

describe("Coordinator", () => {
  async function setup() {
    const st = await openStore(":memory:");
    await st.client.batch([
      "INSERT INTO firms VALUES ('f','F')",
      "INSERT INTO clients VALUES ('cl','f','C','00','simples')",
      "INSERT INTO competencias VALUES ('c1','cl','2026-09')",
    ]);
    let t = 0;
    return { st, now: () => ++t };
  }

  it("blocks the phase on a blocker finding and stops", async () => {
    const { st, now } = await setup();
    const agents = stubAgents(1);
    agents.conferencia = {
      name: "bad",
      run: async () => ({
        events: [],
        findings: [{ severity: "blocker", message: "missing invoice" }],
      }),
    };
    const out = await new Coordinator({
      store: st,
      agents,
      approver: simApprover,
      now,
    }).runCompetencia("c1");
    expect(out).toEqual({ status: "blocked", phase: "conferencia" });
    expect(await st.getPhaseState("c1", "conferencia")).toBe("blocked");
    expect(await st.getPhaseState("c1", "conciliacao")).toBeUndefined();
  });

  it("blocks and logs when an agent throws", async () => {
    const { st, now } = await setup();
    const agents = stubAgents(1);
    agents.captura = {
      name: "boom",
      run: async () => {
        throw new Error("boom");
      },
    };
    const out = await new Coordinator({
      store: st,
      agents,
      approver: simApprover,
      now,
    }).runCompetencia("c1");
    expect(out.status).toBe("blocked");
    expect((await st.listEvents("c1")).some((e) => e.kind === "agent.failed")).toBe(true);
  });

  it("blocks when the accountant sends back", async () => {
    const { st, now } = await setup();
    const approver = { decide: async () => ({ decision: "sent_back" as const, by: "acc" }) };
    const out = await new Coordinator({
      store: st,
      agents: stubAgents(1),
      approver,
      now,
    }).runCompetencia("c1");
    expect(out).toEqual({ status: "blocked", phase: "aprovacao" });
  });
});
