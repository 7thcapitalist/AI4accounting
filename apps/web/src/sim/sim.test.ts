import { describe, expect, it } from "vitest";
import {
  approve,
  createSim,
  returnToAgent,
  type SimState,
  selectAccountantQueue,
  selectAgentStats,
  selectDeadlines,
  selectIsFinished,
  selectKpis,
  selectNeedsAccountant,
  step,
} from "./index";

/** Runs until finished, approving everything the accountant sees. */
function runAutoApprove(seed: number, maxTicks = 500): SimState {
  let s = createSim(seed);
  for (let i = 0; i < maxTicks && !selectIsFinished(s); i++) {
    s = step(s);
    for (const item of selectAccountantQueue(s)) s = approve(s, item.client.id);
  }
  return s;
}

describe("sim", () => {
  it("has 12 clients, 7 agents and no real identifiers", () => {
    const s = createSim(1);
    expect(s.clients).toHaveLength(12);
    expect(selectAgentStats(s)).toHaveLength(7);
    expect(JSON.stringify(s)).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  });

  it("is deterministic: same seed, same state and feed", () => {
    expect(runAutoApprove(42)).toEqual(runAutoApprove(42));
  });

  it("different seeds diverge", () => {
    expect(runAutoApprove(1).feed).not.toEqual(runAutoApprove(2).feed);
  });

  it("step and reducers do not mutate their input", () => {
    const s = createSim(7);
    const snapshot = structuredClone(s);
    step(s);
    expect(s).toEqual(snapshot);
  });

  it("every client reaches Entrega after approvals", () => {
    for (const seed of [1, 2, 3, 99]) {
      const s = runAutoApprove(seed);
      expect(selectIsFinished(s)).toBe(true);
      expect(s.progress.every((p) => p.phase === "Entrega" && p.protocol)).toBe(true);
      expect(selectKpis(s).closedClients).toBe(12);
      expect(selectKpis(s).openExceptions).toBe(0);
      expect(selectKpis(s).hoursSaved).toBeGreaterThan(0);
    }
  });

  it("stalls waiting for the accountant until someone approves", () => {
    let s = createSim(5);
    for (let i = 0; i < 300 && !selectNeedsAccountant(s); i++) s = step(s);
    expect(selectNeedsAccountant(s)).toBe(true);
    expect(selectAccountantQueue(s)).toHaveLength(12);
  });

  it("clinic raises the IRRF/CSRF finding in pt-BR with rule and source", () => {
    const s = runAutoApprove(3);
    const f = s.findings.find((x) => x.clientId === "c12" && x.agent === "Conferencia");
    expect(f?.message).toMatch(/sem IRRF retido/);
    expect(f?.rule).toBeTruthy();
    expect(f?.source).toMatch(/RIR\/2018.*art\. 714/);
    expect(f?.source).toMatch(/Lei 10\.833\/2003, art\. 30/);
    expect(f?.source).toMatch(/IN SRF 459\/2004/);
    // Private payer: public-entity rules (Lei 9.430 art. 64, IN RFB 1.234) must not be cited as the basis.
    expect(f?.source).not.toMatch(/9\.430|1\.234/);
    expect(f?.message).toMatch(/exceção de ambulatório/);
    expect(f?.rule).toMatch(/ambulatório/);
    expect(
      s.feed.some((e) => e.text.startsWith("Conferencia: NFS-e") && e.kind === "finding"),
    ).toBe(true);
  });

  it("returnToAgent sends the client back once, then it still reaches Entrega", () => {
    let s = createSim(3);
    for (let i = 0; i < 300 && !selectNeedsAccountant(s); i++) s = step(s);
    s = returnToAgent(s, "c12");
    const p = s.progress.find((x) => x.clientId === "c12");
    expect(p?.status).toBe("working");
    expect(p?.phase).toBe("Conferencia");
    expect(s.counters.Conferencia.returned).toBe(1);
    expect(s.findings.filter((f) => f.clientId === "c12" && f.status === "open")).toHaveLength(0);
    for (let i = 0; i < 500 && !selectIsFinished(s); i++) {
      s = step(s);
      for (const item of selectAccountantQueue(s)) s = approve(s, item.client.id);
    }
    expect(selectIsFinished(s)).toBe(true);
    // Rework pass raises nothing new for c12.
    expect(
      s.findings.filter((f) => f.clientId === "c12" && f.resolution === "approved"),
    ).toHaveLength(0);
  });

  it("approve/return are no-ops when the client is not awaiting approval", () => {
    const s = createSim(1);
    expect(approve(s, "c01")).toBe(s);
    expect(returnToAgent(s, "c01")).toBe(s);
  });

  it("returnToAgent refuses Coordenador/Entrega and never completes a client without approval", () => {
    let s = createSim(3);
    for (let i = 0; i < 300 && !selectNeedsAccountant(s); i++) s = step(s);
    for (const bad of ["Coordenador", "Entrega"] as const) {
      expect(returnToAgent(s, "c12", bad)).toBe(s);
    }
    s = returnToAgent(s, "c12", "Apuracao");
    // Returned client is working again, not done, and needs approval before Entrega.
    for (let i = 0; i < 200; i++) {
      s = step(s);
      const p = s.progress.find((x) => x.clientId === "c12");
      if (p?.status === "awaiting_approval") break;
      expect(p?.status).not.toBe("done");
      expect(p?.phase).not.toBe("Entrega");
    }
    expect(s.progress.find((x) => x.clientId === "c12")?.status).toBe("awaiting_approval");
  });

  it("deadline KPI separates PGDAS-D and DARF clients", () => {
    const s = createSim(1);
    const d = selectDeadlines(s);
    expect(d.map((x) => x.obligation)).toEqual(["PGDAS-D", "DARF"]);
    expect(d[0]?.clients).toBe(8);
    expect(d[1]?.clients).toBe(4);
    const k = selectKpis(s);
    expect(k.deadlineLabel).toMatch(/PGDAS-D.*DARF/);
    expect(k.deadlines).toHaveLength(2);
  });
});
