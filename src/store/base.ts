// Pluggable persistence for the tracking core.
//
// The single-user CLI persists to state.json on disk; the multi-user web app
// persists to Cloudflare D1. The diff engine itself stays storage-agnostic: it
// takes a State in and returns the next State out. A StateStore is just the
// load/save boundary plus a sink for the events a run produced, so the web app
// can queue events for later per-subscriber digests.

import type { NotifyEvent, State } from "../models.js";

export interface StateStore {
  /** Load the current tracker State (or an empty one on first run). */
  load(): Promise<State>;
  /** Persist the next State produced by a run. */
  save(state: State): Promise<void>;
  /**
   * Record the events a run produced. The file store ignores this (the CLI
   * emails immediately); the D1 store appends rows the digest dispatcher reads.
   */
  recordEvents(events: NotifyEvent[], at: Date): Promise<void>;
}
