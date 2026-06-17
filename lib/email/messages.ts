// Email bodies: double opt-in confirmation, "you're subscribed" notices, and a
// footer wrapper for the per-subscriber digest (reuses the core renderDigest).

import type { Digest } from "../../src/email/base.js";
import type { SendArgs } from "./resend";

function shell(inner: string): string {
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;max-width:560px">` +
    inner +
    `</div>`
  );
}

function footer(manageUrl: string): { html: string; text: string } {
  return {
    html:
      `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>` +
      `<p style="color:#888;font-size:12px">You're receiving this because you subscribed at book-releases. ` +
      `<a href="${manageUrl}">Manage your subscriptions or unsubscribe</a>.</p>`,
    text: `\n\n—\nManage your subscriptions or unsubscribe: ${manageUrl}\n`,
  };
}

export function confirmationEmail(
  to: string,
  authorName: string,
  confirmUrl: string,
): SendArgs {
  const subject = "Confirm your book-releases subscription";
  const html = shell(
    `<p>Thanks for subscribing to release updates for <strong>${escapeHtml(authorName)}</strong>.</p>` +
      `<p>Please confirm your email to start receiving digests:</p>` +
      `<p><a href="${confirmUrl}" style="display:inline-block;background:#222;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Confirm subscription</a></p>` +
      `<p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>`,
  );
  const text =
    `Thanks for subscribing to release updates for ${authorName}.\n\n` +
    `Confirm your email to start receiving digests:\n${confirmUrl}\n\n` +
    `If you didn't request this, ignore this email.\n`;
  return { to, subject, html, text };
}

export function subscribedEmail(
  to: string,
  authorName: string,
  cadence: string,
  manageUrl: string,
): SendArgs {
  const subject = `Subscribed to ${authorName}`;
  const f = footer(manageUrl);
  const html = shell(
    `<p>You're now subscribed to <strong>${escapeHtml(authorName)}</strong> (${cadence} digest).</p>` +
      `<p>We'll email you when there's something new to report.</p>` +
      f.html,
  );
  const text =
    `You're now subscribed to ${authorName} (${cadence} digest).\n` +
    `We'll email you when there's something new to report.\n` +
    f.text;
  return { to, subject, html, text };
}

/** Wrap a rendered digest with the manage/unsubscribe footer. */
export function digestEmail(to: string, digest: Digest, manageUrl: string): SendArgs {
  const f = footer(manageUrl);
  return {
    to,
    subject: digest.subject,
    html: digest.html + f.html,
    text: digest.text + f.text,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
