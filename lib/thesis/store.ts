import "server-only";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type {
  JournalEntry,
  JournalEntryKind,
  Thesis,
  ThesisClaim,
  ThesisStatus,
  ThesisVersion,
  ThesisWithHistory,
} from "./types";

/**
 * Thesis journal store (T1). User-authored data in a local SQLite file.
 *
 * Integrity rules enforced at this layer:
 * - Versions are INSERT-only: revising creates version N+1; no UPDATE or
 *   DELETE statement for versions exists in this module.
 * - Journal entries are append-only for the same reason.
 * - Claims are stored inside their version (serialized), so historical
 *   versions keep exactly the claims they had.
 */

const DB_PATH = path.join(process.cwd(), "data", "user", "theses.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS theses (
    id TEXT PRIMARY KEY,
    subject_ref TEXT NOT NULL,
    subject_label TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    current_version INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS thesis_versions (
    thesis_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    edge TEXT,
    bear_case TEXT,
    time_horizon TEXT,
    claims_json TEXT NOT NULL,
    PRIMARY KEY (thesis_id, version)
  );
  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    thesis_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    text TEXT NOT NULL,
    version INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_journal_thesis
    ON journal_entries (thesis_id, created_at);
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

/** Test hook: point the store at a throwaway database. */
export function openThesisStoreAt(customPath: string): void {
  closeThesisStore();
  db = open(customPath);
}

export function closeThesisStore(): void {
  db?.close();
  db = null;
}

export interface NewThesisInput {
  subjectRef: string;
  subjectLabel: string;
  title: string;
  summary: string;
  edge: string | null;
  bearCase: string | null;
  timeHorizon: string | null;
  claims: Omit<ThesisClaim, "id">[];
}

export function createThesis(input: NewThesisInput): ThesisWithHistory {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const claims: ThesisClaim[] = input.claims.map((claim) => ({
    ...claim,
    id: crypto.randomUUID(),
  }));

  const database = getDb();
  const insert = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO theses (id, subject_ref, subject_label, status, created_at, updated_at, current_version)
         VALUES (?, ?, ?, 'active', ?, ?, 1)`
      )
      .run(id, input.subjectRef, input.subjectLabel, now, now);

    database
      .prepare(
        `INSERT INTO thesis_versions (thesis_id, version, created_at, title, summary, edge, bear_case, time_horizon, claims_json)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        now,
        input.title,
        input.summary,
        input.edge,
        input.bearCase,
        input.timeHorizon,
        JSON.stringify(claims)
      );

    appendJournalInternal(database, id, "created", now, "Thesis created.", 1);
  });
  insert();

  return getThesis(id)!;
}

export interface ReviseThesisInput {
  title: string;
  summary: string;
  edge: string | null;
  bearCase: string | null;
  timeHorizon: string | null;
  claims: Array<Omit<ThesisClaim, "id"> & { id?: string }>;
  /** Required: why the thesis changed — recorded in the journal. */
  revisionNote: string;
}

export function reviseThesis(
  thesisId: string,
  input: ReviseThesisInput
): ThesisWithHistory | null {
  const existing = getThesis(thesisId);
  if (existing === null) return null;

  // A claim id may only be carried over from THIS thesis's history —
  // foreign or invented ids get replaced so claim continuity stays honest.
  const knownClaimIds = new Set(
    existing.versions.flatMap((version) => version.claims.map((c) => c.id))
  );

  const now = new Date().toISOString();
  const nextVersion = existing.currentVersion + 1;
  const claims: ThesisClaim[] = input.claims.map((claim) => ({
    ...claim,
    id:
      claim.id !== undefined && knownClaimIds.has(claim.id)
        ? claim.id
        : crypto.randomUUID(),
  }));

  const database = getDb();
  const revise = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO thesis_versions (thesis_id, version, created_at, title, summary, edge, bear_case, time_horizon, claims_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        thesisId,
        nextVersion,
        now,
        input.title,
        input.summary,
        input.edge,
        input.bearCase,
        input.timeHorizon,
        JSON.stringify(claims)
      );

    database
      .prepare(`UPDATE theses SET current_version = ?, updated_at = ? WHERE id = ?`)
      .run(nextVersion, now, thesisId);

    appendJournalInternal(
      database,
      thesisId,
      "revised",
      now,
      input.revisionNote,
      nextVersion
    );
  });
  revise();

  return getThesis(thesisId);
}

