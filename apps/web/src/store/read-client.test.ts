import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSimMonth } from "@ai4a/agents";
import { agentRuns, findings, openStore } from "@ai4a/db";
import { describe, expect, it } from "vitest";
import { readClientMonth, readDocumentSource, splitSource } from "./read-client";

describe("splitSource", () => {
  it("splits the Check agent's rule | source | ref", () => {
    expect(splitSource("R1 | Ajuste SINIEF 07/05 | ref 123")).toEqual({
      rule: "R1",
      source: "Ajuste SINIEF 07/05",
      ref: "123",
    });
  });
  it("keeps free text as the source", () => {
    expect(splitSource("LC 123/2006")).toEqual({ rule: null, source: "LC 123/2006", ref: null });
    expect(splitSource(null)).toEqual({ rule: null, source: null, ref: null });
  });
});

describe("readClientMonth", () => {
  it("returns null for an unknown client", async () => {
    const st = await openStore(":memory:");
    expect(await readClientMonth(st, "nope")).toBeNull();
    st.close();
  });

  it("traces a closed month: phases, timeline, documents with source, approval", async () => {
    const st = await openStore(":memory:");
    await runSimMonth(st, 7, { nClients: 1, dataDir: mkdtempSync(join(tmpdir(), "ai4a-t-")) });
    const m = await readClientMonth(st, "client-1");
    expect(m?.phases.every((p) => p.status === "done")).toBe(true);
    expect(m?.timeline.some((t) => t.kind === "agent.finished" && t.phase === "conferencia")).toBe(
      true,
    );
    expect(m?.approvals).toHaveLength(1);
    const doc = m?.documents.find((d) => d.kind === "nfe" && d.hasSource);
    expect(doc).toBeDefined();
    const src = await readDocumentSource(st, doc?.id as string);
    expect(src?.text).toContain("<");
    st.close();
  });

  it("exposes a finding's rule, source and phase", async () => {
    const st = await openStore(":memory:");
    await runSimMonth(st, 3, { nClients: 1 });
    const [run] = await st.db.select().from(agentRuns);
    await st.db.insert(findings).values({
      id: "f-x",
      competenciaId: "comp-1-2026-09",
      runId: (run as { id: string }).id,
      severity: "blocker",
      message: "CFOP divergente",
      source: "CFOP-1 | Ajuste SINIEF 07/05 | ref 99",
    });
    const m = await readClientMonth(st, "client-1");
    expect(m?.findings.find((f) => f.id === "f-x")).toMatchObject({
      rule: "CFOP-1",
      source: "Ajuste SINIEF 07/05",
      ref: "99",
      resolved: false,
    });
    st.close();
  });

  it("returns null source for an unknown document", async () => {
    const st = await openStore(":memory:");
    expect(await readDocumentSource(st, "x")).toBeNull();
    st.close();
  });
});
