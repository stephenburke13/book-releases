// Title/author normalization and date-precision parsing.
//
// These helpers are deliberately pure and well-tested — the dedupe and diff
// engines depend on them being stable and deterministic.

import type { DatePrecision, ReleaseDate } from "./models.js";

const LEADING_ARTICLE = /^(the|a|an)\s+/i;
// Trailing series markers like "(Book 3)", "(Stormlight Archive #4)", "Vol. 2".
const TRAILING_SERIES = /[\s,]*(\(|\bvol\.?\b|\bbook\b|#)[^)]*\)?\s*$/i;

/** Strip accents/diacritics via NFKD decomposition. */
function stripAccents(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normalize a title for matching: lowercase, de-accent, drop the subtitle after
 * the first ":" or "(", strip a leading article, drop trailing series markers,
 * and collapse punctuation/whitespace. Used only for matching, never display.
 */
export function normTitle(raw: string): string {
  let s = stripAccents(raw).toLowerCase();
  // Drop subtitle: everything after the first colon.
  const colon = s.indexOf(":");
  if (colon !== -1) s = s.slice(0, colon);
  s = s.replace(TRAILING_SERIES, "");
  s = s.replace(LEADING_ARTICLE, "");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

/** Normalize an author name for matching (lowercase, de-accent, collapse). */
export function normAuthor(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A URL/key-safe slug, e.g. "Brandon Sanderson" -> "brandon-sanderson". */
export function slug(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parse a source date string into a value + precision flag without coercion.
 * Accepts "YYYY", "YYYY-MM", "YYYY-MM-DD" (and tolerates slashes / extra time).
 * Anything unrecognized becomes precision "unknown".
 */
export function parseReleaseDate(raw: string | null | undefined): ReleaseDate {
  if (!raw) return { value: "", precision: "unknown" };
  const s = String(raw).trim().replace(/\//g, "-");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    return { value: `${m[1]}-${m[2]}-${m[3]}`, precision: "day" };
  }
  if ((m = s.match(/^(\d{4})-(\d{2})$/))) {
    return { value: `${m[1]}-${m[2]}`, precision: "month" };
  }
  if ((m = s.match(/^(\d{4})$/))) {
    return { value: m[1]!, precision: "year" };
  }
  return { value: "", precision: "unknown" };
}

const PRECISION_RANK: Record<DatePrecision, number> = {
  unknown: 0,
  year: 1,
  month: 2,
  day: 3,
};

export function precisionRank(p: DatePrecision): number {
  return PRECISION_RANK[p];
}

/**
 * True when `next` is a strict precision refinement of `prev` over the same
 * window (e.g. "2026" -> "2026-12" -> "2026-12-06"), so it should update state
 * silently rather than firing a date-change email.
 */
export function isRefinement(prev: ReleaseDate, next: ReleaseDate): boolean {
  if (precisionRank(next.precision) <= precisionRank(prev.precision)) return false;
  if (prev.precision === "unknown" || !prev.value) return true;
  // The coarser value must be a prefix of the finer one.
  return next.value.startsWith(prev.value);
}

/** Today's calendar date in UTC, as "YYYY-MM-DD". */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Add `days` to a "YYYY-MM-DD" string, returning a "YYYY-MM-DD" string. */
export function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
