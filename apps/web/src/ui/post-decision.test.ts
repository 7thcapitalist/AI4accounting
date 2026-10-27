import { describe, expect, it } from "vitest";
import { postDecision } from "./post-decision";

const resp = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;

describe("postDecision", () => {
  it("is ok only on a 2xx answer and sends the bearer token", async () => {
    let seen: RequestInit | undefined;
    const f = (async (_u: unknown, init?: RequestInit) => {
      seen = init;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    expect(await postDecision("c1", "approved", "tok", f)).toEqual({ ok: true });
    expect(new Headers(seen?.headers).get("authorization")).toBe("Bearer tok");
  });

  it.each([401, 403, 409, 500])("reports failure on status %i", async (status) => {
    const r = await postDecision("c1", "sent_back", "tok", resp(status));
    expect(r).toMatchObject({ ok: false, status });
  });

  it("reports a network failure instead of swallowing it", async () => {
    const f = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await postDecision("c1", "approved", "tok", f)).toMatchObject({ ok: false, status: 0 });
  });
});
