// Digest job (cron #2): for each confirmed subscriber, find subscriptions that
// are due per their cadence, gather the events queued for those authors since
// the last digest, send one combined digest, and advance the watermark.

import { and, eq, gt, inArray } from "drizzle-orm";
import { renderDigest } from "../../src/email/render.js";
import type { NotifyEvent } from "../../src/models.js";
import { isDue } from "../cadence";
import { dbFromEnv } from "../db/client";
import { events as eventsTable, subscribers, subscriptions } from "../db/schema";
import { digestEmail } from "../email/messages";
import { sendEmail } from "../email/resend";
import { manageToken } from "../tokens";

function rowToEvent(r: typeof eventsTable.$inferSelect): NotifyEvent {
  return {
    type: r.type,
    author_key: r.authorKey,
    author: r.author,
    title: r.title,
    release_date: r.releaseDate,
    date_precision: r.datePrecision,
    formats: JSON.parse(r.formats) as string[],
    ...(r.previousReleaseDate ? { previous_release_date: r.previousReleaseDate } : {}),
  };
}

export async function dispatchDigests(env: CloudflareEnv, now = new Date()): Promise<number> {
  const db = dbFromEnv(env);
  const baseUrl = env.APP_BASE_URL || "http://localhost:8787";
  const secret = env.SIGNING_SECRET || "";

  const confirmed = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.status, "confirmed"))
    .all();

  let sent = 0;
  for (const sub of confirmed) {
    const subs = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.subscriberId, sub.id), eq(subscriptions.active, true)))
      .all();

    const due = subs.filter((s) => isDue(s, now));
    if (due.length === 0) continue;

    // Gather queued events for each due author since that subscription's watermark.
    const collected: NotifyEvent[] = [];
    for (const s of due) {
      const since = s.lastDigestAt ?? s.createdAt;
      const rows = await db
        .select()
        .from(eventsTable)
        .where(and(eq(eventsTable.authorKey, s.authorKey), gt(eventsTable.detectedAt, since)))
        .all();
      collected.push(...rows.map(rowToEvent));
    }

    if (collected.length > 0) {
      const digest = renderDigest(collected);
      const manageUrl = `${baseUrl}/manage?token=${encodeURIComponent(await manageToken(sub.id, secret))}`;
      await sendEmail(env, digestEmail(sub.email, digest, manageUrl));
      sent++;
    }

    // Advance the cadence window for all due subscriptions (even empty ones).
    await db
      .update(subscriptions)
      .set({ lastDigestAt: now })
      .where(inArray(subscriptions.id, due.map((s) => s.id)))
      .run();
  }

  console.log(`[dispatch] sent ${sent} digest(s).`);
  return sent;
}
