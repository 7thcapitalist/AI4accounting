import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCOUNTANT_DECISION, accountantApprover, runSimMonth } from "@ai4a/agents";
import { openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import { readBoard } from "./read-board";
import { recordDecision } from "./record-decision";

describe("recordDecision", () => {
  it("rejects unknown clients and clients not waiting for approval", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "ai4-")), "m.db");
    const st = await openStore(path);
    await runSimMonth(st, 1, { nClients: 1 });
    st.close();
    expect(await recordDecision(path, "nope", "approved")).toBe("unknown_client");
    expect(await recordDecision(path, "client-1", "approved")).toBe("not_waiting");
  });

  it("lets the accountant approve from the queue while the month waits, parallel clients", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "ai4-")), "m.db");
    const st = await openStore(path);
    const run = runSimMonth(st, 5, {
      nClients: 2,
      parallel: true,
      approver: accountantApprover(st, { pollMs: 5 }),
    });
    const waiting = async () => {
      for (let i = 0; i < 400; i++) {
        const b = await readBoard(st);
        if (b?.progress.every((p) => p.status === "awaiting_approval")) return b;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("never waited");
    };
    const board = await waiting();
    expect(board.progress).toHaveLength(2);
    expect(await recordDecision(path, "client-1", "approved")).toBe("recorded");
    expect(await recordDecision(path, "client-2", "sent_back")).toBe("recorded");
    const { outcomes } = await run;
    expect(outcomes["comp-1-2026-09"]).toEqual({ status: "closed" });
    expect(outcomes["comp-2-2026-09"]).toMatchObject({ status: "blocked", phase: "aprovacao" });
    const events = await st.listEvents();
    expect(events.filter((e) => e.kind === ACCOUNTANT_DECISION)).toHaveLength(2);
    st.close();
  });
});
