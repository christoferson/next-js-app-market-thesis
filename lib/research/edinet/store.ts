import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Local EDINET filing store (R3). SQLite in a single gitignored file —
 * EDINET is date-indexed only, so filings must be ingested and indexed
 * locally before per-company queries are possible. The extracted risk
 * text is stored alongside the metadata so page loads never re-download
 * or re-parse multi-megabyte archives.
 */

const DB_PATH = path.join(process.cwd(), "data", "edinet", "filings.sqlite");

export interface StoredFiling {
  docId: string;
  edinetCode: string;
  secCode: string | null;
  filerName: string | null;
  docTypeCode: string;
  periodStart: string | null;
  periodEnd: string | null;
  submitDate: string;
  docDescription: string | null;
  /** Extracted 事業等のリスク text, when extraction succeeded. */
  riskText: string | null;
  riskTextSource: string | null;
  fetchedAt: string;
}

export interface SyncCursor {
  /** Last calendar date (inclusive) whose list has been ingested. */
  lastSyncedDate: string | null;
}

let db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS filings (
    doc_id TEXT PRIMARY KEY,
    edinet_code TEXT NOT NULL,
    sec_code TEXT,
    filer_name TEXT,
    doc_type_code TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    submit_date TEXT NOT NULL,
    doc_description TEXT,
    risk_text TEXT,
    risk_text_source TEXT,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_filings_company
    ON filings (edinet_code, doc_type_code, submit_date DESC);
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function open(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const opened = new Database(dbPath);
  opened.pragma("journal_mode = WAL");
  opened.exec(SCHEMA);
  return opened;
}

function getDb(): Database.Database {
  if (db === null) {
    db = open(DB_PATH);
  }
  return db;
}

/** Test hook: point the store at a throwaway database. */
export function openStoreAt(customPath: string): void {
  closeStore();
  db = open(customPath);
}

export function closeStore(): void {
  db?.close();
  db = null;
}

export function upsertFiling(filing: StoredFiling): void {
  getDb()
    .prepare(
      `INSERT INTO filings (
        doc_id, edinet_code, sec_code, filer_name, doc_type_code,
        period_start, period_end, submit_date, doc_description,
        risk_text, risk_text_source, fetched_at
      ) VALUES (
        @docId, @edinetCode, @secCode, @filerName, @docTypeCode,
        @periodStart, @periodEnd, @submitDate, @docDescription,
        @riskText, @riskTextSource, @fetchedAt
      )
      ON CONFLICT(doc_id) DO UPDATE SET
        risk_text = excluded.risk_text,
        risk_text_source = excluded.risk_text_source,
        fetched_at = excluded.fetched_at`
    )
    .run(filing);
}

interface FilingRow {
  doc_id: string;
  edinet_code: string;
  sec_code: string | null;
  filer_name: string | null;
  doc_type_code: string;
  period_start: string | null;
  period_end: string | null;
  submit_date: string;
  doc_description: string | null;
  risk_text: string | null;
  risk_text_source: string | null;
  fetched_at: string;
}

function toFiling(row: FilingRow): StoredFiling {
  return {
    docId: row.doc_id,
    edinetCode: row.edinet_code,
    secCode: row.sec_code,
    filerName: row.filer_name,
    docTypeCode: row.doc_type_code,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    submitDate: row.submit_date,
    docDescription: row.doc_description,
    riskText: row.risk_text,
    riskTextSource: row.risk_text_source,
    fetchedAt: row.fetched_at,
  };
}

/** Most recent filings of one type for a company, newest first. */
export function listCompanyFilings(
  edinetCode: string,
  docTypeCode: string,
  limit = 10
): StoredFiling[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM filings
       WHERE edinet_code = ? AND doc_type_code = ?
       ORDER BY submit_date DESC
       LIMIT ?`
    )
    .all(edinetCode, docTypeCode, limit) as FilingRow[];
  return rows.map(toFiling);
}

export function getFiling(docId: string): StoredFiling | null {
  const row = getDb()
    .prepare(`SELECT * FROM filings WHERE doc_id = ?`)
    .get(docId) as FilingRow | undefined;
  return row === undefined ? null : toFiling(row);
}

export function getSyncCursor(): SyncCursor {
  const row = getDb()
    .prepare(`SELECT value FROM sync_state WHERE key = 'last_synced_date'`)
    .get() as { value: string } | undefined;
  return { lastSyncedDate: row?.value ?? null };
}

export function setSyncCursor(date: string): void {
  getDb()
    .prepare(
      `INSERT INTO sync_state (key, value) VALUES ('last_synced_date', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(date);
}

export function countFilings(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM filings`)
    .get() as { n: number };
  return row.n;
}
