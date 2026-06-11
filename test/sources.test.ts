import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HardcoverSource } from "../src/sources/hardcover.js";
import { GoogleBooksSource } from "../src/sources/googlebooks.js";
import type { AuthorConfig, Settings } from "../src/config.js";

const settings: Settings = {
  allowed_languages: ["en"],
  release_lead_window_days: 7,
  retire_after_runs: 14,
  enabled_sources: ["hardcover", "googlebooks"],
  email: { provider: "console", from: "f", to: "t" },
  junk_title_patterns: ["study guide", "summary of"],
};

const author: AuthorConfig = {
  author_key: "sanderson",
  name: "Brandon Sanderson",
  hardcover_id: 333,
  google_query: 'inauthor:"Brandon Sanderson"',
  primary_author_names: ["Brandon Sanderson"],
};

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

function mockFetch(body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("HardcoverSource", () => {
  it("collapses editions, drops junk/foreign/no-date records", async () => {
    mockFetch(fixture("hardcover_sanderson.json"));
    const works = await new HardcoverSource("token").fetchAuthor(author, settings);
    expect(works).toHaveLength(1);
    const w = works[0]!;
    expect(w.workKey).toBe("hc:book:1");
    expect(w.title).toBe("Wind and Truth");
    expect(w.release).toEqual({ value: "2026-12-06", precision: "day" });
    expect(w.language).toBe("en");
    expect(w.formats.sort()).toEqual(["audiobook", "ebook", "physical"]);
  });
});

describe("GoogleBooksSource", () => {
  it("filters to primary author, clusters editions, drops junk", async () => {
    mockFetch(fixture("google_sanderson.json"));
    const works = await new GoogleBooksSource("key").fetchAuthor(author, settings);
    expect(works).toHaveLength(1);
    const w = works[0]!;
    expect(w.matchTitle).toBe("wind and truth");
    // g1 (day) preferred over g2 (year); g3 (wrong author) and g4 (secondary) dropped.
    expect(w.release).toEqual({ value: "2026-12-06", precision: "day" });
    expect(w.source).toBe("googlebooks");
  });
});
