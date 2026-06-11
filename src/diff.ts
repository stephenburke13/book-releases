// The diff engine: given the prior state and this run's deduped works, decide
// exactly which events to email about and produce the next state. This is the
// heart of the idempotency guarantee — every notification is gated on a flag
// that flips false->true exactly once.

import type { Settings } from "./config.js";
import type {
  NotifyEvent,
  ReleaseDate,
  SourceName,
  State,
  Work,
} from "./models.js";
import type { MergedWork } from "./dedupe.js";
import { addDays, isRefinement, precisionRank } from "./normalize.js";

/** One author's deduped results for this run, plus which sources succeeded. */
export interface AuthorRun {
  authorKey: string;
  author: string;
  works: MergedWork[];
  okSources: SourceName[];
}

export interface DiffInput {
  state: State;
  authors: AuthorRun[];
  settings: Settings;
  /** The run number for THIS run (state.run_counter + 1). */
  runCounter: number;
  /** Today as "YYYY-MM-DD" (UTC). */
  today: string;
  sourcesOk: Partial<Record<SourceName, boolean>>;
  now?: Date;
}

export interface DiffResult {
  events: NotifyEvent[];
  nextState: State;
}

function newWorkRecord(mw: MergedWork, runCounter: number): Work {
  const sources: Work["sources"] = {};
  for (const [src, ref] of Object.entries(mw.sources)) {
    sources[src as SourceName] = { id: ref!.id, last_seen_run: runCounter };
  }
  return {
    work_key: mw.workKey,
    merged_keys: [...mw.mergedKeys],
    sources,
    author_key: mw.authorKey,
    author: mw.author,
    title: mw.title,
    match_title: mw.matchTitle,
    release_date: mw.release.value,
    date_precision: mw.release.precision,
    language: mw.language,
    formats: [...mw.formats],
    first_seen_run: runCounter,
    seeded: false,
    status: "active",
    missing_since_run: null,
    notified: {
      announced: { sent: false, run: null },
      released: { sent: false, run: null },
      date_changes: [],
    },
  };
}

function eventFromWork(
  work: Work,
  type: NotifyEvent["type"],
  previous?: string,
): NotifyEvent {
  return {
    type,
    author: work.author,
    title: work.title,
    release_date: work.release_date,
    date_precision: work.date_precision,
    formats: work.formats,
    ...(previous !== undefined ? { previous_release_date: previous } : {}),
  };
}

