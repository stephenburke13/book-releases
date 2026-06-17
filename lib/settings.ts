// Global tracking settings for the multi-user job. These mirror the tuning
// knobs in config.yaml; authors and the email recipient no longer live here
// (authors come from D1, recipients are subscribers). The email block is a
// placeholder only — the tracking job never sends mail (the dispatcher does).

import type { Settings } from "../src/config.js";

export const TRACKING_SETTINGS: Settings = {
  allowed_languages: ["en"],
  release_lead_window_days: 7,
  retire_after_runs: 14,
  enabled_sources: ["hardcover", "googlebooks"],
  email: { provider: "console", from: "", to: "" },
  junk_title_patterns: [
    "study guide",
    "summary of",
    "summary and analysis",
    "analysis of",
    "boxed set",
    "box set",
    "workbook",
  ],
};
