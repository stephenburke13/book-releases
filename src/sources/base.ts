// The pluggable data-source interface. Adding a new source (ISFDB, ComicVine)
// means writing one file that implements this — the dedupe and diff layers never
// import a concrete source.

import type { AuthorConfig, Settings } from "../config.js";
import type { FetchedWork, SourceName } from "../models.js";

export interface Source {
  readonly name: SourceName;
  /**
   * Whether this source can serve the given author (e.g. Google Books needs a
   * google_query; Hardcover needs an id or a usable name).
   */
  canHandle(author: AuthorConfig): boolean;
  /**
   * Fetch this author's forthcoming/recent works. Implementations own querying,
   * paging, primary-author filtering, edition collapse, junk/language filtering,
   * and emit clean work-level FetchedWorks. May throw SourceUnavailable.
   */
  fetchAuthor(author: AuthorConfig, settings: Settings): Promise<FetchedWork[]>;
}
