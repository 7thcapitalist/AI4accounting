import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountantApprover, runSimMonth } from "@ai4a/agents";
import { openStore } from "@ai4a/db";
import { afterEach, describe, expect, it } from "vitest";
import { readBoard } from "../../../store/read-board";
import { POST } from "./route";

const req = (token?: string, decision = "approved") =>
  new Request("http://x/api/decision", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ clientId: "client-1", decision }),
  });

afterEach(() => {
  delete process.env.AI4_DB;
  delete process.env.AI4_ACCOUNTANT_TOKEN;
});

describe("POST /api/decision", () => {
  it("denies callers without the accountant token and writes nothing", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "ai4-")), "m.db");
    process.env.AI4_DB = path;
    const st = await openStore(path);
    const run = runSimMonth(st, 5, {
      nClients: 1,
      parallel: true,
      approver: accountantApprover(st, { pollMs: 5 }),
    });
    for (let i = 0; i < 400; i++) {
      const b = await readBoard(st);
      if (b?.progress.every((p) => p.status === "awaiting_approval")) break;
      await new Promise((r) => setTimeout(r, 10));
    }

    // No secret configured: closed to everyone.
    expect((await POST(req("anything"))).status).toBe(403);
    process.env.AI4_ACCOUNTANT_TOKEN = "s3cret";
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("wrong"))).status).toBe(403);
    expect((await readBoard(st))?.progress[0]?.status).toBe("awaiting_approval");

    // Allowed.
    expect((await POST(req("s3cret"))).status).toBe(200);
    expect((await run).outcomes["comp-1-2026-09"]).toEqual({ status: "closed" });
    st.close();
  });
});