export function runDiff(input: DiffInput): DiffResult {
  const { settings, runCounter, today } = input;
  const nextState: State = structuredClone(input.state);
  const events: NotifyEvent[] = [];

  // Lookup structures over prior works.
  const byKey = new Map<string, Work>();
  const byIndex = new Map<string, Work>();
  const registerLookups = (w: Work) => {
    byKey.set(w.work_key, w);
    for (const k of w.merged_keys) byKey.set(k, w);
    byIndex.set(`${w.author_key}::${w.match_title}`, w);
  };
  for (const w of Object.values(nextState.works)) registerLookups(w);

  const okSourcesByAuthor = new Map<string, SourceName[]>();
  const processedAuthors = new Set<string>();
  const seenKeys = new Set<string>();

  for (const run of input.authors) {
    processedAuthors.add(run.authorKey);
    okSourcesByAuthor.set(run.authorKey, run.okSources);
    const seededSources = nextState.authors_seeded[run.authorKey]?.sources ?? [];

    for (const mw of run.works) {
      const match = resolveMatch(mw, byKey, byIndex);
      if (!match) {
        const work = newWorkRecord(mw, runCounter);
        const backedBySeededSource = (Object.keys(mw.sources) as SourceName[]).some((s) =>
          seededSources.includes(s),
        );

        if (backedBySeededSource) {
          // Genuine new announcement.
          work.notified.announced = { sent: true, run: runCounter };
          // Suppress a stale release for an already-past title.
          if (isPastRelease(work, today)) {
            work.notified.released = { sent: true, run: runCounter };
          } else {
            events.push(eventFromWork(work, "announcement"));
          }
        } else {
          // Seed path: absorb silently.
          work.seeded = true;
          work.notified.announced = { sent: true, run: runCounter };
          if (isPastRelease(work, today)) {
            work.notified.released = { sent: true, run: runCounter };
          }
        }

        nextState.works[work.work_key] = work;
        registerLookups(work);
        seenKeys.add(work.work_key);
      } else {
        updateExisting(match, mw, runCounter, today, events);
        seenKeys.add(match.work_key);
      }
    }

    // Mark sources that succeeded this run as seeded for this author.
    const prevSeed = nextState.authors_seeded[run.authorKey];
    const seededSet = new Set<SourceName>([...(prevSeed?.sources ?? []), ...run.okSources]);
    nextState.authors_seeded[run.authorKey] = {
      sources: [...seededSet],
      run: runCounter,
    };
  }

  // Release evaluation over all active works of processed authors. Independent of
  // whether the work appeared in today's fetch (so a source outage on release day
  // doesn't make us miss it — we fire up to lead_days early).
  const upper = addDays(today, settings.release_lead_window_days);
  for (const work of Object.values(nextState.works)) {
    if (!processedAuthors.has(work.author_key)) continue;
    if (work.status !== "active") continue;
    if (work.notified.released.sent) continue;
    if (work.first_seen_run === runCounter) continue; // announced/seeded this run; release next run
    if (work.date_precision !== "day" || !work.release_date) continue;
    if (work.release_date >= today && work.release_date <= upper) {
      work.notified.released = { sent: true, run: runCounter };
      work.status = "released";
      events.push(eventFromWork(work, "release"));
    }
  }

  // Disappearance handling for works not seen this run.
  for (const work of Object.values(nextState.works)) {
    if (!processedAuthors.has(work.author_key)) continue;
    if (work.status === "retired") continue;
    if (seenKeys.has(work.work_key)) continue;

    const backing = Object.keys(work.sources) as SourceName[];
    const okSources = okSourcesByAuthor.get(work.author_key) ?? [];
    // If any source that carries this work was unhealthy, treat as transient.
    if (backing.some((s) => !okSources.includes(s))) continue;

    if (work.missing_since_run === null) work.missing_since_run = runCounter;
    // Inclusive count: missing for `retire_after_runs` consecutive runs -> retire.
    if (runCounter - work.missing_since_run + 1 >= settings.retire_after_runs) {
      work.status = "retired";
    }
  }

  nextState.run_counter = runCounter;
  nextState.last_run = {
    run: runCounter,
    at: (input.now ?? new Date()).toISOString(),
    sources_ok: input.sourcesOk,
  };

  return { events, nextState };
}

function resolveMatch(
  mw: MergedWork,
  byKey: Map<string, Work>,
  byIndex: Map<string, Work>,
): Work | undefined {
  const direct = byKey.get(mw.workKey);
  if (direct) return direct;
  for (const k of mw.mergedKeys) {
    const m = byKey.get(k);
    if (m) return m;
  }
  return byIndex.get(`${mw.authorKey}::${mw.matchTitle}`);
}

function isPastRelease(work: Work, today: string): boolean {
  return work.date_precision === "day" && !!work.release_date && work.release_date < today;
}

function updateExisting(
  work: Work,
  mw: MergedWork,
  runCounter: number,
  today: string,
  events: NotifyEvent[],
): void {
  // Refresh provenance and metadata.
  for (const [src, ref] of Object.entries(mw.sources)) {
    work.sources[src as SourceName] = { id: ref!.id, last_seen_run: runCounter };
  }
  for (const k of mw.mergedKeys) {
    if (k !== work.work_key && !work.merged_keys.includes(k)) work.merged_keys.push(k);
  }
  work.title = mw.title;
  work.formats = [...new Set([...work.formats, ...mw.formats])];
  if (!work.language && mw.language) work.language = mw.language;
  work.missing_since_run = null;
  if (work.status === "retired") work.status = "active";

  const prev: ReleaseDate = { value: work.release_date, precision: work.date_precision };
  const next = mw.release;
  if (next.precision === "unknown" || !next.value) return;
  if (next.value === prev.value && next.precision === prev.precision) return;

  if (isRefinement(prev, next) || precisionRank(next.precision) < precisionRank(prev.precision)) {
    // Refinement or precision loss: update silently.
    work.release_date = next.value;
    work.date_precision = next.precision;
    return;
  }

  // Genuine date change.
  const last = work.notified.date_changes.at(-1);
  const dup = last && last.from === prev.value && last.to === next.value;
  work.release_date = next.value;
  work.date_precision = next.precision;
  if (!dup) {
    work.notified.date_changes.push({ from: prev.value, to: next.value, run: runCounter });
    events.push(eventFromWork(work, "date_change", prev.value));
    // A push to a future date makes a previously-"released" book eligible again.
    if (work.notified.released.sent && next.precision === "day" && next.value > today) {
      work.notified.released = { sent: false, run: null };
      work.status = "active";
    }
  }
}
