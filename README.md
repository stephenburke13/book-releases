# book-releases

Get an email when authors you follow announce or release a new book.

book-releases has two parts that share one tracking core:

1. **Web app (multi-user).** A public website where anyone can search for an
   author, subscribe with their email (double opt-in), and receive batched
   **weekly or monthly** digests. Runs on **Cloudflare Workers** (Next.js via
   OpenNext) with a **Cloudflare D1** database and **Cron Triggers**.
2. **CLI (single-user).** The original personal tracker: a `config.yaml` author
   list diffed against a committed `state.json`, emailing one recipient. Still
   here, still works, good for local debugging.

Both reuse the same fetch → dedupe → diff core (`src/`), which checks
[Hardcover](https://hardcover.app) and [Google Books](https://books.google.com)
for forthcoming titles and produces three kinds of event:

1. **New announcement** — a previously unseen forthcoming title by a followed author.
2. **Release** — a tracked title's release date is here (or within a few days).
3. **Date change** — a tracked title's announced release date moves.

## How the web app works

```
                          subscribe (double opt-in)
  visitor ──search──▶ Hardcover ──pick author──▶ email + cadence ──▶ confirm link
                                                                          │
                                                                          ▼
  Cron #1 (track):   tracked authors ─ fetch+dedupe+diff ─▶ events queued in D1
  Cron #2 (dispatch): due subscriptions ─ gather events ─▶ one digest per subscriber
```

- **Tracking state is global per author.** The union of every author anyone
  follows is tracked once; what's per-subscriber is which authors they follow,
  their cadence, and what they've already been sent.
- **Cadence batching.** Events are queued; each subscription fires on its own
  weekly/monthly schedule, and a subscriber's due authors are combined into one
  email.
- **No backlog spam.** When the first subscriber follows a new author, the next
  tracking run silently *seeds* that author's existing catalog (no email) — only
  things appearing afterward generate digests.

### Architecture map

| Area | Files |
| --- | --- |
| Shared tracking core | `src/` (sources, dedupe, diff, normalize, render, `track.ts`) |
| Storage boundary | `src/store/base.ts` (interface), `src/store/file.ts` (CLI), `lib/store-d1.ts` (web) |
| Database | `lib/db/schema.ts` (Drizzle), `migrations/`, `wrangler.jsonc` D1 binding |
| Web pages | `app/page.tsx` (search+subscribe), `app/confirm`, `app/manage` |
| API routes | `app/api/{authors/search,subscribe,confirm,manage,cron}` |
| Subscription logic | `lib/service.ts`, `lib/tokens.ts`, `lib/cadence.ts`, `lib/email/` |
| Cron jobs | `lib/jobs/trackAuthors.ts`, `lib/jobs/dispatchDigests.ts`, `worker.ts` |

## Running the web app locally

```bash
npm ci
cp .dev.vars.example .dev.vars      # then fill in tokens/secrets
npx wrangler d1 create book-releases  # paste the id into wrangler.jsonc
npm run db:migrate:local            # apply migrations to local D1
npm run dev                         # next dev with Cloudflare bindings
```

- `npm run dev` — local dev server (Cloudflare bindings via OpenNext).
- `npm run preview` — build with OpenNext and run the real Worker locally.
- `npm run deploy` — build and deploy to Cloudflare.
- `npm run db:generate` — regenerate migrations after editing `lib/db/schema.ts`.

Trigger the cron jobs manually while testing (guarded by `CRON_SECRET`):

```bash
curl -X POST localhost:8787/api/cron -H "authorization: Bearer $CRON_SECRET" \
  -H 'content-type: application/json' -d '{"job":"track"}'
curl -X POST localhost:8787/api/cron -H "authorization: Bearer $CRON_SECRET" \
  -H 'content-type: application/json' -d '{"job":"dispatch"}'
```

### Deploying to Cloudflare

1. `npx wrangler d1 create book-releases` and set the `database_id` in `wrangler.jsonc`.
2. `npm run db:migrate` (applies migrations to the remote D1).
3. Set secrets: `wrangler secret put HARDCOVER_TOKEN` (and `RESEND_API_KEY`,
   `SIGNING_SECRET`, `CRON_SECRET`, optional `GOOGLE_BOOKS_API_KEY`). Set
   `APP_BASE_URL`/`RESEND_FROM` as `vars` in `wrangler.jsonc`.
4. `npm run deploy`. Cron Triggers (`0 13` track, `0 14` dispatch UTC) run the
   jobs; confirm they fire in the Cloudflare dashboard.

### Secrets and config

| Variable | Where it's used | Where to get it |
| --- | --- | --- |
| `HARDCOVER_TOKEN` | author search + tracking | Hardcover → settings → **Hardcover API** (JWT, resets Jan 1) |
| `RESEND_API_KEY` | sending email | [Resend](https://resend.com) → API Keys |
| `RESEND_FROM` | from address | `onboarding@resend.dev` for tests; a verified-domain address for real sends |
| `SIGNING_SECRET` | confirm/manage token HMAC | any long random string |
| `CRON_SECRET` | guards `POST /api/cron` | any long random string |
| `GOOGLE_BOOKS_API_KEY` | secondary source (optional) | Google Cloud Console → Books API |
| `APP_BASE_URL` | links in emails | your deployed URL |

## CLI (single-user) — still supported

```bash
npm ci
cp .env.example .env   # HARDCOVER_TOKEN / GOOGLE_BOOKS_API_KEY / RESEND_API_KEY
npm run dry-run        # full pipeline, prints the digest, sends/writes nothing
npm start              # real run: fetch, diff, send email, save state.json
npm test               # unit tests
```

The CLI reads its author list and recipient from `config.yaml` and diffs against
`state.json`, sending one digest to `settings.email.to`. Add an author by editing
`config.yaml` and committing; the next run seeds them silently, then notifies.

> **Note:** In the web app these knobs no longer apply — `config.yaml`'s
> `authors:` and `email.to` are CLI-only. The web app's authors come from D1
> (added when someone subscribes) and recipients are subscribers. The global
> tuning settings (`allowed_languages`, `release_lead_window_days`,
> `retire_after_runs`, `enabled_sources`, `junk_title_patterns`) live in
> `lib/settings.ts` for the tracking job. The `.github/workflows/daily.yml` cron
> drives the CLI path and can be disabled once the Cloudflare cron is verified.

### Global tuning (`config.yaml settings`)

| Setting | Meaning |
| --- | --- |
| `allowed_languages` | Keep only works in these languages (ISO-639-1). |
| `release_lead_window_days` | Fire a Release event when a day-precision date is within this many days. Default 7. |
| `retire_after_runs` | Retire a title that vanishes from healthy sources after this many runs. Never deleted. |
| `enabled_sources` | Which sources to query: `hardcover`, `googlebooks`. |
| `junk_title_patterns` | Case-insensitive substrings; matching titles are dropped. |

## Adding a new data source

Sources are pluggable. To add one (e.g. ISFDB, ComicVine):

1. Create `src/sources/<name>.ts` implementing the `Source` interface in
   `src/sources/base.ts` — return clean, work-level `FetchedWork`s.
2. Add its name to `enabled_sources` (`config.yaml` for the CLI,
   `lib/settings.ts` for the web job) and wire it into `buildSources()` in
   `src/track.ts`.

The dedupe and diff layers never import a concrete source, so nothing else changes.

## State

- **Web:** the tracker State lives in D1 (`tracker_state`), and produced events
  in `events`. The diff semantics are identical to the CLI — the only difference
  is where State is stored (see `src/store/`).
- **CLI:** `state.json` is committed and human-diffable. Don't hand-edit it; read
  the git diff after each run to see exactly what changed.
