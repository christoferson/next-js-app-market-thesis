import "server-only";

import {
  ANNUAL_REPORT_DOC_TYPE,
  SEMIANNUAL_REPORT_DOC_TYPE,
  fetchFilingArchive,
  listFilingsForDate,
  type EdinetDocument,
} from "./client";
import { extractRiskText } from "./risk-text";
import { JAPAN_RESEARCH_UNIVERSE } from "./universe";
import {
  getSyncCursor,
  setSyncCursor,
  upsertFiling,
  getFiling,
} from "./store";

/**
 * EDINET date-axis sync (R3). Walks calendar dates, keeps only annual and
 * semiannual reports from the curated universe, downloads their archives,
 * extracts risk text, and stores everything locally. Bounded and resumable:
 * the cursor advances per completed date, so an interrupted sync continues
 * where it stopped.
 */

const RELEVANT_DOC_TYPES = new Set([
  ANNUAL_REPORT_DOC_TYPE,
  SEMIANNUAL_REPORT_DOC_TYPE,
]);

const UNIVERSE_CODES = new Set(
  JAPAN_RESEARCH_UNIVERSE.map((c) => c.edinetCode)
);

export interface SyncProgress {
  date: string;
  listed: number;
  relevant: number;
  stored: number;
}

export interface SyncResult {
  datesProcessed: number;
  filingsStored: number;
  firstDate: string | null;
  lastDate: string | null;
}

function* dateRange(fromInclusive: string, toInclusive: string): Generator<string> {
  const current = new Date(`${fromInclusive}T00:00:00Z`);
  const end = new Date(`${toInclusive}T00:00:00Z`);
  while (current <= end) {
    yield current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function isRelevant(doc: EdinetDocument): boolean {
  return (
    doc.docTypeCode !== null &&
    RELEVANT_DOC_TYPES.has(doc.docTypeCode) &&
    doc.edinetCode !== null &&
    UNIVERSE_CODES.has(doc.edinetCode) &&
    doc.withdrawalStatus !== "1" &&
    doc.xbrlFlag === "1"
  );
}

/**
 * Sync a date range. Rough scale: one list request per date (~0.7s each),
 * plus one archive download per relevant filing (rare — the six-company
 * universe files ~1-2 documents per company per year).
 */
export async function syncRange(
  fromDate: string,
  toDate: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  let datesProcessed = 0;
  let filingsStored = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const date of dateRange(fromDate, toDate)) {
    const listed = await listFilingsForDate(date);
    const relevant = listed.filter(isRelevant);

    let stored = 0;
    for (const doc of relevant) {
      // Skip filings already ingested with extracted text.
      const existing = getFiling(doc.docID);
      if (existing !== null && existing.riskText !== null) continue;

      const archive = await fetchFilingArchive(doc.docID);
      const risk = extractRiskText(archive);

      upsertFiling({
        docId: doc.docID,
        edinetCode: doc.edinetCode ?? "",
        secCode: doc.secCode,
        filerName: doc.filerName,
        docTypeCode: doc.docTypeCode ?? "",
        periodStart: doc.periodStart,
        periodEnd: doc.periodEnd,
        submitDate: doc.submitDateTime?.slice(0, 10) ?? date,
        docDescription: doc.docDescription,
        riskText: risk?.text ?? null,
        riskTextSource: risk?.sourceEntry ?? null,
        fetchedAt: new Date().toISOString(),
      });
      stored += 1;
      filingsStored += 1;
    }

    setSyncCursor(date);
    datesProcessed += 1;
    firstDate ??= date;
    lastDate = date;
    onProgress?.({ date, listed: listed.length, relevant: relevant.length, stored });
  }

  return { datesProcessed, filingsStored, firstDate, lastDate };
}

export { getSyncCursor };
