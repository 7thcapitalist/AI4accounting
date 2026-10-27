import { timingSafeEqual } from "node:crypto";

/**
 * Only the accountant may write a decision. The caller proves it with the shared secret
 * `AI4_ACCOUNTANT_TOKEN` as `Authorization: Bearer <token>`. With no secret configured the
 * route is closed (fails safe), so a default deploy never lets an anonymous caller approve.
 */
export function authorizeAccountant(req: Request): "ok" | "unauthorized" | "forbidden" {
  const secret = process.env.AI4_ACCOUNTANT_TOKEN;
  if (!secret) return "forbidden";
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m?.[1]) return "unauthorized";
  const a = Buffer.from(m[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "forbidden";
}
