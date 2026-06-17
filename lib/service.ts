// Subscription business logic shared by the API routes and server-rendered
// pages. Keeps the route handlers thin and the rules in one place.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "./db/client";
import { subscribers, subscriptions, trackedAuthors } from "./db/schema";
import { confirmToken, manageToken, verifyToken } from "./tokens";
import { sendEmail } from "./email/resend";
import { confirmationEmail, subscribedEmail } from "./email/messages";

export type Cadence = "weekly" | "monthly";

export interface SubscribeInput {
  email: string;
  authorKey: string;
  authorName: string;
  hardcoverId?: number;
  cadence: Cadence;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** Idempotent subscribe: ensure the author is tracked, the subscriber exists,
 * and the subscription is active; then send the right email. */
export async function subscribe(
  env: CloudflareEnv,
  db: DB,
  input: SubscribeInput,
): Promise<{ status: "pending" | "subscribed" }> {
  const email = input.email.trim().toLowerCase();
  const secret = env.SIGNING_SECRET || "";
  const baseUrl = env.APP_BASE_URL || "http://localhost:8787";

  // 1. Ensure the author is tracked (first subscriber adds it; next track run seeds it).
  await db
    .insert(trackedAuthors)
    .values({
      authorKey: input.authorKey,
      name: input.authorName,
      hardcoverId: input.hardcoverId ?? null,
    })
    .onConflictDoNothing();

  // 2. Find or create the subscriber.
  let subscriber = await db.select().from(subscribers).where(eq(subscribers.email, email)).get();
  let isNew = false;
  if (!subscriber) {
    const id = randomUUID();
    await db.insert(subscribers).values({ id, email, status: "pending" });
    subscriber = (await db.select().from(subscribers).where(eq(subscribers.id, id)).get())!;
    isNew = true;
  }

  // 3. Upsert the subscription.
  const existing = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.subscriberId, subscriber.id), eq(subscriptions.authorKey, input.authorKey)))
    .get();
  if (existing) {
    await db
      .update(subscriptions)
      .set({ cadence: input.cadence, active: true })
      .where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values({
      id: randomUUID(),
      subscriberId: subscriber.id,
      authorKey: input.authorKey,
      cadence: input.cadence,
      active: true,
    });
  }

  // 4. Email: confirm (double opt-in) if still pending, else a friendly notice.
  if (subscriber.status !== "confirmed") {
    const token = await confirmToken(subscriber.id, secret);
    const confirmUrl = `${baseUrl}/confirm?token=${encodeURIComponent(token)}`;
    await sendEmail(env, confirmationEmail(email, input.authorName, confirmUrl));
    return { status: "pending" };
  }
  const mUrl = `${baseUrl}/manage?token=${encodeURIComponent(await manageToken(subscriber.id, secret))}`;
  await sendEmail(env, subscribedEmail(email, input.authorName, input.cadence, mUrl));
  void isNew;
  return { status: "subscribed" };
}

/** Confirm a subscriber from a confirm token. Returns the subscriber email. */
export async function confirmSubscriber(
  env: CloudflareEnv,
  db: DB,
  token: string,
): Promise<{ email: string } | null> {
  const payload = await verifyToken(token, env.SIGNING_SECRET || "", "confirm");
  if (!payload) return null;
  const subscriber = await db.select().from(subscribers).where(eq(subscribers.id, payload.sub)).get();
  if (!subscriber) return null;
  if (subscriber.status !== "confirmed") {
    await db
      .update(subscribers)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(subscribers.id, subscriber.id));
  }
  return { email: subscriber.email };
}

export interface ManageView {
  subscriberId: string;
  email: string;
  subscriptions: {
    id: string;
    authorKey: string;
    authorName: string;
    cadence: Cadence;
    active: boolean;
  }[];
}

/** Resolve a manage token into the subscriber's current preferences. */
export async function getManageView(
  env: CloudflareEnv,
  db: DB,
  token: string,
): Promise<ManageView | null> {
  const payload = await verifyToken(token, env.SIGNING_SECRET || "", "manage");
  if (!payload) return null;
  const subscriber = await db.select().from(subscribers).where(eq(subscribers.id, payload.sub)).get();
  if (!subscriber) return null;

  const rows = await db
    .select({
      id: subscriptions.id,
      authorKey: subscriptions.authorKey,
      cadence: subscriptions.cadence,
      active: subscriptions.active,
      authorName: trackedAuthors.name,
    })
    .from(subscriptions)
    .innerJoin(trackedAuthors, eq(subscriptions.authorKey, trackedAuthors.authorKey))
    .where(eq(subscriptions.subscriberId, subscriber.id))
    .all();

  return {
    subscriberId: subscriber.id,
    email: subscriber.email,
    subscriptions: rows.map((r) => ({
      id: r.id,
      authorKey: r.authorKey,
      authorName: r.authorName,
      cadence: r.cadence,
      active: r.active,
    })),
  };
}

export type ManageAction =
  | { action: "set_cadence"; subscriptionId: string; cadence: Cadence }
  | { action: "unsubscribe"; subscriptionId: string }
  | { action: "unsubscribe_all" };

/** Apply a preference change authorized by a manage token. */
export async function applyManageAction(
  env: CloudflareEnv,
  db: DB,
  token: string,
  action: ManageAction,
): Promise<boolean> {
  const payload = await verifyToken(token, env.SIGNING_SECRET || "", "manage");
  if (!payload) return false;
  const subscriberId = payload.sub;

  if (action.action === "unsubscribe_all") {
    await db
      .update(subscriptions)
      .set({ active: false })
      .where(eq(subscriptions.subscriberId, subscriberId));
    await db.update(subscribers).set({ status: "unsubscribed" }).where(eq(subscribers.id, subscriberId));
    return true;
  }

  // Scope the change to the token's subscriber so a token can't touch others' rows.
  const owned = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, action.subscriptionId), eq(subscriptions.subscriberId, subscriberId)))
    .get();
  if (!owned) return false;

  if (action.action === "set_cadence") {
    await db.update(subscriptions).set({ cadence: action.cadence }).where(eq(subscriptions.id, owned.id));
  } else {
    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.id, owned.id));
  }
  return true;
}
