import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Decision, recordDecision } from "../../../store/record-decision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_PATH = () =>
  resolve(/*turbopackIgnore: true*/ process.env.AI4_DB ?? "../../.data/month.db");

/** The accountant's decision from the queue: `{ clientId, decision: "approved" | "sent_back" }`. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    clientId?: unknown;
    decision?: unknown;
  } | null;
  const { clientId, decision } = body ?? {};
  if (typeof clientId !== "string" || (decision !== "approved" && decision !== "sent_back"))
    return Response.json({ error: "bad request" }, { status: 400 });
  const path = DB_PATH();
  if (!existsSync(/*turbopackIgnore: true*/ path))
    return Response.json({ error: "no store" }, { status: 404 });
  try {
    const result = await recordDecision(path, clientId, decision as Decision);
    if (result === "recorded") return Response.json({ ok: true });
    return Response.json({ error: result }, { status: result === "unknown_client" ? 404 : 409 });
  } catch {
    return Response.json({ error: "store busy" }, { status: 503 });
  }
}
