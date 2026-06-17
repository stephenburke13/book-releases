// Storage-agnostic tracking core, shared by the CLI and the Cloudflare Worker.
//
// This module deliberately imports only Workers-safe code (fetch-based sources,
// pure dedupe/diff/normalize, type-only config). The CLI-only concerns —
// reading config.yaml, the Resend SDK, the file-backed state store — live in
// pipeline.ts so they never end up in the Worker bundle.

import type { AuthorConfig, Settings } from "./config.js";
import { mergeIncoming } from "./dedupe.js";
import { runDiff, type AuthorRun } from "./diff.js";
import { todayUtc } from "./normalize.js";
import type { FetchedWork, NotifyEvent, SourceName } from "./models.js";
import { HardcoverSource } from "./sources/hardcover.js";
import { GoogleBooksSource } from "./sources/googlebooks.js";
import type { Source } from "./sources/base.js";
import type { StateStore } from "./store/base.js";

/** Source credentials. Defaults to process.env for the CLI; the Worker passes
 * its own bindings (process.env is not the source of truth on Workers). */
export interface SourceEnv {
  HARDCOVER_TOKEN?: string | undefined;
  GOOGLE_BOOKS_API_KEY?: string | undefined;
}

export interface TrackOptions {
  authors: AuthorConfig[];
  settings: Settings;
  store: StateStore;
  env?: SourceEnv;
  onlySource?: SourceName;
  now?: Date;
}

export function buildSources(settings: Settings, env: SourceEnv, only?: SourceName): Source[] {
  const sources: Source[] = [];
  for (const name of settings.enabled_sources) {
    if (only && name !== only) continue;
    if (name === "hardcover") {
      const token = env.HARDCOVER_TOKEN;
      if (!token) {
        console.warn("[hardcover] HARDCOVER_TOKEN not set — skipping source.");
        continue;
      }
      sources.push(new HardcoverSource(token));
    } else if (name === "googlebooks") {
      sources.push(new GoogleBooksSource(env.GOOGLE_BOOKS_API_KEY));
    }
  }
  return sources;
}

/** Fetch every applicable source for every author and dedupe per author. */
export async function gatherAuthorRuns(
  authors: AuthorConfig[],
  sources: Source[],
  settings: Settings,
  sourcesOk: Partial<Record<SourceName, boolean>>,
): Promise<AuthorRun[]> {
  const authorRuns: AuthorRun[] = [];
  for (const author of authors) {
    const fetched: FetchedWork[] = [];
    const okSources: SourceName[] = [];
    for (const source of sources) {
      if (!source.canHandle(author)) continue;
      try {
        const works = await source.fetchAuthor(author, settings);
        fetched.push(...works);
        okSources.push(source.name);
        console.error(`[${source.name}] ${author.author_key}: ${works.length} works`);
      } catch (err) {
        sourcesOk[source.name] = false;
        console.error(`[${source.name}] ${author.author_key} FAILED: ${String(err)}`);
      }
    }
    authorRuns.push({
      authorKey: author.author_key,
      author: author.name,
      works: mergeIncoming(fetched),
      okSources,
    });
  }
  return authorRuns;
}

/**
 * Multi-user tracking run. Runs the fetch/dedupe/diff core over the given
 * authors against the store's State, persists the next State, and records the
 * run's events for later per-subscriber digests. No email is sent here.
 */
export async function track(opts: TrackOptions): Promise<NotifyEvent[]> {
  const { authors, settings, store } = opts;
  const env = opts.env ?? ({} as SourceEnv);
  const sources = buildSources(settings, env, opts.onlySource);
  const sourcesOk: Partial<Record<SourceName, boolean>> = {};
  for (const s of sources) sourcesOk[s.name] = true;

  const state = await store.load();
  const authorRuns = await gatherAuthorRuns(authors, sources, settings, sourcesOk);

  const now = opts.now ?? new Date();
  const { events, nextState } = runDiff({
    state,
    authors: authorRuns,
    settings,
    runCounter: state.run_counter + 1,
    today: todayUtc(now),
    sourcesOk,
    now,
  });

  await store.save(nextState);
  await store.recordEvents(events, now);
  return events;
}
