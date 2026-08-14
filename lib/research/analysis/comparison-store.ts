import "server-only";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { NarrativeComparison } from "./types";

/**
 * Persistent store for AI narrative comparisons (R2 US / R3 JP).
 *
 * Design: a HISTORY, not a cache. Every generated comparison is kept —
 * comparisons cost real money and regenerating with a newer model or
 * prompt should never destroy the earlier result (the pair is itself
 * informative). "Latest for a subject+filing-pair" is the default read;
 * regeneration simply appends a new row.
 */

const DB_PATH = path.join(process.cwd(), "data", "user", "comparisons.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS narrative_comparisons (
    id TEXT PRIMARY KEY,
    subject_ref TEXT NOT NULL,
    section_title TEXT NOT NULL,
    current_source TEXT NOT NULL,
    prior_source TEXT NOT NULL,
    current_ref_json TEXT NOT NULL,
    prior_ref_json TEXT NOT NULL,
    cross_lingual_note TEXT,
    comparison_json TEXT NOT NULL,
    model_id TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comparisons_subject
    ON narrative_comparisons (subject_ref, created_at DESC);
`;

let db: Database.Database | null = null;

function open(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const opened = new Database(dbPath);
  opened.pragma("journal_mode = WAL");
  opened.exec(SCHEMA);
  return opened;
}

function getDb(): Database.Database {
  if (db === null) db = open(DB_PATH);
  return db;
}

/** Test hook. */
export function openComparisonStoreAt(customPath: string): void {
  closeComparisonStore();
  db = open(customPath);
}

export function closeComparisonStore(): void {
  db?.close();
  db = null;
}

export interface StoredComparison {
  id: string;
  subjectRef: string;
  sectionTitle: string;
  /** Stable identifiers of the filing pair (accession numbers / docIds). */
  currentSource: string;
  priorSource: string;
  /** Serialized filing refs, shape owned by the calling service. */
  currentRef: unknown;
  priorRef: unknown;
  crossLingualNote: string | null;
  comparison: NarrativeComparison;
  createdAt: string;
}

interface ComparisonRow {
  id: string;
  subject_ref: string;
  section_title: string;
  current_source: string;
  prior_source: string;
  current_ref_json: string;
  prior_ref_json: string;
  cross_lingual_note: string | null;
  comparison_json: string;
  model_id: string;
  prompt_version: string;
  created_at: string;
}

function toStored(row: ComparisonRow): StoredComparison {
  return {
    id: row.id,
    subjectRef: row.subject_ref,
    sectionTitle: row.section_title,
    currentSource: row.current_source,
    priorSource: row.prior_source,
    currentRef: JSON.parse(row.current_ref_json),
    priorRef: JSON.parse(row.prior_ref_json),
    crossLingualNote: row.cross_lingual_note,
    comparison: JSON.parse(row.comparison_json) as NarrativeComparison,
    createdAt: row.created_at,
  };
}

export interface SaveComparisonInput {
  subjectRef: string;
  sectionTitle: string;
  currentSource: string;
  priorSource: string;
  currentRef: unknown;
  priorRef: unknown;
  crossLingualNote: string | null;
  comparison: NarrativeComparison;
}

export function saveComparison(input: SaveComparisonInput): StoredComparison {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO narrative_comparisons (
        id, subject_ref, section_title, current_source, prior_source,
        current_ref_json, prior_ref_json, cross_lingual_note,
        comparison_json, model_id, prompt_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.subjectRef,
      input.sectionTitle,
      input.currentSource,
      input.priorSource,
      JSON.stringify(input.currentRef),
      JSON.stringify(input.priorRef),
      input.crossLingualNote,
      JSON.stringify(input.comparison),
      input.comparison.modelId,
      input.comparison.promptVersion,
      createdAt
    );
  return {
    id,
    subjectRef: input.subjectRef,
    sectionTitle: input.sectionTitle,
    currentSource: input.currentSource,
    priorSource: input.priorSource,
    currentRef: input.currentRef,
    priorRef: input.priorRef,
    crossLingualNote: input.crossLingualNote,
    comparison: input.comparison,
    createdAt,
  };
}

/**
 * Latest comparison for a subject's CURRENT filing pair — a new filing
 * naturally invalidates (different pair → no match → fresh generation).
 * Model/prompt do NOT filter the read: the latest result is shown even if
 * config changed; regeneration is an explicit user action.
 */
export function getLatestComparison(
  subjectRef: string,
  currentSource: string,
  priorSource: string
): StoredComparison | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM narrative_comparisons
       WHERE subject_ref = ? AND current_source = ? AND prior_source = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT 1`
    )
    .get(subjectRef, currentSource, priorSource) as ComparisonRow | undefined;
  return row === undefined ? null : toStored(row);
}

/** Full history for a subject, newest first. */
export function listComparisons(subjectRef: string): StoredComparison[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM narrative_comparisons
       WHERE subject_ref = ?
       ORDER BY created_at DESC, rowid DESC`
    )
    .all(subjectRef) as ComparisonRow[];
  return rows.map(toStored);
}
