import { runSimMonth } from "@ai4a/agents";
import { openStore } from "@ai4a/db";
import { expect, it } from "vitest";
import { selectKpis } from "../sim/selectors";
import { readBoard } from "./read-board";

// The same run `pnpm demo` records: 15 synthetic clients, Captura to Entrega, read back as the board.
it("closes a full simulated month for 15 clients and shows it on the board", async () => {
  const st = await openStore(":memory:");
  const { outcomes } = await runSimMonth(st, 2026, { nClients: 15, parallel: true });
  expect(Object.values(outcomes)).toHaveLength(15);
  expect(Object.values(outcomes).every((o) => o.status === "closed")).toBe(true);
  const s = await readBoard(st);
  expect(s?.clients).toHaveLength(15);
  expect(s?.progress.every((p) => p.status === "done" && p.phase === "Entrega")).toBe(true);
  expect(selectKpis(s as NonNullable<typeof s>).closedClients).toBe(15);
  st.close();
}, 60_000);
