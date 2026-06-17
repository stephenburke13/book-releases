// Single-user CLI orchestration: load config + state -> fetch -> dedupe -> diff
// -> render -> send -> save. Email send is the commit point: state is only
// written after a successful send, so a send failure is retried on the next run.
//
// The fetch/dedupe/diff core lives in track.ts and is shared with the Cloudflare
// Worker; this file holds the CLI-only concerns (config.yaml, Resend, file state).

import { loadConfig } from "./config.js";
import { runDiff } from "./diff.js";
import { todayUtc } from "./normalize.js";
import type { SourceName } from "./models.js";
import type { Settings } from "./config.js";
import { ConsoleProvider } from "./email/console.js";
import { ResendProvider } from "./email/resend.js";
import { renderDigest } from "./email/render.js";
import type { EmailProvider } from "./email/base.js";
import { FileStateStore } from "./store/file.js";
import { buildSources, gatherAuthorRuns, type SourceEnv } from "./track.js";

export interface RunOptions {
  dryRun?: boolean;
  onlySource?: SourceName;
  configPath?: string;
  statePath?: string;
  now?: Date;
}

function buildEmailProvider(settings: Settings, dryRun: boolean): EmailProvider {
  if (dryRun || settings.email.provider === "console") {
    return new ConsoleProvider(settings.email.to);
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is required to send email (use --dry-run to test).");
  return new ResendProvider(apiKey, settings.email.from, settings.email.to);
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
