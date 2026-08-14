import "server-only";

import { MarketDataError } from "@/lib/market-data/errors";

/**
 * Fetch a filing document (HTML) from sec.gov Archives. Documents are large
 * (a 10-K can be several MB) and immutable once filed, so they cache well;
 * a small LRU keeps at most a handful in memory.
 */

// Empty-string env values must fall back too (see client.ts) — an empty
// User-Agent gets a 403 from EDGAR.
function edgarUserAgent(): string {
  const configured = process.env.EDGAR_USER_AGENT?.trim();
  return configured !== undefined && configured !== ""
    ? configured
    : "MarketThesis/0.1 (research prototype; contact: set EDGAR_USER_AGENT)";
}
const EDGAR_USER_AGENT = edgarUserAgent();

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;
const CACHE_MAX_ENTRIES = 8;

const cache = new Map<string, string>();

export async function fetchFilingDocument(url: string): Promise<string> {
  if (!url.startsWith("https://www.sec.gov/Archives/")) {
    throw new MarketDataError(
      "INVALID_REQUEST",
      "Filing documents may only be fetched from sec.gov Archives."
    );
  }

  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  const response = await fetch(url, {
    headers: { "User-Agent": EDGAR_USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  }).catch((error: unknown) => {
    throw new MarketDataError(
      "PROVIDER_UNAVAILABLE",
      "SEC EDGAR did not return the filing document in time.",
      { retryable: true, details: { cause: String(error) } }
    );
  });

  if (!response.ok) {
    throw new MarketDataError(
      response.status === 404 ? "NOT_FOUND" : "PROVIDER_UNAVAILABLE",
      `SEC EDGAR returned status ${response.status} for the filing document.`,
      { retryable: response.status >= 500 }
    );
  }

  const text = await response.text();
  if (text.length > MAX_DOCUMENT_BYTES) {
    throw new MarketDataError(
      "PROVIDER_INVALID_RESPONSE",
      "The filing document exceeded the size limit."
    );
  }

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, text);
  return text;
}
