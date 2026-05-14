// Shared HTTP client for external sources (Wikipedia, Commons, Wikidata,
// Openverse, OSM/Nominatim, Overpass, etc).
//
// Adds:
//  - Identifiable User-Agent (Wikimedia/Nominatim policy compliance)
//  - Default Accept: application/json (overridable)
//  - withRetry() with jittered exponential backoff for 429 / 5xx / network
//
// Used by `_shared/image-search.ts` and (gradually) by enrich-location and
// recover-missing-images.

export const VANDITS_USER_AGENT =
  "Vandits/1.0 (+https://vandits.lovable.app; contact@vandits.app)";

export interface ExternalFetchInit extends RequestInit {
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number;
}

/**
 * Fetch wrapper that always identifies the client and defaults to
 * Accept: application/json, while still allowing per-request overrides
 * (some sources return XML, HTML, or binary).
 */
export async function externalFetch(
  url: string,
  init: ExternalFetchInit = {},
): Promise<Response> {
  const { timeoutMs = 10_000, headers, ...rest } = init;

  // Merge headers without losing caller overrides.
  const merged = new Headers(headers ?? {});
  if (!merged.has("User-Agent")) merged.set("User-Agent", VANDITS_USER_AGENT);
  if (!merged.has("Accept")) merged.set("Accept", "application/json");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, headers: merged, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface RetryOptions {
  attempts?: number;   // total attempts including the first try
  baseMs?: number;     // base backoff
  factor?: number;     // exponential factor
  jitterMs?: number;   // random extra delay added on each retry
  /** Decide whether an error/result should be retried. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

/** Default retry policy: retry on AbortError, network errors, and on
 *  Response with status 429 / 408 / 5xx. Do NOT retry on 4xx other than
 *  429/408 — those are definitive client errors. */
export function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof Response) {
    if (err.status === 429 || err.status === 408) return true;
    if (err.status >= 500 && err.status < 600) return true;
    return false;
  }
  // Network / abort / unknown -> retry.
  return true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseMs ?? 500;
  const factor = opts.factor ?? 3;
  const jitter = opts.jitterMs ?? 200;
  const should = opts.shouldRetry ?? defaultShouldRetry;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !should(err, i)) throw err;
      const delay = base * Math.pow(factor, i) + Math.floor(Math.random() * jitter);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Convenience: fetch JSON with retry on transient failures. Throws on
 *  non-OK responses (so withRetry can decide whether to retry). */
export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  init: ExternalFetchInit = {},
  retry: RetryOptions = {},
): Promise<T> {
  return await withRetry(async () => {
    const res = await externalFetch(url, init);
    if (!res.ok) {
      // Throw the Response itself so defaultShouldRetry can read .status
      // without having to parse a message.
      throw res;
    }
    return await res.json() as T;
  }, retry);
}
