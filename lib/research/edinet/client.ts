import "server-only";

import { z } from "zod";
import { MarketDataError } from "@/lib/market-data/errors";

/**
 * EDINET API v2 client (R3). Documented quirks this client handles (see
 * docs/references/edinet/integration-notes.md):
 * - The Subscription-Key rides in the QUERY STRING → every error path and
 *   log line must redact URLs.
 * - Errors return HTTP 200 with a JSON body; document fetches are only
 *   distinguishable by Content-Type.
 * - `date` is the only query dimension: one request = one day's filings.
 * - No published rate limit → conservative serialized throttle.
 */

const BASE_URL = "https://api.edinet-fsa.go.jp/api/v2";
const REQUEST_TIMEOUT_MS = 60_000;
const MIN_REQUEST_INTERVAL_MS = 700;

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

function getApiKey(): string {
  const key = process.env.EDINET_API_KEY;
  if (key === undefined || key.trim() === "") {
    throw new MarketDataError(
      "PROVIDER_NOT_CONFIGURED",
      "EDINET_API_KEY is not configured. Add it to .env.local (see .env.local.example)."
    );
  }
  return key.trim();
}

/** Strip the Subscription-Key from any URL before it can reach a log. */
export function redactUrl(url: string): string {
  return url.replace(/Subscription-Key=[^&]*/gi, "Subscription-Key=REDACTED");
}

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

/** documents.json list entry — only the fields R3 uses. */
export const edinetDocumentSchema = z.object({
  docID: z.string(),
  edinetCode: z.string().nullable(),
  secCode: z.string().nullable(),
  filerName: z.string().nullable(),
  docTypeCode: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  submitDateTime: z.string().nullable(),
  docDescription: z.string().nullable(),
  xbrlFlag: z.string().nullable(),
  withdrawalStatus: z.string().nullable(),
});

export type EdinetDocument = z.infer<typeof edinetDocumentSchema>;

const listResponseSchema = z.object({
  metadata: z.object({
    status: z.union([z.string(), z.number()]),
    resultset: z.object({ count: z.number() }).optional(),
  }),
  results: z.array(z.unknown()).optional(),
});

/** Annual securities report (有価証券報告書) and semiannual (半期報告書). */
export const ANNUAL_REPORT_DOC_TYPE = "120";
export const SEMIANNUAL_REPORT_DOC_TYPE = "160";

/**
 * List all filings for one calendar date (type=2 → full metadata).
 * Invalid entries are skipped rather than failing the page — one malformed
 * fund filing must not break an ingest of thousands of documents.
 */
export async function listFilingsForDate(
  date: string
): Promise<EdinetDocument[]> {
  const url = `${BASE_URL}/documents.json?date=${date}&type=2&Subscription-Key=${getApiKey()}`;

  const body = await throttled(async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    }).catch((error: unknown) => {
      throw new MarketDataError(
        "PROVIDER_UNAVAILABLE",
        "EDINET did not respond in time.",
        { retryable: true, details: { cause: String(error) } }
      );
    });
    // EDINET returns errors as HTTP 200 JSON; non-200 means something
    // network-level. Either way the JSON body decides.
    return response.json().catch(() => {
      throw new MarketDataError(
        "PROVIDER_INVALID_RESPONSE",
        `EDINET returned a non-JSON response for ${redactUrl(url)}.`
      );
    });
  });

  const parsed = listResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketDataError(
      "PROVIDER_INVALID_RESPONSE",
      "The EDINET document list did not match the expected schema."
    );
  }

  const status = String(parsed.data.metadata.status);
  if (status === "401" || status === "403") {
    throw new MarketDataError(
      "PROVIDER_NOT_CONFIGURED",
      "EDINET rejected the API key (status " + status + ")."
    );
  }
  if (status !== "200" && status !== "210") {
    throw new MarketDataError(
      "PROVIDER_UNAVAILABLE",
      `EDINET returned status ${status} for the document list.`,
      { retryable: true }
    );
  }

  const documents: EdinetDocument[] = [];
  for (const raw of parsed.data.results ?? []) {
    const doc = edinetDocumentSchema.safeParse(raw);
    if (doc.success) documents.push(doc.data);
  }
  return documents;
}

/**
 * Download a filing's XBRL ZIP (type=1). Success is application/octet-stream;
 * an application/json body is an EDINET error in disguise.
 */
export async function fetchFilingArchive(docId: string): Promise<Buffer> {
  const url = `${BASE_URL}/documents/${docId}?type=1&Subscription-Key=${getApiKey()}`;

  return throttled(async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    }).catch((error: unknown) => {
      throw new MarketDataError(
        "PROVIDER_UNAVAILABLE",
        "EDINET did not return the filing archive in time.",
        { retryable: true, details: { cause: String(error) } }
      );
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      throw new MarketDataError(
        "NOT_FOUND",
        `EDINET could not provide document ${docId} (it may be outside the retention window or withdrawn).`
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new MarketDataError(
        "PROVIDER_INVALID_RESPONSE",
        `EDINET returned an empty archive for document ${docId}.`
      );
    }
    return bytes;
  });
}
