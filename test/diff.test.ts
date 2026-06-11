import { describe, expect, it } from "vitest";
import { runDiff, type AuthorRun, type DiffInput } from "../src/diff.js";
import type { MergedWork } from "../src/dedupe.js";
import type { SourceName, State } from "../src/models.js";
import type { Settings } from "../src/config.js";
import { emptyState } from "../src/state.js";

const settings: Settings = {
  allowed_languages: ["en"],
  release_lead_window_days: 7,
  retire_after_runs: 3,
  enabled_sources: ["hardcover", "googlebooks"],
  email: { provider: "console", from: "from@x", to: "to@x" },
  junk_title_patterns: [],
};

interface MwOpts {
  key?: string;
  source?: SourceName;
  id?: string;
  title: string;
  match?: string;
  release: [string, "day" | "month" | "year" | "unknown"];
  formats?: string[];
  mergedKeys?: string[];
}

function mw(o: MwOpts): MergedWork {
  const source = o.source ?? "hardcover";
  return {
    workKey: o.key ?? `hc:book:${o.id ?? o.title}`,
    mergedKeys: o.mergedKeys ?? [],
    sources: { [source]: { id: o.id ?? o.title } },
    authorKey: "sanderson",
    author: "Brandon Sanderson",
    title: o.title,
    matchTitle: o.match ?? o.title.toLowerCase(),
    release: { value: o.release[0], precision: o.release[1] },
    language: "en",
    formats: o.formats ?? ["hardcover"],
  };
}

function authors(works: MergedWork[], okSources: SourceName[] = ["hardcover"]): AuthorRun[] {
  return [{ authorKey: "sanderson", author: "Brandon Sanderson", works, okSources }];
}

function step(
  state: State,
  runAuthors: AuthorRun[],
  today: string,
  sourcesOk: Partial<Record<SourceName, boolean>> = { hardcover: true },
) {
  const input: DiffInput = {
    state,
    authors: runAuthors,
    settings,
    runCounter: state.run_counter + 1,
    today,
    sourcesOk,
    now: new Date(`${today}T12:00:00Z`),
  };
  return runDiff(input);
}

describe("seeding", () => {
  it("first run for an author emits nothing and marks seeded", () => {
    const { events, nextState } = step(
      emptyState(),
      authors([
        mw({ title: "Old Book", release: ["2010-01-01", "day"] }),
        mw({ title: "Future Book", release: ["2030-01-01", "day"] }),
      ]),
      "2026-06-11",
    );
    expect(events).toHaveLength(0);
    expect(nextState.authors_seeded["sanderson"]?.sources).toEqual(["hardcover"]);
    expect(Object.values(nextState.works).every((w) => w.seeded)).toBe(true);
    expect(Object.values(nextState.works).every((w) => w.notified.announced.sent)).toBe(true);
  });
});

describe("announcement", () => {
  it("a new book after seeding emits exactly one announcement", () => {
    let { nextState } = step(
      emptyState(),
      authors([mw({ title: "Future Book", release: ["2030-01-01", "day"] })]),
      "2026-06-11",
    );
    const r2 = step(
      nextState,
      authors([
        mw({ title: "Future Book", release: ["2030-01-01", "day"] }),
        mw({ title: "Brand New", release: ["2031-01-01", "day"] }),
      ]),
      "2026-06-12",
    );
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]).toMatchObject({ type: "announcement", title: "Brand New" });
  });
});

describe("release", () => {
  it("fires once inside the lead window then is idempotent", () => {
    // Seed with a book releasing in 5 days.
    let { nextState } = step(
      emptyState(),
      authors([mw({ title: "Coming Soon", release: ["2026-06-16", "day"] })]),
      "2026-06-10",
    );
    // run within the window
    const r2 = step(
      nextState,
      authors([mw({ title: "Coming Soon", release: ["2026-06-16", "day"] })]),
      "2026-06-11",
    );
    expect(r2.events.filter((e) => e.type === "release")).toHaveLength(1);
    // re-run same day: no duplicate
    const r3 = step(
      r2.nextState,
      authors([mw({ title: "Coming Soon", release: ["2026-06-16", "day"] })]),
      "2026-06-11",
    );
    expect(r3.events).toHaveLength(0);
  });

  it("does not fire for month-precision dates", () => {
    let { nextState } = step(
      emptyState(),
      authors([mw({ title: "Vague", release: ["2026-06", "month"] })]),
      "2026-06-01",
    );
    const r2 = step(
      nextState,
      authors([mw({ title: "Vague", release: ["2026-06", "month"] })]),
      "2026-06-02",
    );
    expect(r2.events).toHaveLength(0);
  });
});

