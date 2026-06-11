// Core domain types shared across the pipeline.
//
// Two representations of a book exist:
//   - FetchedWork: a clean, source-normalized result fresh from a data source.
//   - Work: the persisted, deduped, work-level record stored in state.json.
// The diff engine compares incoming FetchedWorks against stored Works.

export type SourceName = "hardcover" | "googlebooks";

/** Precision of a release date string. We never coerce partial dates. */
export type DatePrecision = "day" | "month" | "year" | "unknown";

/** A book release date kept as a string plus how precise that string is. */
export interface ReleaseDate {
  /** e.g. "2026-12-06", "2026-11", "2026", or "" when unknown. */
  value: string;
  precision: DatePrecision;
}

/** One source-normalized search result, before cross-source dedupe/merge. */
export interface FetchedWork {
  /** Native, source-stable key, e.g. "hc:book:12345" or "gb:sanderson:title". */
  workKey: string;
  source: SourceName;
  sourceId: string;
  authorKey: string;
  author: string;
  /** Human-facing title (with subtitle). */
  title: string;
  /** Normalized title used for the cross-source index. */
  matchTitle: string;
  release: ReleaseDate;
  /** Lowercase ISO-639-1, best guess; "" if unknown. */
  language: string;
  /** e.g. ["hardcover", "ebook", "audiobook"]. */
  formats: string[];
}

export interface NotifiedFlag {
  sent: boolean;
  run: number | null;
}

export interface DateChangeRecord {
  from: string;
  to: string;
  run: number;
}

export interface NotifiedState {
  announced: NotifiedFlag;
  released: NotifiedFlag;
  date_changes: DateChangeRecord[];
}

export type WorkStatus = "active" | "released" | "retired";

export interface SourceRef {
  id: string;
  last_seen_run: number;
}

/** The persisted, work-level record. One per book, deduped across formats/sources. */
export interface Work {
  work_key: string;
  /** Alternate native keys (e.g. a Google key) that resolve to this work. */
  merged_keys: string[];
  sources: Partial<Record<SourceName, SourceRef>>;
  author_key: string;
  author: string;
  title: string;
  match_title: string;
  release_date: string;
  date_precision: DatePrecision;
  language: string;
  formats: string[];
  first_seen_run: number;
  /** True when introduced via the silent seed path. */
  seeded: boolean;
  status: WorkStatus;
  missing_since_run: number | null;
  notified: NotifiedState;
}

export interface LastRun {
  run: number;
  at: string;
  sources_ok: Partial<Record<SourceName, boolean>>;
}

export interface AuthorSeed {
  /** Which sources have been seeded for this author. */
  sources: SourceName[];
  run: number;
}

export interface State {
  version: number;
  run_counter: number;
  last_run: LastRun | null;
  authors_seeded: Record<string, AuthorSeed>;
  works: Record<string, Work>;
}

export type EventType = "announcement" | "release" | "date_change";

/** A single thing worth emailing about, produced by the diff engine. */
export interface NotifyEvent {
  type: EventType;
  author: string;
  title: string;
  release_date: string;
  date_precision: DatePrecision;
  formats: string[];
  /** For date_change events. */
  previous_release_date?: string;
}
