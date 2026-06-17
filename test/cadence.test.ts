import { describe, expect, it } from "vitest";
import { isDue } from "../lib/cadence";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-17T12:00:00Z");

describe("isDue", () => {
  it("weekly: not due until 7 days after creation", () => {
    const createdAt = new Date(now.getTime() - 6 * DAY);
    expect(isDue({ cadence: "weekly", lastDigestAt: null, createdAt }, now)).toBe(false);
  });

  it("weekly: due at 7 days after creation", () => {
    const createdAt = new Date(now.getTime() - 7 * DAY);
    expect(isDue({ cadence: "weekly", lastDigestAt: null, createdAt }, now)).toBe(true);
  });

  it("weekly: measures from last digest when present", () => {
    const createdAt = new Date(now.getTime() - 90 * DAY);
    const lastDigestAt = new Date(now.getTime() - 3 * DAY);
    expect(isDue({ cadence: "weekly", lastDigestAt, createdAt }, now)).toBe(false);
  });

  it("monthly: due at 30 days, not at 29", () => {
    const at29 = new Date(now.getTime() - 29 * DAY);
    const at30 = new Date(now.getTime() - 30 * DAY);
    expect(isDue({ cadence: "monthly", lastDigestAt: at29, createdAt: at29 }, now)).toBe(false);
    expect(isDue({ cadence: "monthly", lastDigestAt: at30, createdAt: at30 }, now)).toBe(true);
  });
});
