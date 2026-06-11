// Orchestration: load -> fetch all sources per author -> dedupe -> diff ->
// render -> send -> save. Email send is the commit point: state is only written
// after a successful send, so a send failure is retried on the next run.

import { loadConfig, type Settings } from "./config.js";
import { loadState, saveState } from "./state.js";
import { mergeIncoming } from "./dedupe.js";
import { runDiff, type AuthorRun } from "./diff.js";
import { todayUtc } from "./normalize.js";
import type { FetchedWork, SourceName } from "./models.js";
import { HardcoverSource } from "./sources/hardcover.js";
import { GoogleBooksSource } from "./sources/googlebooks.js";
import type { Source } from "./sources/base.js";
import { ConsoleProvider } from "./email/console.js";
import { ResendProvider } from "./email/resend.js";
import { renderDigest } from "./email/render.js";
import type { EmailProvider } from "./email/base.js";

export interface RunOptions {
  dryRun?: boolean;
  onlySource?: SourceName;
  configPath?: string;
  statePath?: string;
  now?: Date;
}

function buildSources(settings: Settings, only?: SourceName): Source[] {
  const sources: Source[] = [];
  for (const name of settings.enabled_sources) {
    if (only && name !== only) continue;
    if (name === "hardcover") {
      const token = process.env.HARDCOVER_TOKEN;
      if (!token) {
        console.warn("[hardcover] HARDCOVER_TOKEN not set — skipping source.");
        continue;
      }
      sources.push(new HardcoverSource(token));
    } else if (name === "googlebooks") {
      sources.push(new GoogleBooksSource(process.env.GOOGLE_BOOKS_API_KEY));
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

export async function run(opts: RunOptions = {}): Promise<number> {
  const dryRun = opts.dryRun ?? false;
  const config = loadConfig(opts.configPath);
  const state = loadState(opts.statePath);
  const { settings } = config;

  const sources = buildSources(settings, opts.onlySource);
  const sourcesOk: Partial<Record<SourceName, boolean>> = {};
  for (const s of sources) sourcesOk[s.name] = true;

  const authorRuns: AuthorRun[] = [];
  for (const author of config.authors) {
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
    saveState(nextState, opts.statePath);
  } else {
    console.error("[dry-run] state.json not written.");
  }

  return events.length;
}
