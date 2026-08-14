import "server-only";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { ClaimEvaluation, EvidenceClassification } from "./types";

/**
 * Evaluation store (C1). Separate SQLite file next to the thesis store.
 * Evaluations are append-only history: a new run inserts new rows; user
 * overrides annotate a row but never replace the AI classification.
 */

const DB_PATH = path.join(process.cwd(), "data", "user", "evaluations.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS claim_evaluations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    thesis_id TEXT NOT NULL,
    thesis_version INTEGER NOT NULL,
    claim_id TEXT NOT NULL,
    claim_statement TEXT NOT NULL,
    classification TEXT NOT NULL,
    rationale TEXT NOT NULL,
    evidence_excerpts_json TEXT NOT NULL,
    evidence_summary TEXT NOT NULL,
    evidence_as_of TEXT,
    model_id TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_override TEXT,
    user_override_note TEXT,
    user_override_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_eval_thesis
    ON claim_evaluations (thesis_id, created_at DESC);
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
export function openEvaluationStoreAt(customPath: string): void {
  closeEvaluationStore();
  db = open(customPath);
}

export function closeEvaluationStore(): void {
  db?.close();
  db = null;
}

export interface NewEvaluationRow {
  thesisId: string;
  thesisVersion: number;
  claimId: string;
  claimStatement: string;
  classification: EvidenceClassification;
  rationale: string;
  evidenceExcerpts: string[];
  evidenceSummary: string;
  evidenceAsOf: string | null;
  modelId: string;
  promptVersion: string;
}

export function insertEvaluationRun(
  rows: NewEvaluationRow[]
): { runId: string; createdAt: string } {
  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const database = getDb();

  const insert = database.transaction(() => {
    const statement = database.prepare(
      `INSERT INTO claim_evaluations (
        id, run_id, thesis_id, thesis_version, claim_id, claim_statement,
        classification, rationale, evidence_excerpts_json, evidence_summary,
        evidence_as_of, model_id, prompt_version, created_at,
        user_override, user_override_note, user_override_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
    );
    for (const row of rows) {
      statement.run(
        crypto.randomUUID(),
        runId,
        row.thesisId,
        row.thesisVersion,
        row.claimId,
        row.claimStatement,
        row.classification,
        row.rationale,
        JSON.stringify(row.evidenceExcerpts),
        row.evidenceSummary,
        row.evidenceAsOf,
        row.modelId,
        row.promptVersion,
        createdAt
      );
    }
  });
  insert();

  return { runId, createdAt };
}

interface EvaluationRow {
  id: string;
  run_id: string;
  thesis_id: string;
  thesis_version: number;
  claim_id: string;
  claim_statement: string;
  classification: string;
  rationale: string;
  evidence_excerpts_json: string;
  evidence_summary: string;
  evidence_as_of: string | null;
  model_id: string;
  prompt_version: string;
  created_at: string;
  user_override: string | null;
  user_override_note: string | null;
  user_override_at: string | null;
}

function toEvaluation(row: EvaluationRow): ClaimEvaluation {
  return {
    id: row.id,
    thesisId: row.thesis_id,
    thesisVersion: row.thesis_version,
    claimId: row.claim_id,
    claimStatement: row.claim_statement,
    classification: row.classification as EvidenceClassification,
    rationale: row.rationale,
    evidenceExcerpts: JSON.parse(row.evidence_excerpts_json) as string[],
    evidenceSummary: row.evidence_summary,
    evidenceAsOf: row.evidence_as_of,
    modelId: row.model_id,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    userOverride: row.user_override as EvidenceClassification | null,
    userOverrideNote: row.user_override_note,
    userOverrideAt: row.user_override_at,
  };
}

/** All evaluations for a thesis, newest run first, grouped by run. */
export function listEvaluationRuns(thesisId: string): Array<{
  runId: string;
  createdAt: string;
  thesisVersion: number;
  evaluations: ClaimEvaluation[];
}> {
  // MAX(rowid) per run breaks same-millisecond ties between runs
  // deterministically (newest insert first) while claim_id keeps the
  // within-run ordering stable.
  const rows = getDb()
    .prepare(
      `SELECT ce.* FROM claim_evaluations ce
       JOIN (
         SELECT run_id, MAX(rowid) AS max_rowid
         FROM claim_evaluations WHERE thesis_id = ?
         GROUP BY run_id
       ) runs ON runs.run_id = ce.run_id
       WHERE ce.thesis_id = ?
       ORDER BY ce.created_at DESC, runs.max_rowid DESC, ce.claim_id ASC`
    )
    .all(thesisId, thesisId) as EvaluationRow[];

  const runs = new Map<
    string,
    { runId: string; createdAt: string; thesisVersion: number; evaluations: ClaimEvaluation[] }
  >();
  for (const row of rows) {
    let run = runs.get(row.run_id);
    if (run === undefined) {
      run = {
        runId: row.run_id,
        createdAt: row.created_at,
        thesisVersion: row.thesis_version,
        evaluations: [],
      };
      runs.set(row.run_id, run);
    }
    run.evaluations.push(toEvaluation(row));
  }
  return [...runs.values()];
}

export function getEvaluation(evaluationId: string): ClaimEvaluation | null {
  const row = getDb()
    .prepare(`SELECT * FROM claim_evaluations WHERE id = ?`)
    .get(evaluationId) as EvaluationRow | undefined;
  return row === undefined ? null : toEvaluation(row);
}

/** Record a user override — annotates, never replaces, the AI result. */
export function setUserOverride(
  evaluationId: string,
  override: EvidenceClassification,
  note: string
): ClaimEvaluation | null {
  const existing = getEvaluation(evaluationId);
  if (existing === null) return null;

  getDb()
    .prepare(
      `UPDATE claim_evaluations
       SET user_override = ?, user_override_note = ?, user_override_at = ?
       WHERE id = ?`
    )
    .run(override, note, new Date().toISOString(), evaluationId);

  return getEvaluation(evaluationId);
}
