// D1 (SQLite) schema via Drizzle. Replaces the single-user config.yaml authors
// list + committed state.json with multi-user, queryable tables.

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/** A person who has given us their email. Pending until they confirm (double opt-in). */
export const subscribers = sqliteTable("subscribers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  status: text("status", { enum: ["pending", "confirmed", "unsubscribed"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
});

/** One subscriber following one author at a chosen cadence. */
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    subscriberId: text("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    authorKey: text("author_key")
      .notNull()
      .references(() => trackedAuthors.authorKey, { onDelete: "cascade" }),
    cadence: text("cadence", { enum: ["weekly", "monthly"] }).notNull().default("weekly"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastDigestAt: integer("last_digest_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("subscriptions_sub_author").on(t.subscriberId, t.authorKey)],
);

/** The union of every author anyone follows — drives the tracking job. Mapped to
 * the AuthorConfig the fetch sources expect. */
export const trackedAuthors = sqliteTable("tracked_authors", {
  authorKey: text("author_key").primaryKey(),
  name: text("name").notNull(),
  hardcoverId: integer("hardcover_id"),
  googleQuery: text("google_query"),
  /** JSON array of names used to filter Google Books false positives. */
  primaryAuthorNames: text("primary_author_names"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Events produced by the tracking job, queued for per-subscriber digests. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    authorKey: text("author_key").notNull(),
    type: text("type", { enum: ["announcement", "release", "date_change"] }).notNull(),
    author: text("author").notNull(),
    title: text("title").notNull(),
    releaseDate: text("release_date").notNull(),
    datePrecision: text("date_precision", {
      enum: ["day", "month", "year", "unknown"],
    }).notNull(),
    /** JSON array of format strings. */
    formats: text("formats").notNull().default("[]"),
    previousReleaseDate: text("previous_release_date"),
    detectedAt: integer("detected_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("events_author_detected").on(t.authorKey, t.detectedAt)],
);

/** Single-row store for the tracker's State blob (works, seeds, run counter). */
export const trackerState = sqliteTable("tracker_state", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Cache of Hardcover author-search results to respect the ~60 req/min cap. */
export const authorSearchCache = sqliteTable("author_search_cache", {
  query: text("query").primaryKey(),
  results: text("results").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
