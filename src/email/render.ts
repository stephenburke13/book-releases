// Render a list of events into one plain, readable digest (subject/html/text).
// One email per run, grouped by event type.

import type { DatePrecision, NotifyEvent } from "../models.js";
import type { Digest } from "./base.js";

const SECTIONS: { type: NotifyEvent["type"]; heading: string }[] = [
  { type: "announcement", heading: "New announcements" },
  { type: "release", heading: "Releasing soon" },
  { type: "date_change", heading: "Date changes" },
];

/** Human-friendly release date honoring precision. */
export function formatReleaseDate(value: string, precision: DatePrecision): string {
  if (!value) return "date TBA";
  if (precision === "year") return value;
  if (precision === "month") {
    const [y, m] = value.split("-");
    const month = MONTHS[Number(m) - 1] ?? m;
    return `${month} ${y}`;
  }
  if (precision === "day") {
    const [y, m, d] = value.split("-");
    const month = MONTHS[Number(m) - 1] ?? m;
    return `${month} ${Number(d)}, ${y}`;
  }
  return value;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function eventLineText(e: NotifyEvent): string {
  const date = formatReleaseDate(e.release_date, e.date_precision);
  const formats = e.formats.length ? ` [${e.formats.join(", ")}]` : "";
  if (e.type === "date_change") {
    const prev = e.previous_release_date
      ? formatReleaseDate(e.previous_release_date, "day")
      : "previous";
    return `• ${e.title} — ${e.author}: ${prev} → ${date}${formats}`;
  }
  return `• ${e.title} — ${e.author} (${date})${formats}`;
}

function eventLineHtml(e: NotifyEvent): string {
  const date = escapeHtml(formatReleaseDate(e.release_date, e.date_precision));
  const title = escapeHtml(e.title);
  const author = escapeHtml(e.author);
  const formats = e.formats.length
    ? ` <span style="color:#888">[${escapeHtml(e.formats.join(", "))}]</span>`
    : "";
  if (e.type === "date_change") {
    const prev = e.previous_release_date
      ? escapeHtml(formatReleaseDate(e.previous_release_date, "day"))
      : "previous";
    return `<li><strong>${title}</strong> — ${author}: <s>${prev}</s> → <strong>${date}</strong>${formats}</li>`;
  }
  return `<li><strong>${title}</strong> — ${author} (${date})${formats}</li>`;
}

export function renderDigest(events: NotifyEvent[]): Digest {
  const counts = {
    announcement: events.filter((e) => e.type === "announcement").length,
    release: events.filter((e) => e.type === "release").length,
    date_change: events.filter((e) => e.type === "date_change").length,
  };
  const parts: string[] = [];
  if (counts.announcement) parts.push(`${counts.announcement} new`);
  if (counts.release) parts.push(`${counts.release} releasing`);
  if (counts.date_change) parts.push(`${counts.date_change} date change${counts.date_change > 1 ? "s" : ""}`);
  const subject = `Book releases: ${parts.join(", ")}`;

  const textBlocks: string[] = [];
  const htmlBlocks: string[] = [];
  for (const section of SECTIONS) {
    const items = events.filter((e) => e.type === section.type);
    if (!items.length) continue;
    textBlocks.push(`${section.heading}\n${items.map(eventLineText).join("\n")}`);
    htmlBlocks.push(
      `<h2 style="font-size:16px;margin:20px 0 8px">${section.heading}</h2>` +
        `<ul style="margin:0;padding-left:20px;line-height:1.6">${items.map(eventLineHtml).join("")}</ul>`,
    );
  }

  const text = textBlocks.join("\n\n") + "\n";
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;max-width:560px">` +
    `<p style="color:#666;margin:0 0 4px">Your book release tracker found ${events.length} update${events.length > 1 ? "s" : ""}:</p>` +
    htmlBlocks.join("") +
    `</div>`;

  return { subject, html, text };
}
