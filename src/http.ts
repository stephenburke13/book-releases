// Shared HTTP helpers: retry/backoff on transient failures and a simple
// per-host throttle so we never hammer an API (Hardcover caps at 60 req/min).

export class SourceUnavailable extends Error {}

interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  /** Minimum spacing between calls keyed by `throttleKey`. */
  minIntervalMs?: number;
  throttleKey?: string;
}

const lastCallAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(key: string, minIntervalMs: number): Promise<void> {
  const prev = lastCallAt.get(key) ?? 0;
  const wait = prev + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt.set(key, Date.now());
}

/**
 * fetch() with exponential backoff + jitter on 429/5xx and network errors.
 * Respects a Retry-After header when present. Throws SourceUnavailable once
 * retries are exhausted so the pipeline can mark the source not-ok.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const throttleKey = opts.throttleKey ?? new URL(url).host;
  const minIntervalMs = opts.minIntervalMs ?? 0;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (minIntervalMs > 0) await throttle(throttleKey, minIntervalMs);
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250;
        lastErr = new SourceUnavailable(`HTTP ${res.status} from ${url}`);
        if (attempt < attempts) {
          await sleep(backoff);
          continue;
        }
        throw lastErr;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250);
        continue;
      }
    }
  }
  throw new SourceUnavailable(`Request to ${url} failed: ${String(lastErr)}`);
}
