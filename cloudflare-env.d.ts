// Cloudflare Worker bindings available at runtime. Mirrors wrangler.jsonc.
// OpenNext exposes these via getCloudflareContext().env and the Worker scheduled
// handler receives them directly.

declare global {
  interface CloudflareEnv {
    /** D1 database binding. */
    DB: D1Database;
    /** Hardcover GraphQL bearer token (resets yearly). */
    HARDCOVER_TOKEN?: string;
    /** Optional Google Books API key (quota). */
    GOOGLE_BOOKS_API_KEY?: string;
    /** Resend API key for transactional email. */
    RESEND_API_KEY?: string;
    /** From address for outgoing email. */
    RESEND_FROM?: string;
    /** HMAC secret for signing confirm/manage tokens. */
    SIGNING_SECRET?: string;
    /** Public base URL used to build links in emails, e.g. https://book-releases.example.com */
    APP_BASE_URL?: string;
    /** Shared secret guarding the manual /api/cron trigger. */
    CRON_SECRET?: string;
  }
}

export {};
