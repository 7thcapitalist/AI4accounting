import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents, openStore } from "@ai4a/db";
import { generatePortfolio, toLedgerCsv, toOfx } from "@ai4a/simulator";
import { describe, expect, it } from "vitest";
import { runSimMonth } from "../month";
import { AdnNfseProvider, CaptureAgent, FolderProvider, SimulatorProvider } from "./index";

const MONTH = "2026-09";
const tmp = () => mkdtempSync(join(tmpdir(), "ai4a-test-"));

async function setup(cnpj: string) {
  const st = await openStore(":memory:");
  await st.client.batch([
    "INSERT INTO firms VALUES ('f','F')",
    `INSERT INTO clients VALUES ('cl','f','C','${cnpj}','simples')`,
    `INSERT INTO competencias VALUES ('c1','cl','${MONTH}')`,
  ]);
  return st;
}
const task = { taskId: "t", competenciaId: "c1", phase: "captura" } as const;

describe("SimulatorProvider + CaptureAgent", () => {
  const { company, months } = generatePortfolio(3, [MONTH]).companies[0] ?? {
    company: undefined,
    months: [],
  };
  const sim = months[0];
  if (!company || !sim) throw new Error("empty portfolio");

  it("stores every document once with its sha256 and emits events", async () => {
    const st = await setup(company.cnpj);
    const dataDir = tmp();
    const agent = new CaptureAgent({ store: st, provider: new SimulatorProvider(3), dataDir });
    const res = await agent.run(task);
    const captured = res.events.filter((e) => e.kind === "document.captured");
    expect(captured).toHaveLength(sim.documents.length + 2); // + ofx + ledger
    expect(res.findings).toEqual([]);
    const rows = await st.db.select().from(documents);
    expect(rows).toHaveLength(captured.length);
    for (const r of rows) {
      const sha = createHash("sha256")
        .update(readFileSync(r.storagePath ?? ""))
        .digest("hex");
      expect(r.storagePath).toContain(sha);
    }
    const nfe = sim.documents[0];
    expect(rows.find((r) => r.key === nfe?.ref)?.amountCentavos).toBe(nfe?.valor);
    expect(readdirSync(dataDir)).toHaveLength(rows.length);
    st.close();
  });

  it("is idempotent: a second run adds no rows and flags duplicates", async () => {
    const st = await setup(company.cnpj);
    const agent = new CaptureAgent({
      store: st,
      provider: new SimulatorProvider(3),
      dataDir: tmp(),
    });
    await agent.run(task);
    const again = await agent.run(task);
    expect(again.events.filter((e) => e.kind === "document.captured")).toHaveLength(0);
    expect(again.events.filter((e) => e.kind === "document.duplicate").length).toBeGreaterThan(0);
    expect(await st.db.select().from(documents)).toHaveLength(sim.documents.length + 2);
    st.close();
  });

  it("fails for a company the simulator does not know", async () => {
    const st = await setup("00000000000000");
    const agent = new CaptureAgent({
      store: st,
      provider: new SimulatorProvider(3),
      dataDir: tmp(),
    });
    await expect(agent.run(task)).rejects.toThrow(/no company/);
    st.close();
  });
});

describe("FolderProvider", () => {
  const entry = generatePortfolio(5, [MONTH]).companies[1];
  const sim = entry?.months[0];
  if (!entry || !sim) throw new Error("empty portfolio");
  const company = entry.company;

  function writeMonth(root: string) {
    const dir = join(root, `${company.id}-${company.cnpj}`, MONTH);
    mkdirSync(dir, { recursive: true });
    for (const d of sim?.documents ?? []) writeFileSync(join(dir, d.file), d.xml);
    writeFileSync(join(dir, "extrato.ofx"), toOfx(company, sim as never));
    writeFileSync(join(dir, "razao.csv"), toLedgerCsv(sim as never));
    return dir;
  }

  it("captures a folder in the simulator layout, same keys and amounts", async () => {
    const root = tmp();
    writeMonth(root);
    const out = await new FolderProvider(root).capture({ cnpj: company.cnpj, month: MONTH });
    expect(out.rejected).toEqual([]);
    const xml = out.files.filter((f) => f.kind === "nfe" || f.kind === "nfse");
    expect(xml.map((f) => [f.key, f.amountCentavos]).sort()).toEqual(
      sim.documents.map((d) => [d.ref, d.valor]).sort(),
    );
    expect(out.files.map((f) => f.kind)).toContain("ofx");
  });

  it("rejects bad XML and other-month notes instead of failing the run", async () => {
    const root = tmp();
    const dir = writeMonth(root);
    writeFileSync(join(dir, "broken.xml"), "<nfeProc><NFe/></nfeProc>");
    writeFileSync(join(dir, "random.xml"), "<foo/>");
    const st = await setup(company.cnpj);
    const res = await new CaptureAgent({
      store: st,
      provider: new FolderProvider(root),
      dataDir: tmp(),
    }).run(task);
    expect(res.findings.map((f) => f.message).join("\n")).toMatch(/broken\.xml/);
    expect(res.findings).toHaveLength(2);
    expect(res.findings.every((f) => f.severity === "warning")).toBe(true);
    st.close();
  });

  it("warns when the month has no documents", async () => {
    const root = tmp();
    const st = await setup(company.cnpj);
    const res = await new CaptureAgent({
      store: st,
      provider: new FolderProvider(root),
      dataDir: tmp(),
    }).run(task);
    expect(res.findings[0]?.message).toMatch(/Nenhum documento/);
    st.close();
  });
});

describe("AdnNfseProvider", () => {
  const req = { cnpj: "11222333000181", month: MONTH };
  it("is disabled without the env var and never reaches the network", async () => {
    await expect(new AdnNfseProvider({}).capture(req)).rejects.toThrow(/disabled/);
  });
  it("is a stub even when enabled", async () => {
    await expect(
      new AdnNfseProvider({ ADN_NFSE_BASE_URL: "https://example.invalid" }).capture(req),
    ).rejects.toThrow(/stub/);
  });
});

describe("month:run with capture", () => {
  it("captures the simulated month through the simulator and through a folder", async () => {
    const seed = 11;
    const st1 = await openStore(":memory:");
    const a = await runSimMonth(st1, seed, { dataDir: tmp() });
    expect(Object.values(a.outcomes).every((o) => o.status === "closed")).toBe(true);
    const fromSim = (await st1.listEvents()).filter((e) => e.kind === "document.captured");
    expect(fromSim.length).toBeGreaterThan(0);

    const root = tmp();
    for (const { company, months } of generatePortfolio(seed, ["2026-09"]).companies.slice(0, 3)) {
      const m = months[0];
      if (!m) continue;
      const dir = join(root, `${company.id}-${company.cnpj}`, "2026-09");
      mkdirSync(dir, { recursive: true });
      for (const d of m.documents) writeFileSync(join(dir, d.file), d.xml);
      writeFileSync(join(dir, "extrato.ofx"), toOfx(company, m));
      writeFileSync(join(dir, "razao.csv"), toLedgerCsv(m));
    }
    const st2 = await openStore(":memory:");
    const b = await runSimMonth(st2, seed, { dataDir: tmp(), provider: new FolderProvider(root) });
    expect(Object.values(b.outcomes).every((o) => o.status === "closed")).toBe(true);
    const hashes = async (s: typeof st1) =>
      (await s.listEvents())
        .filter((e) => e.kind === "document.captured")
        .map((e) => JSON.parse(e.payload).sha256 as string)
        .sort();
    expect(await hashes(st2)).toEqual(await hashes(st1));
  });
});
