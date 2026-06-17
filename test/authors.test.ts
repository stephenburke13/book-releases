import { describe, expect, it } from "vitest";
import { authorKeyForHardcover, slugifyName, toAuthorConfig } from "../lib/authors";

describe("author mapping", () => {
  it("derives a stable key from a Hardcover id", () => {
    expect(authorKeyForHardcover(333)).toBe("hc-333");
  });

  it("slugifies names", () => {
    expect(slugifyName("N. K. Jemisin")).toBe("n-k-jemisin");
    expect(slugifyName("Brandon Sanderson")).toBe("brandon-sanderson");
  });

  it("maps a tracked_authors row to AuthorConfig, omitting empty fields", () => {
    const base = {
      authorKey: "hc-333",
      name: "Brandon Sanderson",
      hardcoverId: 333,
      googleQuery: null,
      primaryAuthorNames: null,
      createdAt: new Date(),
    };
    expect(toAuthorConfig(base)).toEqual({
      author_key: "hc-333",
      name: "Brandon Sanderson",
      hardcover_id: 333,
    });
  });

  it("includes google query and primary names when present", () => {
    const row = {
      authorKey: "hc-1",
      name: "Test",
      hardcoverId: null,
      googleQuery: 'inauthor:"Test"',
      primaryAuthorNames: JSON.stringify(["Test"]),
      createdAt: new Date(),
    };
    expect(toAuthorConfig(row)).toEqual({
      author_key: "hc-1",
      name: "Test",
      google_query: 'inauthor:"Test"',
      primary_author_names: ["Test"],
    });
  });
});
