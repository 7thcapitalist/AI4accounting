import { describe, expect, it } from "vitest";
import { createSim, selectAccountantQueue, selectAgentStats, selectKpis, step } from "./index";

function advance(seed: number, ticks: number) {
  let s = createSim(seed);
  for (let i = 0; i < ticks; i++) s = step(s);
  return s;
}

describe("accountant queue", () => {
  it("lists blocked clients with open findings as exceptions, after the approvals", () => {
    const s = structuredClone(advance(2026, 60));
    const [first, second] = s.progress;
    if (!first || !second) throw new Error("need two clients");
    first.status = "blocked";
    second.status = "awaiting_approval";
    s.findings.push({
      id: "f-x",
      clientId: first.clientId,
      agent: "Conferencia",
      phase: "Conferencia",
      severity: "alta",
      message: "m",
      reasoning: "r",
      rule: "r",
      source: "s",
      action: "a",
      status: "open",
    });
    const q = selectAccountantQueue(s);
    expect(q.find((i) => i.client.id === first.clientId)?.kind).toBe("exception");
    expect(q.find((i) => i.client.id === second.clientId)?.kind).toBe("approval");
    expect(q.map((i) => i.kind).lastIndexOf("approval")).toBeLessThan(
      q.map((i) => i.kind).indexOf("exception"),
    );
  });
});

describe("agent stats", () => {
  it("adds up to the hours saved shown on the board", () => {
    const s = advance(2026, 40);
    const stats = selectAgentStats(s);
    const total = stats.reduce((sum, a) => sum + a.savedMinutes, 0);
    const board = s.progress.reduce((sum, p) => sum + p.savedMinutes, 0);
    expect(total).toBe(board);
    expect(selectKpis(s).hoursSaved).toBe(Math.round((board / 60) * 10) / 10);
  });

  it("names the clients each agent is working on", () => {
    const stats = selectAgentStats(advance(2026, 3));
    for (const a of stats) expect(a.currentClients).toHaveLength(a.activeClients);
    expect(stats.some((a) => a.perDay > 0)).toBe(true);
  });
});
