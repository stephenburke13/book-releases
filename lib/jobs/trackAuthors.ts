// Tracking job (cron #1): run the fetch/dedupe/diff core over every author that
// has at least one active subscription, persisting state to D1 and queuing the
// run's events for the digest dispatcher. Sends no email.

import { inArray } from "drizzle-orm";
import { track } from "../../src/track.js";
import { dbFromEnv } from "../db/client";
import { subscriptions, trackedAuthors } from "../db/schema";
import { toAuthorConfig } from "../authors";
import { D1StateStore } from "../store-d1";
import { TRACKING_SETTINGS } from "../settings";

export async function trackAuthors(env: CloudflareEnv): Promise<number> {
  const db = dbFromEnv(env);

  // Authors with at least one active subscription.
  const activeRows = await db
    .selectDistinct({ authorKey: subscriptions.authorKey })
    .from(subscriptions)
    .where(inArray(subscriptions.active, [true]))
    .all();
  const activeKeys = activeRows.map((r) => r.authorKey);
  if (activeKeys.length === 0) {
    console.log("[track] no active subscriptions; nothing to track.");
    return 0;
  }

  const authorRows = await db
    .select()
    .from(trackedAuthors)
    .where(inArray(trackedAuthors.authorKey, activeKeys))
    .all();
  const authors = authorRows.map(toAuthorConfig);

  const store = new D1StateStore(db);
  const events = await track({
    authors,
    settings: TRACKING_SETTINGS,
    store,
    env: {
      HARDCOVER_TOKEN: env.HARDCOVER_TOKEN,
      GOOGLE_BOOKS_API_KEY: env.GOOGLE_BOOKS_API_KEY,
    },
  });

  console.log(`[track] ${authors.length} author(s), ${events.length} event(s) recorded.`);
  return events.length;
}
