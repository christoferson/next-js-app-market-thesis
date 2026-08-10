import "server-only";

import { MarketDataError } from "@/lib/market-data/errors";
import {
  companyFactsSchema,
  submissionsSchema,
  type EdgarCompanyFacts,
  type EdgarSubmissions,
} from "./schemas";
import { paddedCik } from "@/lib/research/universe";

/**
 * SEC EDGAR client (R1). Free, keyless, but with hard access rules:
 * a declared User-Agent is mandatory (403 without one) and the documented
 * ceiling is 10 requests/second. R1 stays far below it: at most two
 * requests per page view, throttled and cached.
 */

const EDGAR_USER_AGENT =
  process.env.EDGAR_USER_AGENT ??
  "MarketThesis/0.1 (research prototype; contact: set EDGAR_USER_AGENT)";

const REQUEST_TIMEOUT_MS = 15_000;
const MIN_REQUEST_INTERVAL_MS = 150;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 64;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (entry === undefined) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

/** Serialize requests with a minimum spacing — a simple, honest throttle. */
async function throttled<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const waitMs = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastRequestAt = Date.now();
  });
  queue = run.catch(() => undefined);
  await run;
  return work();
}

async function fetchEdgarJson(url: string): Promise<unknown> {
  const cached = cacheGet(url);
  if (cached !== undefined) return cached;

  const response = await throttled(() =>
    fetch(url, {
      headers: {
        "User-Agent": EDGAR_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
  ).catch((error: unknown) => {
    throw new MarketDataError(
      "PROVIDER_UNAVAILABLE",
      "SEC EDGAR did not respond in time. Please retry shortly.",
      { retryable: true, details: { cause: String(error) } }
    );
  });

  if (response.status === 404) {
    throw new MarketDataError("NOT_FOUND", "EDGAR has no data for this company.");
  }
  if (!response.ok) {
    throw new MarketDataError(
      "PROVIDER_UNAVAILABLE",
      `SEC EDGAR returned an unexpected status (${response.status}).`,
      { retryable: response.status >= 500 || response.status === 429 }
    );
  }

  const body: unknown = await response.json().catch(() => {
    throw new MarketDataError(
      "PROVIDER_INVALID_RESPONSE",
      "SEC EDGAR returned a response that could not be parsed."
    );
  });

  cacheSet(url, body);
  return body;
}

export async function fetchSubmissions(cik: number): Promise<EdgarSubmissions> {
  const body = await fetchEdgarJson(
    `https://data.sec.gov/submissions/CIK${paddedCik(cik)}.json`
  );
  const parsed = submissionsSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketDataError(
      "PROVIDER_INVALID_RESPONSE",
      "The EDGAR submissions response did not match the expected schema."
    );
  }
  return parsed.data;
}

export async function fetchCompanyFacts(
  cik: number
): Promise<EdgarCompanyFacts> {
  const body = await fetchEdgarJson(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik(cik)}.json`
  );
  const parsed = companyFactsSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketDataError(
      "PROVIDER_INVALID_RESPONSE",
      "The EDGAR company-facts response did not match the expected schema."
    );
  }
  return parsed.data;
}
