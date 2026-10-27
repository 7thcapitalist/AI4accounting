import { openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import { ACCOUNTANT_DECISION, accountantApprover } from "./accountant";

async function setup() {
  const st = await openStore(":memory:");
  await st.appendEvent({ at: 1, competenciaId: "c1", kind: "old" });
  return st;
}

describe("accountantApprover", () => {
  it("waits for a decision recorded after it started waiting", async () => {
    const st = await setup();
    await st.appendEvent({
      at: 2,
      competenciaId: "c1",
      kind: ACCOUNTANT_DECISION,
      payload: { decision: "sent_back" },
    });
    const p = accountantApprover(st, { pollMs: 5 }).decide("c1");
    setTimeout(
      () =>
        st.appendEvent({
          at: 3,
          competenciaId: "c1",
          kind: ACCOUNTANT_DECISION,
          payload: { decision: "approved", by: "ana" },
        }),
      20,
    );
    expect(await p).toEqual({ decision: "approved", by: "ana" });
    st.close();
  });

  it("sends back on timeout", async () => {
    const st = await setup();
    const d = await accountantApprover(st, { pollMs: 5, timeoutMs: 20 }).decide("c1");
    expect(d.decision).toBe("sent_back");
    st.close();
  });
});
