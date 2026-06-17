// Author search for the website, backed by Hardcover's GraphQL API. Results are
// cached in D1 for a day so a public search box can't blow Hardcover's ~60
// req/min cap. Returns the canonical hardcover_id the tracking pipeline keys on.

import { eq } from "drizzle-orm";
import { fetchWithRetry } from "../src/http.js";
import { authorKeyForHardcover } from "./authors";
import type { DB } from "./db/client";
import { authorSearchCache } from "./db/schema";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface AuthorResult {
  authorKey: string;
  name: string;
  hardcoverId: number;
  booksCount: number;
}

const QUERY = /* GraphQL */ `
  query SearchAuthors($q: String!, $limit: Int!) {
    authors(
      where: { name: { _ilike: $q } }
      order_by: { books_count: desc_nulls_last }
      limit: $limit
    ) {
      id
      name
      books_count
    }
  }
`;

interface HardcoverAuthor {
  id: number;
  name: string;
  books_count?: number | null;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

async function queryHardcover(token: string, q: string): Promise<AuthorResult[]> {
  const res = await fetchWithRetry(
    ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERY, variables: { q: `%${q}%`, limit: 10 } }),
    },
    { minIntervalMs: MIN_INTERVAL_MS, throttleKey: "hardcover" },
  );
  const json = (await res.json()) as { data?: { authors?: HardcoverAuthor[] }; errors?: unknown };
  if (json.errors) throw new Error(`Hardcover GraphQL error: ${JSON.stringify(json.errors)}`);
  return (json.data?.authors ?? []).map((a) => ({
    authorKey: authorKeyForHardcover(a.id),
    name: a.name,
    hardcoverId: a.id,
    booksCount: a.books_count ?? 0,
  }));
}

export async function searchAuthors(
  db: DB,
  token: string | undefined,
  rawQuery: string,
): Promise<AuthorResult[]> {
  const q = normalizeQuery(rawQuery);
  if (q.length < 2) return [];

  const cached = await db
    .select()
    .from(authorSearchCache)
    .where(eq(authorSearchCache.query, q))
    .get();
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return JSON.parse(cached.results) as AuthorResult[];
  }

  if (!token) throw new Error("HARDCOVER_TOKEN not configured");
  const results = await queryHardcover(token, q);

  await db
    .insert(authorSearchCache)
    .values({ query: q, results: JSON.stringify(results), fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: authorSearchCache.query,
      set: { results: JSON.stringify(results), fetchedAt: new Date() },
    });

  return results;
}
