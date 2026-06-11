// Cross-source, work-level dedupe. Each source already collapses its own
// editions; this merges the SAME book reported by different sources into one
// record so you get one notification per book, not one per source.
//
// Hardcover is canonical: when a Google result matches a Hardcover result, they
// merge under the Hardcover work key and the Google native key is remembered in
// `mergedKeys`.

import type { FetchedWork, ReleaseDate, SourceName } from "./models.js";
import { precisionRank } from "./normalize.js";

export interface MergedWork {
  /** Canonical key (Hardcover's if present). */
  workKey: string;
  /** Other native keys (e.g. a Google key) that resolve to this work. */
  mergedKeys: string[];
  sources: Partial<Record<SourceName, { id: string }>>;
  authorKey: string;
  author: string;
  title: string;
  matchTitle: string;
  release: ReleaseDate;
  language: string;
  formats: string[];
}

// Process sources in this order so the first occurrence is canonical.
const SOURCE_ORDER: SourceName[] = ["hardcover", "googlebooks"];

function rankSource(s: SourceName): number {
  const i = SOURCE_ORDER.indexOf(s);
  return i === -1 ? SOURCE_ORDER.length : i;
}

function fromFetched(w: FetchedWork): MergedWork {
  return {
    workKey: w.workKey,
    mergedKeys: [],
    sources: { [w.source]: { id: w.sourceId } },
    authorKey: w.authorKey,
    author: w.author,
    title: w.title,
    matchTitle: w.matchTitle,
    release: w.release,
    language: w.language,
    formats: [...w.formats],
  };
}

function mergeInto(target: MergedWork, w: FetchedWork): void {
  // Remember the incoming native key.
  if (w.workKey !== target.workKey && !target.mergedKeys.includes(w.workKey)) {
    target.mergedKeys.push(w.workKey);
  }
  target.sources[w.source] = { id: w.sourceId };
  target.formats = [...new Set([...target.formats, ...w.formats])];
  // Prefer a more precise release date; ties keep the canonical (earlier) source.
  if (precisionRank(w.release.precision) > precisionRank(target.release.precision)) {
    target.release = w.release;
  }
  if (!target.language && w.language) target.language = w.language;
}

/**
 * Merge a single author's FetchedWorks (from one or more sources) into deduped
 * work-level records. Matches across sources by (authorKey, matchTitle).
 */
export function mergeIncoming(works: FetchedWork[]): MergedWork[] {
  const ordered = [...works].sort((a, b) => rankSource(a.source) - rankSource(b.source));
  const index = new Map<string, MergedWork>();
  const result: MergedWork[] = [];

  for (const w of ordered) {
    const indexKey = `${w.authorKey}::${w.matchTitle}`;
    const existing = index.get(indexKey);
    if (existing) {
      mergeInto(existing, w);
    } else {
      const merged = fromFetched(w);
      index.set(indexKey, merged);
      result.push(merged);
    }
  }
  return result;
}
