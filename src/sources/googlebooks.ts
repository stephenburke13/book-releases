// Google Books source (secondary cross-check). REST volumes endpoint.
//
// Google has no canonical author/book id, so we: filter to volumes where the
// followed author is the PRIMARY author, cluster the remaining volumes (editions)
// to the work level by normalized (author, title), and key each work by slug.

import type { AuthorConfig, Settings } from "../config.js";
import type { FetchedWork } from "../models.js";
import { fetchWithRetry } from "../http.js";
import { applyFilters } from "../filters.js";
import { normAuthor, normTitle, parseReleaseDate, slug } from "../normalize.js";
import type { Source } from "./base.js";

const ENDPOINT = "https://www.googleapis.com/books/v1/volumes";

const PRINT_TYPE_FORMAT: Record<string, string> = {
  BOOK: "book",
  MAGAZINE: "magazine",
};

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    language?: string;
    printType?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
  };
}

/** True if the followed author is the primary (first-listed) author. */
function isPrimaryAuthor(volume: GoogleVolume, author: AuthorConfig): boolean {
  const authors = volume.volumeInfo?.authors ?? [];
  if (authors.length === 0) return false;
  const primary = normAuthor(authors[0]!);
  const names = author.primary_author_names?.length
    ? author.primary_author_names
    : [author.name];
  return names.some((n) => normAuthor(n) === primary);
}

export class GoogleBooksSource implements Source {
  readonly name = "googlebooks" as const;
  constructor(private readonly apiKey: string | undefined) {}

  canHandle(author: AuthorConfig): boolean {
    return !!(author.google_query || author.name);
  }

  async fetchAuthor(author: AuthorConfig, settings: Settings): Promise<FetchedWork[]> {
    const query = author.google_query ?? `inauthor:"${author.name}"`;
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("orderBy", "newest");
    url.searchParams.set("maxResults", "40");
    url.searchParams.set("printType", "books");
    if (this.apiKey) url.searchParams.set("key", this.apiKey);

    const res = await fetchWithRetry(url.toString(), {}, { throttleKey: "googlebooks" });
    const json = (await res.json()) as { items?: GoogleVolume[] };
    const volumes = (json.items ?? []).filter((v) => isPrimaryAuthor(v, author));

    // Cluster editions to the work level by (author, normalized title). Within a
    // cluster, keep the representative with the most precise date.
    const clusters = new Map<string, FetchedWork>();
    for (const v of volumes) {
      const info = v.volumeInfo!;
      const title = info.title ?? "";
      if (!title) continue;
      const matchTitle = normTitle(title);
      const key = `gb:${slug(author.name)}:${slug(matchTitle)}`;
      const release = parseReleaseDate(info.publishedDate);
      const language = (info.language ?? "").toLowerCase();
      const formats = info.printType ? [PRINT_TYPE_FORMAT[info.printType] ?? "book"] : [];

      const candidate: FetchedWork = {
        workKey: key,
        source: "googlebooks",
        sourceId: v.id,
        authorKey: author.author_key,
        author: author.name,
        title,
        matchTitle,
        release,
        language,
        formats,
      };

      const existing = clusters.get(key);
      if (!existing) {
        clusters.set(key, candidate);
      } else {
        // Merge formats; keep the more precise release date.
        existing.formats = [...new Set([...existing.formats, ...candidate.formats])];
        const rank = { unknown: 0, year: 1, month: 2, day: 3 } as const;
        if (rank[candidate.release.precision] > rank[existing.release.precision]) {
          existing.release = candidate.release;
        }
      }
    }

    return applyFilters([...clusters.values()], settings);
  }
}