describe("date change", () => {
  it("emits a date_change for a genuine move and resets released when pushed to the future", () => {
    // Seed, then release it.
    let s = step(
      emptyState(),
      authors([mw({ title: "Slippery", release: ["2026-06-12", "day"] })]),
      "2026-06-08",
    ).nextState;
    const released = step(
      s,
      authors([mw({ title: "Slippery", release: ["2026-06-12", "day"] })]),
      "2026-06-10",
    );
    expect(released.events.filter((e) => e.type === "release")).toHaveLength(1);
    expect(released.nextState.works["hc:book:Slippery"]?.notified.released.sent).toBe(true);

    // Publisher slips it 3 months out.
    const moved = step(
      released.nextState,
      authors([mw({ title: "Slippery", release: ["2026-09-15", "day"] })]),
      "2026-06-11",
    );
    expect(moved.events.filter((e) => e.type === "date_change")).toHaveLength(1);
    const work = moved.nextState.works["hc:book:Slippery"]!;
    expect(work.notified.released.sent).toBe(false);
    expect(work.status).toBe("active");
  });

  it("treats a precision refinement as silent", () => {
    let s = step(
      emptyState(),
      authors([mw({ title: "Firming", release: ["2026", "year"] })]),
      "2025-06-08",
    ).nextState;
    const refined = step(
      s,
      authors([mw({ title: "Firming", release: ["2026-12-06", "day"] })]),
      "2025-06-09",
    );
    expect(refined.events).toHaveLength(0);
    expect(refined.nextState.works["hc:book:Firming"]?.release_date).toBe("2026-12-06");
    expect(refined.nextState.works["hc:book:Firming"]?.date_precision).toBe("day");
  });
});

describe("disappearance and retire", () => {
  it("does not retire when the source was unhealthy (transient)", () => {
    let s = step(
      emptyState(),
      authors([mw({ title: "Maybe", release: ["2030-01-01", "day"] })]),
      "2026-06-08",
    ).nextState;
    // Source failed: no works, okSources empty, sources_ok false.
    const gap = step(s, authors([], []), "2026-06-09", { hardcover: false });
    expect(gap.nextState.works["hc:book:Maybe"]?.missing_since_run).toBeNull();
    expect(gap.nextState.works["hc:book:Maybe"]?.status).toBe("active");
  });

  it("retires after the threshold when the source is healthy but the work is gone", () => {
    let s = step(
      emptyState(),
      authors([mw({ title: "Maybe", release: ["2030-01-01", "day"] })]),
      "2026-06-08",
    ).nextState;
    // retire_after_runs = 3
    s = step(s, authors([]), "2026-06-09").nextState; // missing_since_run set
    s = step(s, authors([]), "2026-06-10").nextState;
    const retired = step(s, authors([]), "2026-06-11").nextState;
    expect(retired.works["hc:book:Maybe"]?.status).toBe("retired");
  });

  it("does not re-announce a retired work that reappears", () => {
    let s = step(
      emptyState(),
      authors([mw({ title: "Maybe", release: ["2030-01-01", "day"] })]),
      "2026-06-08",
    ).nextState;
    s = step(s, authors([]), "2026-06-09").nextState;
    s = step(s, authors([]), "2026-06-10").nextState;
    s = step(s, authors([]), "2026-06-11").nextState; // retired
    const back = step(
      s,
      authors([mw({ title: "Maybe", release: ["2030-01-01", "day"] })]),
      "2026-06-12",
    );
    expect(back.events).toHaveLength(0);
    expect(back.nextState.works["hc:book:Maybe"]?.status).toBe("active");
  });
});

describe("adding a second source later", () => {
  it("seeds the new source silently instead of announcing its backlist", () => {
    // Hardcover seeded first.
    let s = step(
      emptyState(),
      authors([mw({ title: "Future Book", release: ["2030-01-01", "day"] })]),
      "2026-06-08",
    ).nextState;
    expect(s.authors_seeded["sanderson"]?.sources).toEqual(["hardcover"]);

    // Now Google Books is enabled and returns a backlist title Hardcover didn't have.
    const r = step(
      s,
      authors(
        [
          mw({ title: "Future Book", release: ["2030-01-01", "day"] }),
          mw({
            key: "gb:sanderson:google-only-backlist",
            source: "googlebooks",
            title: "Google Only Backlist",
            match: "google only backlist",
            release: ["2031-01-01", "day"],
          }),
        ],
        ["hardcover", "googlebooks"],
      ),
      "2026-06-09",
    );
    expect(r.events).toHaveLength(0);
    expect(r.nextState.works["gb:sanderson:google-only-backlist"]?.seeded).toBe(true);
    expect(r.nextState.authors_seeded["sanderson"]?.sources.sort()).toEqual([
      "googlebooks",
      "hardcover",
    ]);
  });
});

describe("idempotency", () => {
  it("applying the same fetched set twice yields no second-run events", () => {
    let s = step(
      emptyState(),
      authors([mw({ title: "Future Book", release: ["2030-01-01", "day"] })]),
      "2026-06-08",
    ).nextState;
    const works = [
      mw({ title: "Future Book", release: ["2030-01-01", "day"] }),
      mw({ title: "Newish", release: ["2030-02-02", "day"] }),
    ];
    const r1 = step(s, authors(works), "2026-06-09");
    expect(r1.events).toHaveLength(1);
    const r2 = step(r1.nextState, authors(works), "2026-06-10");
    expect(r2.events).toHaveLength(0);
  });
});
