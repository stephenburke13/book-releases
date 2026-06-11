import { describe, expect, it } from "vitest";
import {
  addDays,
  isRefinement,
  normAuthor,
  normTitle,
  parseReleaseDate,
  slug,
} from "../src/normalize.js";

describe("normTitle", () => {
  it("lowercases, strips accents and articles", () => {
    expect(normTitle("The Wind and Truth")).toBe("wind and truth");
    expect(normTitle("Élantris")).toBe("elantris");
  });
  it("drops subtitle after a colon", () => {
    expect(normTitle("Mistborn: The Final Empire")).toBe("mistborn");
  });
  it("drops trailing series markers", () => {
    expect(normTitle("Words of Radiance (The Stormlight Archive #2)")).toBe("words of radiance");
    expect(normTitle("Skyward Vol. 3")).toBe("skyward");
  });
});

describe("normAuthor", () => {
  it("normalizes punctuation and case", () => {
    expect(normAuthor("Brandon  Sanderson")).toBe("brandon sanderson");
    expect(normAuthor("N. K. Jemisin")).toBe("n k jemisin");
  });
});

describe("slug", () => {
  it("produces a key-safe slug", () => {
    expect(slug("Brandon Sanderson")).toBe("brandon-sanderson");
    expect(slug("wind and truth")).toBe("wind-and-truth");
  });
});

describe("parseReleaseDate", () => {
  it("detects precision", () => {
    expect(parseReleaseDate("2026-12-06")).toEqual({ value: "2026-12-06", precision: "day" });
    expect(parseReleaseDate("2026-11")).toEqual({ value: "2026-11", precision: "month" });
    expect(parseReleaseDate("2026")).toEqual({ value: "2026", precision: "year" });
  });
  it("returns unknown for junk/empty", () => {
    expect(parseReleaseDate("")).toEqual({ value: "", precision: "unknown" });
    expect(parseReleaseDate("soon")).toEqual({ value: "", precision: "unknown" });
    expect(parseReleaseDate(null)).toEqual({ value: "", precision: "unknown" });
  });
});

describe("isRefinement", () => {
  it("treats year->day of same window as a refinement", () => {
    expect(
      isRefinement({ value: "2026", precision: "year" }, { value: "2026-12-06", precision: "day" }),
    ).toBe(true);
  });
  it("is not a refinement when the window changes", () => {
    expect(
      isRefinement({ value: "2026", precision: "year" }, { value: "2027-01-01", precision: "day" }),
    ).toBe(false);
  });
  it("is not a refinement for same-precision moves", () => {
    expect(
      isRefinement({ value: "2026-12-06", precision: "day" }, { value: "2027-01-10", precision: "day" }),
    ).toBe(false);
  });
});

describe("addDays", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});
