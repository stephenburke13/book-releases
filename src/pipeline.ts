// Orchestration: load -> fetch all sources per author -> dedupe -> diff ->
// (render -> send for the CLI) -> save.
//
// Two entry points share the fetch/dedupe/diff core:
//   - run():   the single-user CLI. Email send is the commit point — state is
//              only written after a successful send.
//   - track(): the multi-user tracking job. Storage-agnostic via StateStore;
//              records events for later per-subscriber digests instead of
//              emailing inline.

import { loadConfig, type AuthorConfig, type Settings } from "./config.js";
import { mergeIncoming } from "./dedupe.js";
import { runDiff, type AuthorRun } from "./diff.js";
import { todayUtc } from "./normalize.js";
import type { FetchedWork, NotifyEvent, SourceName } from "./models.js";
import { HardcoverSource } from "./sources/hardcover.js";
import { GoogleBooksSource } from "./sources/googlebooks.js";
import type { Source } from "./sources/base.js";
import { ConsoleProvider } from "./email/console.js";
import { ResendProvider } from "./email/resend.js";
import { renderDigest } from "./email/render.js";
import type { EmailProvider } from "./email/base.js";
import { FileStateStore } from "./store/file.js";
import type { StateStore } from "./store/base.js";

/** Source credentials. Defaults to process.env for the CLI; the Worker passes
 * its own bindings (process.env is not the source of truth on Workers). */
export interface SourceEnv {
  HARDCOVER_TOKEN?: string | undefined;
  GOOGLE_BOOKS_API_KEY?: string | undefined;
}

export interface RunOptions {
  dryRun?: boolean;
  onlySource?: SourceName;
  configPath?: string;
  statePath?: string;
  now?: Date;
}

export interface TrackOptions {
  authors: AuthorConfig[];
  settings: Settings;
  store: StateStore;
  env?: SourceEnv;
  onlySource?: SourceName;
  now?: Date;
}

function buildSources(settings: Settings, env: SourceEnv, only?: SourceName): Source[] {
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

function buildEmailProvider(settings: Settings, dryRun: boolean): EmailProvider {
  if (dryRun || settings.email.provider === "console") {
    return new ConsoleProvider(settings.email.to);
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is required to send email (use --dry-run to test).");
  return new ResendProvider(apiKey, settings.email.from, settings.email.to);
}

/** Fetch every applicable source for every author and dedupe per author. */
async function gatherAuthorRuns(
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
  const env = opts.env ?? (process.env as SourceEnv);
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

/** Single-user CLI run: fetch, diff, email, then save (send is the commit point). */
export async function run(opts: RunOptions = {}): Promise<number> {
  const dryRun = opts.dryRun ?? false;
  const config = loadConfig(opts.configPath);
  const store = new FileStateStore(opts.statePath);
  const { settings } = config;

  const sources = buildSources(settings, process.env as SourceEnv, opts.onlySource);
  const sourcesOk: Partial<Record<SourceName, boolean>> = {};
  for (const s of sources) sourcesOk[s.name] = true;

  const state = await store.load();
  const authorRuns = await gatherAuthorRuns(config.authors, sources, settings, sourcesOk);

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

  if (events.length > 0) {
    const digest = renderDigest(events);
    const provider = buildEmailProvider(settings, dryRun);
    await provider.send(digest); // commit point — throws abort the save below
    console.error(`Sent digest via ${provider.name}: ${events.length} event(s).`);
  } else {
    console.error("No new events this run.");
  }

  if (!dryRun) {
    await store.save(nextState);
  } else {
    console.error("[dry-run] state.json not written.");
  }

  return events.length;
}
