// Hardcover source (primary). GraphQL API at https://api.hardcover.app/v1/graphql.
//
// Hardcover groups editions under a single book id, which is exactly the
// work-level identity we want: we query books by canonical author id and collapse
// each book's editions into one FetchedWork (formats = union, language = best).

import type { AuthorConfig, Settings } from "../config.js";
import type { FetchedWork } from "../models.js";
import { fetchWithRetry } from "../http.js";
import { applyFilters } from "../filters.js";
import { normTitle, parseReleaseDate } from "../normalize.js";
import type { Source } from "./base.js";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
// Stay well under the 60 req/min cap.
const MIN_INTERVAL_MS = 1100;

// reading_format_id enum used by Hardcover editions.
const READING_FORMAT: Record<number, string> = {
  1: "physical",
  2: "audiobook",
  4: "ebook",
};

const QUERY = /* GraphQL */ `
  query AuthorBooks($authorId: Int!, $limit: Int!) {
    books(
      where: { contributions: { author_id: { _eq: $authorId } } }
      order_by: { release_date: desc_nulls_last }
      limit: $limit
    ) {
      id
      slug
      title
      release_date
      contributions {
        author {
          id
          name
        }
      }
      editions {
        id
        isbn_13
        reading_format_id
        edition_format
        physical_format
        language {
          code2
        }
      }
    }
  }
`;

interface HardcoverEdition {
  reading_format_id?: number | null;
  edition_format?: string | null;
  physical_format?: string | null;
  language?: { code2?: string | null } | null;
}

interface HardcoverBook {
  id: number;
  slug?: string | null;
  title: string;
  release_date?: string | null;
  contributions?: { author?: { id?: number | null; name?: string | null } | null }[] | null;
  editions?: HardcoverEdition[] | null;
}

function editionFormat(e: HardcoverEdition): string | null {
  if (e.reading_format_id && READING_FORMAT[e.reading_format_id]) {
    return READING_FORMAT[e.reading_format_id]!;
  }
  const text = (e.edition_format || e.physical_format || "").toLowerCase().trim();
  return text || null;
}

function toFetchedWork(book: HardcoverBook, author: AuthorConfig): FetchedWork {
  const editions = book.editions ?? [];
  const formats = [...new Set(editions.map(editionFormat).filter((f): f is string => !!f))];
  const languages = [
    ...new Set(
      editions
        .map((e) => e.language?.code2?.toLowerCase())
        .filter((l): l is string => !!l),
    ),
  ];
  // Prefer English if present, else the first known language, else unknown.
  const language = languages.includes("en") ? "en" : (languages[0] ?? "");

  return {
    workKey: `hc:book:${book.id}`,
    source: "hardcover",
    sourceId: String(book.id),
    authorKey: author.author_key,
    author: author.name,
    title: book.title,
    matchTitle: normTitle(book.title),
    release: parseReleaseDate(book.release_date),
    language,
    formats,
  };
}

export class HardcoverSource implements Source {
  readonly name = "hardcover" as const;
  constructor(private readonly token: string) {}

  canHandle(author: AuthorConfig): boolean {
    return author.hardcover_id !== undefined;
  }

  async fetchAuthor(author: AuthorConfig, settings: Settings): Promise<FetchedWork[]> {
    if (author.hardcover_id === undefined) return [];
    const res = await fetchWithRetry(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          query: QUERY,
          variables: { authorId: author.hardcover_id, limit: 100 },
        }),
      },
      { minIntervalMs: MIN_INTERVAL_MS, throttleKey: "hardcover" },
    );
    const json = (await res.json()) as { data?: { books?: HardcoverBook[] }; errors?: unknown };
    if (json.errors) {
      throw new Error(`Hardcover GraphQL error: ${JSON.stringify(json.errors)}`);
    }
    const books = json.data?.books ?? [];
    const works = books.map((b) => toFetchedWork(b, author));
    return applyFilters(works, settings);
  }
}
