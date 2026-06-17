// D1-backed StateStore for the tracking core. Persists the tracker State as a
// single JSON row (preserving the exact diff semantics) and appends each run's
// events to the events table for the digest dispatcher to read.
//
// Deliberately imports only types from the core (no node:fs), so it bundles
// cleanly into the Worker.

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NotifyEvent, State } from "../src/models.js";
import type { StateStore } from "../src/store/base.js";
import type { DB } from "./db/client";
import { events as eventsTable, trackerState } from "./db/schema";

const STATE_ROW_ID = 1;
const CURRENT_VERSION = 1;

function emptyState(): State {
  return {
    version: CURRENT_VERSION,
    run_counter: 0,
    last_run: null,
    authors_seeded: {},
    works: {},
  };
}

export class D1StateStore implements StateStore {
  constructor(private readonly db: DB) {}

  async load(): Promise<State> {
    const row = await this.db
      .select({ data: trackerState.data })
      .from(trackerState)
      .where(eq(trackerState.id, STATE_ROW_ID))
      .get();
    if (!row?.data) return emptyState();
    return JSON.parse(row.data) as State;
  }

  async save(state: State): Promise<void> {
    const data = JSON.stringify(state);
    await this.db
      .insert(trackerState)
      .values({ id: STATE_ROW_ID, data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: trackerState.id,
        set: { data, updatedAt: new Date() },
      });
  }

  async recordEvents(events: NotifyEvent[], at: Date): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map((e) => ({
      id: randomUUID(),
      authorKey: e.author_key,
      type: e.type,
      author: e.author,
      title: e.title,
      releaseDate: e.release_date,
      datePrecision: e.date_precision,
      formats: JSON.stringify(e.formats),
      previousReleaseDate: e.previous_release_date ?? null,
      detectedAt: at,
    }));
    await this.db.insert(eventsTable).values(rows);
  }
}
