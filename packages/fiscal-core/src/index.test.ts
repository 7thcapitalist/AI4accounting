import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("@ai4a/fiscal-core", () => {
  it("loads", () => {
    expect(PACKAGE_NAME).toBe("@ai4a/fiscal-core");
  });
});
