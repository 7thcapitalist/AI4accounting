import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readBoardFile } from "../../../store/read-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Month store written by `pnpm month:run --sim <seed> --db <file>`; override with AI4_DB. */
const DB_PATH = () =>
  resolve(/*turbopackIgnore: true*/ process.env.AI4_DB ?? "../../.data/month.db");

export async function GET() {
  const path = DB_PATH();
  if (!existsSync(/*turbopackIgnore: true*/ path)) return Response.json({ state: null });
  try {
    return Response.json({ state: await readBoardFile(path) });
  } catch {
    // The writer may hold the file for a moment: the board keeps the last state and asks again.
    return Response.json({ error: "store busy" }, { status: 503 });
  }
}
