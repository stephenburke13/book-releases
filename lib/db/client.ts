// Drizzle client over D1. Two ways in:
//   - getDb()/getEnv(): request + server-component paths, via OpenNext context.
//   - dbFromEnv(env): the scheduled() Worker handler, which gets env directly.

import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export type DB = ReturnType<typeof dbFromD1>;

export function dbFromD1(d1: D1Database) {
  return drizzle(d1, { schema });
}

export function dbFromEnv(env: CloudflareEnv): DB {
  return dbFromD1(env.DB);
}

/** Cloudflare env bindings in a request/server-component context. */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

/** Drizzle client in a request/server-component context. */
export async function getDb(): Promise<DB> {
  const env = await getEnv();
  return dbFromD1(env.DB);
}
