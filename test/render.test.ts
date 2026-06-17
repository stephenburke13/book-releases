import { describe, expect, it } from "vitest";
import { formatReleaseDate, renderDigest } from "../src/email/render.js";
import type { NotifyEvent } from "../src/models.js";

describe("formatReleaseDate", () => {
  it("honors precision", () => {
    expect(formatReleaseDate("2026-12-06", "day")).toBe("December 6, 2026");
    expect(formatReleaseDate("2026-12", "month")).toBe("December 2026");
    expect(formatReleaseDate("2026", "year")).toBe("2026");
    expect(formatReleaseDate("", "unknown")).toBe("date TBA");
  });
});

describe("renderDigest", () => {
  const events: NotifyEvent[] = [
    {
      type: "announcement",
      author_key: "sanderson",
      author: "Brandon Sanderson",
      title: "Brand New Book",
      release_date: "2027-03-01",
      date_precision: "day",
      formats: ["hardcover", "ebook"],
    },
    {
      type: "release",
      author_key: "jemisin",
      author: "N. K. Jemisin",
      title: "The Coming One",
      release_date: "2026-06-16",
      date_precision: "day",
      formats: ["audiobook"],
    },
    {
      type: "date_change",
      author_key: "sanderson",
      author: "Brandon Sanderson",
      title: "Slippery Title",
      release_date: "2026-09-15",
      date_precision: "day",
      formats: [],
      previous_release_date: "2026-06-12",
    },
  ];

  it("builds a subject summarizing counts", () => {
    expect(renderDigest(events).subject).toBe(
      "Book releases: 1 new, 1 releasing, 1 date change",
    );
  });

  it("groups events into sections (text)", () => {
    const { text } = renderDigest(events);
    expect(text).toContain("New announcements");
    expect(text).toContain("Releasing soon");
    expect(text).toContain("Date changes");
    expect(text).toContain("Brand New Book — Brandon Sanderson (March 1, 2027) [hardcover, ebook]");
    expect(text).toContain("June 12, 2026 → September 15, 2026");
  });

  it("escapes HTML", () => {
    const { html } = renderDigest([
      {
        type: "announcement",
        author_key: "ab",
        author: "A&B",
        title: "<script>",
        release_date: "2027-01-01",
        date_precision: "day",
        formats: [],
      },
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