export function setThesisStatus(
  thesisId: string,
  status: ThesisStatus,
  note: string
): ThesisWithHistory | null {
  const existing = getThesis(thesisId);
  if (existing === null) return null;

  const now = new Date().toISOString();
  const database = getDb();
  const update = database.transaction(() => {
    database
      .prepare(`UPDATE theses SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, thesisId);
    appendJournalInternal(
      database,
      thesisId,
      "status-changed",
      now,
      note,
      null
    );
  });
  update();

  return getThesis(thesisId);
}

export function appendNote(
  thesisId: string,
  text: string
): JournalEntry | null {
  if (getThesis(thesisId) === null) return null;
  const now = new Date().toISOString();
  const id = appendJournalInternal(getDb(), thesisId, "note", now, text, null);
  return {
    id,
    thesisId,
    kind: "note",
    createdAt: now,
    text,
    version: null,
  };
}

function appendJournalInternal(
  database: Database.Database,
  thesisId: string,
  kind: JournalEntryKind,
  createdAt: string,
  text: string,
  version: number | null
): string {
  const id = crypto.randomUUID();
  database
    .prepare(
      `INSERT INTO journal_entries (id, thesis_id, kind, created_at, text, version)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, thesisId, kind, createdAt, text, version);
  return id;
}

interface ThesisRow {
  id: string;
  subject_ref: string;
  subject_label: string;
  status: string;
  created_at: string;
  updated_at: string;
  current_version: number;
}

interface VersionRow {
  version: number;
  created_at: string;
  title: string;
  summary: string;
  edge: string | null;
  bear_case: string | null;
  time_horizon: string | null;
  claims_json: string;
}

function toThesis(row: ThesisRow): Thesis {
  return {
    id: row.id,
    subjectRef: row.subject_ref,
    subjectLabel: row.subject_label,
    status: row.status as ThesisStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentVersion: row.current_version,
  };
}

function toVersion(row: VersionRow): ThesisVersion {
  return {
    version: row.version,
    createdAt: row.created_at,
    title: row.title,
    summary: row.summary,
    edge: row.edge,
    bearCase: row.bear_case,
    timeHorizon: row.time_horizon,
    claims: JSON.parse(row.claims_json) as ThesisClaim[],
  };
}

export function listTheses(): Thesis[] {
  const rows = getDb()
    .prepare(`SELECT * FROM theses ORDER BY updated_at DESC`)
    .all() as ThesisRow[];
  return rows.map(toThesis);
}

export function getThesis(thesisId: string): ThesisWithHistory | null {
  const row = getDb()
    .prepare(`SELECT * FROM theses WHERE id = ?`)
    .get(thesisId) as ThesisRow | undefined;
  if (row === undefined) return null;

  const versions = (
    getDb()
      .prepare(
        `SELECT version, created_at, title, summary, edge, bear_case, time_horizon, claims_json
         FROM thesis_versions WHERE thesis_id = ? ORDER BY version ASC`
      )
      .all(thesisId) as VersionRow[]
  ).map(toVersion);

  return { ...toThesis(row), versions };
}

export function listJournal(thesisId: string): JournalEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, thesis_id, kind, created_at, text, version
       FROM journal_entries WHERE thesis_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(thesisId) as Array<{
    id: string;
    thesis_id: string;
    kind: string;
    created_at: string;
    text: string;
    version: number | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    thesisId: row.thesis_id,
    kind: row.kind as JournalEntryKind,
    createdAt: row.created_at,
    text: row.text,
    version: row.version,
  }));
}

export function countTheses(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM theses`).get() as {
    n: number;
  };
  return row.n;
}
