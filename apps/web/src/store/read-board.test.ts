import { runSimMonth } from "@ai4a/agents";
import { openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import { ceilingUsage } from "../sim/ceiling";
import { selectKpis } from "../sim/selectors";
import { readBoard } from "./read-board";

describe("readBoard", () => {
  it("returns null for an empty store", async () => {
    const st = await openStore(":memory:");
    expect(await readBoard(st)).toBeNull();
    st.close();
  });

  it("builds the board from a simulated month in the store", async () => {
    const st = await openStore(":memory:");
    await runSimMonth(st, 7, { nClients: 4 });
    const s = await readBoard(st);
    expect(s?.clients).toHaveLength(4);
    expect(s?.progress.every((p) => p.status === "done")).toBe(true);
    expect(s?.feed.some((e) => e.kind === "delivery")).toBe(true);
    expect(selectKpis(s as NonNullable<typeof s>).closedClients).toBe(4);
    expect(s?.clients.every((c) => c.rbt12Cents && c.rbt12Cents > 0)).toBe(true);
    st.close();
  });

  it("shows a running phase while the month is still open", async () => {
    const st = await openStore(":memory:");
    await runSimMonth(st, 3, { nClients: 1 });
    await st.setPhaseState("comp-1-2026-09", "entrega", "running", 999);
    const s = await readBoard(st);
    expect(s?.progress[0]).toMatchObject({ phase: "Entrega", status: "working" });
    st.close();
  });
});

describe("ceilingUsage", () => {
  it("flags Simples near the R$ 4,8 mi ceiling and the R$ 3,6 mi sublimit", () => {
    const u = ceilingUsage({
      regime: "SimplesAnexoIII",
      rbt12Cents: 400_000_000,
      monthlyRevenueCents: 0,
    });
    expect(u).toMatchObject({ pct: 83, level: "perto", overSublimit: true });
  });
  it("uses the Presumido R$ 78 mi limit", () => {
    const u = ceilingUsage({
      regime: "LucroPresumido",
      rbt12Cents: 390_000_000,
      monthlyRevenueCents: 0,
    });
    expect(u).toMatchObject({ pct: 5, level: "ok", overSublimit: false });
  });
});
