// State persistence. state.json is committed to the repo so each run diffs
// cleanly against the last. Written atomically so a crashed run never commits a
// half-file.

import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import type { State } from "./models.js";

export const CURRENT_VERSION = 1;

const datePrecision = z.enum(["day", "month", "year", "unknown"]);
const sourceName = z.enum(["hardcover", "googlebooks"]);

const notifiedFlag = z.object({
  sent: z.boolean(),
  run: z.number().int().nullable(),
});

const workSchema = z.object({
  work_key: z.string(),
  merged_keys: z.array(z.string()).default([]),
  sources: z.record(sourceName, z.object({ id: z.string(), last_seen_run: z.number().int() })),
  author_key: z.string(),
  author: z.string(),
  title: z.string(),
  match_title: z.string(),
  release_date: z.string(),
  date_precision: datePrecision,
  language: z.string(),
  formats: z.array(z.string()).default([]),
  first_seen_run: z.number().int(),
  seeded: z.boolean(),
  status: z.enum(["active", "released", "retired"]),
  missing_since_run: z.number().int().nullable(),
  notified: z.object({
    announced: notifiedFlag,
    released: notifiedFlag,
    date_changes: z
      .array(z.object({ from: z.string(), to: z.string(), run: z.number().int() }))
      .default([]),
  }),
});

export const stateSchema = z.object({
  version: z.number().int(),
  run_counter: z.number().int(),
  last_run: z
    .object({
      run: z.number().int(),
      at: z.string(),
      sources_ok: z.record(sourceName, z.boolean()),
    })
    .nullable(),
  authors_seeded: z.record(
    z.string(),
    z.object({ sources: z.array(sourceName), run: z.number().int() }),
  ),
  works: z.record(z.string(), workSchema),
});

export function emptyState(): State {
  return {
    version: CURRENT_VERSION,
    run_counter: 0,
    last_run: null,
    authors_seeded: {},
    works: {},
  };
}

/** Upgrade older state shapes in place. Add cases here as the schema evolves. */
function migrate(raw: { version?: number } & Record<string, unknown>): unknown {
  // version 1 is current; nothing to migrate yet.
  return raw;
}

export function loadState(path = "state.json"): State {
  if (!existsSync(path)) return emptyState();
  const text = readFileSync(path, "utf8").trim();
  if (!text) return emptyState();
  const migrated = migrate(JSON.parse(text));
  const parsed = stateSchema.safeParse(migrated);
  if (!parsed.success) {
    throw new Error(`Invalid ${path}:\n${parsed.error.toString()}`);
  }
  return parsed.data as State;
}

export function saveState(state: State, path = "state.json"): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}
