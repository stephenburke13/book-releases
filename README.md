# book-releases

A personal, single-user book release tracker. You keep a list of authors you
follow in `config.yaml`; a daily GitHub Actions cron checks
[Hardcover](https://hardcover.app) and [Google Books](https://books.google.com)
for their forthcoming titles and emails you one digest when something happens:

1. **New announcement** — a previously unseen forthcoming title by a followed author appears.
2. **Release** — a tracked title's release date is here (or within the next few days).
3. **Date change** — a tracked title's announced release date moves.

No accounts, no auth, no web app. State lives in a committed `state.json` so every
run diffs cleanly against the last and you never get emailed twice about the same
event.

## How it works

```
config.yaml  ──▶  fetch (Hardcover + Google Books)  ──▶  dedupe to work level
   (authors)                                                      │
                                                                  ▼
state.json  ◀──  save (after a successful send)  ◀──  diff vs state  ──▶  one digest email
```

- **Work-level dedupe.** Every format (hardcover/ebook/audio) and every source is
  collapsed to one book, so you get one notification per title.
- **Idempotent.** Each notification is gated on a per-work flag that flips once.
  Re-running is always safe.
- **Seeding.** The first run that sees a new author silently records their existing
  catalog into `state.json` and sends nothing — no spam about old books. You only
  get emailed about things that appear *after* that.

## Setup

### 1. Install and run locally

```bash
npm ci
cp .env.example .env   # then fill in your tokens
npm run dry-run        # prints the would-be email; sends nothing; writes nothing
```

- `npm run dry-run` — full pipeline, prints the digest to stdout, no email, no state write.
- `npm start` — real run: fetch, diff, send email, save `state.json`.
- `npm test` — unit tests.
- `npx tsx src/main.ts run --only hardcover` — restrict to one source while debugging.

### 2. Secrets (local `.env` and GitHub Actions secrets)

| Variable | Where to get it |
| --- | --- |
| `HARDCOVER_TOKEN` | Hardcover → account settings → **Hardcover API**. It's a JWT that **expires yearly (resets Jan 1)** — refresh it each year. |
| `GOOGLE_BOOKS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) → enable **Books API** → create an API key. Optional but recommended for quota. |
| `RESEND_API_KEY` | [Resend](https://resend.com) → API Keys. |

For the cron, add these three as **repository secrets** (Settings → Secrets and
variables → Actions). The email `from`/`to` addresses live in `config.yaml`, not
secrets.

### 3. Email sender

The MVP sends from Resend's test sender `onboarding@resend.dev`, which **only
delivers to the email that owns the Resend account**. So sign up for Resend with
the same address you put in `config.yaml` under `settings.email.to`
(currently `scburke4@gmail.com`).

To use your own address later: verify a domain in Resend and change
`settings.email.from` in `config.yaml` to an address on that domain.

## Adding an author ("subscribing")

Edit `config.yaml` and add an entry under `authors:`, then commit and push:

```yaml
authors:
  - author_key: jemisin            # you assign this — a stable lowercase slug
    name: "N. K. Jemisin"
    hardcover_id: 12345            # optional but strongly preferred (exact author match)
    google_query: 'inauthor:"N. K. Jemisin"'   # optional override
    primary_author_names: ["N. K. Jemisin"]     # optional; filters Google false positives
```

- `author_key` is the stable identity used internally — pick something short and
  never change it.
- `hardcover_id` is the canonical author id on Hardcover (visit the author's page;
  it's in the URL / API). Without it, Hardcover is skipped for that author.
- The **next scheduled run seeds that author silently** (no email), then notifies
  you about anything new from then on.

## Configuration (`config.yaml settings`)

| Setting | Meaning |
| --- | --- |
| `allowed_languages` | Keep only works in these languages (ISO-639-1). Others dropped. |
| `release_lead_window_days` | A title fires a Release email when its (day-precision) date is within this many days. Default 7. |
| `retire_after_runs` | A title that vanishes from its sources (while they're healthy) is retired after this many runs. Never deleted. |
| `enabled_sources` | Which sources to query: `hardcover`, `googlebooks`. |
| `junk_title_patterns` | Case-insensitive substrings; matching titles are dropped (study guides, box sets, …). |

## Running on GitHub Actions

`.github/workflows/daily.yml` runs daily at 13:00 UTC and commits the updated
`state.json` back to the repo using the built-in `GITHUB_TOKEN` (no PAT needed).
You can also trigger it manually from the **Actions** tab — tick **dry_run** to
preview without sending or committing.

## Adding a new data source

Sources are pluggable. To add one (e.g. ISFDB, ComicVine):

1. Create `src/sources/<name>.ts` implementing the `Source` interface in
   `src/sources/base.ts` — it returns clean, work-level `FetchedWork`s (your code
   owns querying, paging, edition collapse, and junk/language filtering).
2. Wire it into `buildSources()` in `src/pipeline.ts` and add its name to
   `enabled_sources`.

The dedupe and diff layers never import a concrete source, so nothing else changes.

## State file

`state.json` is committed and human-diffable. Each work tracks its sources,
release date + precision, and which notifications have been sent. **Don't hand-edit
it** unless you know what you're doing — but reading the git diff after each run is
a good way to see exactly what changed.
