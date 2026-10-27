import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openReader } from "@ai4a/db";
import { readDocumentSource } from "../../../../store/read-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_PATH = () =>
  resolve(/*turbopackIgnore: true*/ process.env.AI4_DB ?? "../../.data/month.db");

/** Source file of a captured document, looked up by id in the store. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const path = DB_PATH();
  if (!existsSync(/*turbopackIgnore: true*/ path))
    return Response.json({ error: "no store" }, { status: 404 });
  const store = openReader(path);
  try {
    const src = await readDocumentSource(store, id);
    return src ? Response.json(src) : Response.json({ error: "no source" }, { status: 404 });
  } catch {
    return Response.json({ error: "store busy" }, { status: 503 });
  } finally {
    store.close();
  }
}
