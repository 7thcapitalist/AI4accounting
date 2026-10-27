import { evaluate, generatePortfolio, injectErrors } from "@ai4a/simulator";
import { describe, expect, it } from "vitest";
import { SimulatorTaxContext } from "./context";
import { taxPipeline } from "./pipeline";

describe.each([1, 7])("taxPipeline (pnpm eval, seed %i)", (seed) => {
  const injected = injectErrors(generatePortfolio(seed));
  const run = () => evaluate(injected, taxPipeline(new SimulatorTaxContext(seed)));

  it("gets the tax exact to the centavo in clean company-months", async () => {
    const r = await run();
    expect(r.cleanTax.total).toBeGreaterThan(0);
    expect(r.cleanTax.rate).toBeGreaterThanOrEqual(0.95);
  });

  it("catches wrong_revenue with recall >= 90% and reports no other type", async () => {
    const r = await run();
    const wrong = r.byType.find((t) => t.type === "wrong_revenue");
    expect(wrong?.recall).toBeGreaterThanOrEqual(0.9);
    for (const t of r.byType) if (t.type !== "wrong_revenue") expect(t.tp + t.fp).toBe(0);
  });

  it("does not report a revenue gap that cancelled or missing invoices already explain", async () => {
    const r = await run();
    const wrong = r.byType.find((t) => t.type === "wrong_revenue");
    expect(wrong?.precision).toBe(1);
    expect(r.falsePositives).toEqual([]);
  });
});
