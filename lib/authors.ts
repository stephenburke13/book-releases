// Map tracked_authors rows to the AuthorConfig shape the fetch sources expect,
// and derive stable author keys from Hardcover ids.

import type { AuthorConfig } from "../src/config.js";
import type { trackedAuthors } from "./db/schema";

type TrackedAuthorRow = typeof trackedAuthors.$inferSelect;

/** Stable, source-agnostic slug for an author. Hardcover id is canonical. */
export function authorKeyForHardcover(hardcoverId: number): string {
  return `hc-${hardcoverId}`;
}

/** Lowercase slug fallback when there is no Hardcover id. */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toAuthorConfig(row: TrackedAuthorRow): AuthorConfig {
  return {
    author_key: row.authorKey,
    name: row.name,
    ...(row.hardcoverId != null ? { hardcover_id: row.hardcoverId } : {}),
    ...(row.googleQuery ? { google_query: row.googleQuery } : {}),
    ...(row.primaryAuthorNames
      ? { primary_author_names: JSON.parse(row.primaryAuthorNames) as string[] }
      : {}),
  };
}
