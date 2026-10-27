import { describe, expect, it } from "vitest";
import { openStore } from "./index";

describe("store", () => {
  it("appends events in order and rejects update/delete", async () => {
    const st = await openStore(":memory:");
    await st.appendEvent({ at: 1, competenciaId: "c1", kind: "a" });
    await st.appendEvent({ at: 2, competenciaId: "c1", kind: "b", payload: { x: 1 } });
    const ev = await st.listEvents("c1");
    expect(ev.map((e) => e.kind)).toEqual(["a", "b"]);
    await expect(st.client.execute("UPDATE events SET kind='z'")).rejects.toThrow(/append-only/);
    await expect(st.client.execute("DELETE FROM events")).rejects.toThrow(/append-only/);
    st.close();
  });

  it("upserts phase state", async () => {
    const st = await openStore(":memory:");
    await st.client.batch([
      "INSERT INTO firms VALUES ('f','F')",
      "INSERT INTO clients VALUES ('cl','f','C','00','simples')",
      "INSERT INTO competencias VALUES ('c1','cl','2026-09')",
    ]);
    await st.setPhaseState("c1", "captura", "running", 1);
    await st.setPhaseState("c1", "captura", "done", 2);
    expect(await st.getPhaseState("c1", "captura")).toBe("done");
    st.close();
  });
});
