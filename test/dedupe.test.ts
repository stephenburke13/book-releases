import { describe, expect, it } from "vitest";
import { mergeIncoming } from "../src/dedupe.js";
import type { FetchedWork } from "../src/models.js";

function fw(o: Partial<FetchedWork> & { workKey: string; source: FetchedWork["source"] }): FetchedWork {
  return {
    sourceId: o.sourceId ?? "1",
    authorKey: o.authorKey ?? "sanderson",
    author: o.author ?? "Brandon Sanderson",
    title: o.title ?? "Wind and Truth",
    matchTitle: o.matchTitle ?? "wind and truth",
    release: o.release ?? { value: "2026-12-06", precision: "day" },
    language: o.language ?? "en",
    formats: o.formats ?? ["hardcover"],
    ...o,
  };
}

describe("mergeIncoming", () => {
  it("merges a Google result into the matching Hardcover work (Hardcover canonical)", () => {
    const merged = mergeIncoming([
      fw({ workKey: "hc:book:1", source: "hardcover", formats: ["hardcover"] }),
      fw({
        workKey: "gb:sanderson:wind-and-truth",
        source: "googlebooks",
        formats: ["ebook"],
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.workKey).toBe("hc:book:1");
    expect(merged[0]!.mergedKeys).toContain("gb:sanderson:wind-and-truth");
    expect(merged[0]!.sources).toEqual({
      hardcover: { id: "1" },
      googlebooks: { id: "1" },
    });
    expect(merged[0]!.formats.sort()).toEqual(["ebook", "hardcover"]);
  });

  it("processes Hardcover first regardless of input order", () => {
    const merged = mergeIncoming([
      fw({ workKey: "gb:sanderson:wind-and-truth", source: "googlebooks" }),
      fw({ workKey: "hc:book:1", source: "hardcover" }),
    ]);
    expect(merged[0]!.workKey).toBe("hc:book:1");
  });

  it("does not merge works with different authors", () => {
    const merged = mergeIncoming([
      fw({ workKey: "hc:book:1", source: "hardcover", authorKey: "sanderson" }),
      fw({
        workKey: "gb:other:wind-and-truth",
        source: "googlebooks",
        authorKey: "other",
      }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps the more precise release date when merging", () => {
    const merged = mergeIncoming([
      fw({
        workKey: "hc:book:1",
        source: "hardcover",
        release: { value: "2026", precision: "year" },
      }),
      fw({
        workKey: "gb:sanderson:wind-and-truth",
        source: "googlebooks",
        release: { value: "2026-12-06", precision: "day" },
      }),
    ]);
    expect(merged[0]!.release).toEqual({ value: "2026-12-06", precision: "day" });
  });
});
