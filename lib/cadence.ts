// Pure cadence math, isolated so it can be unit-tested without the DB layer.

export const CADENCE_DAYS = { weekly: 7, monthly: 30 } as const;
export type Cadence = keyof typeof CADENCE_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueInput {
  cadence: Cadence;
  /** When the subscription last received a digest, or null if never. */
  lastDigestAt: Date | null;
  /** When the subscription was created (lower bound for the first digest). */
  createdAt: Date;
}

/** A subscription is due when a full cadence interval has elapsed since the
 * last digest (or since it was created, for the first one). */
export function isDue(input: DueInput, now: Date): boolean {
  const base = (input.lastDigestAt ?? input.createdAt).getTime();
  return now.getTime() >= base + CADENCE_DAYS[input.cadence] * DAY_MS;
}
