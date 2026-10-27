// Database schema and store (libSQL + Drizzle, ADR 0002).
export const PACKAGE_NAME = "@ai4a/db";
export { migrate } from "./migrate";
export * from "./schema";
export type { Db, EventRow, NewEvent, Store } from "./store";
export { openStore } from "./store";
