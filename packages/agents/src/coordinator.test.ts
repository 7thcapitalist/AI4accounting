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
      // Ids are random UUIDs, so the log is compared with them masked.
      const mask = (p: string) => p.replace(/(task|run|finding|approval)-[0-9a-f-]{36}/g, "$1-ID");
      const ev = (await st.listEvents()).map(({ at, competenciaId, kind, payload }) => ({
        at,
        competenciaId,
        kind,
        payload: mask(payload),
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
    const kinds = (await st.listEvents("c1")).map((e) => e.kind);
    expect(kinds).toContain("agent.started");
    expect(kinds).toContain("agent.failed");
    expect(kinds).not.toContain("agent.finished");
  });

  it("logs agent.started and agent.finished for every run", async () => {
    const { st, now } = await setup();
    await new Coordinator({
      store: st,
      agents: stubAgents(1),
      approver: simApprover,
      now,
    }).runCompetencia("c1");
    const ev = await st.listEvents("c1");
    const started = ev.filter((e) => e.kind === "agent.started");
    const finished = ev.filter((e) => e.kind === "agent.finished");
    expect(started).toHaveLength(PHASES.length);
    expect(finished.map((e) => JSON.parse(e.payload).runId)).toEqual(
      started.map((e) => JSON.parse(e.payload).runId),
    );
    for (const s of started)
      expect(ev.indexOf(s)).toBeLessThan(
        ev.findIndex(
          (e) =>
            e.kind === "agent.finished" &&
            JSON.parse(e.payload).runId === JSON.parse(s.payload).runId,
        ),
      );
  });

  it("two Coordinator instances share one store without id collisions", async () => {
    const { st, now } = await setup();
    await st.client.execute("INSERT INTO competencias VALUES ('c2','cl','2026-10')");
    const mk = () =>
      new Coordinator({ store: st, agents: stubAgents(1), approver: simApprover, now });
    expect((await mk().runCompetencia("c1")).status).toBe("closed");
    expect((await mk().runCompetencia("c2")).status).toBe("closed");
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
