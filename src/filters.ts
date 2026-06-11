// Junk/language/date filters shared by sources. Centralized so every source
// applies the same rules and tests can exercise them directly.

import type { Settings } from "./config.js";
import type { FetchedWork } from "./models.js";

/** True if the title looks like a study guide / box set / other noise. */
export function isJunkTitle(title: string, patterns: string[]): boolean {
  const lower = title.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * True if the work is in an allowed language. Empty/unknown language passes
 * (we don't want to drop a real title just because language metadata is missing);
 * a known language not in the allow-list is dropped.
 */
export function languageAllowed(language: string, allowed: string[]): boolean {
  if (!language) return true;
  return allowed.map((l) => l.toLowerCase()).includes(language.toLowerCase());
}

/** Apply junk + language + plausible-date filters. Returns kept works. */
export function applyFilters(works: FetchedWork[], settings: Settings): FetchedWork[] {
  return works.filter((w) => {
    if (isJunkTitle(w.title, settings.junk_title_patterns)) return false;
    if (!languageAllowed(w.language, settings.allowed_languages)) return false;
    // Require a plausible release date — unknown precision means no usable date.
    if (w.release.precision === "unknown") return false;
    return true;
  });
}
