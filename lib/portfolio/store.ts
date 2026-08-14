import "server-only";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { PriceMark, Transaction } from "./types";

/**
 * Portfolio store (P1). Transactions and price marks in the user database.
 * Transactions may be deleted (a mistaken entry is the user's own ledger to
 * correct — unlike thesis history, this is bookkeeping, not a record of
 * reasoning); deletions are the only mutation, edits are delete+re-add.
 */

const DB_PATH = path.join(process.cwd(), "data", "user", "portfolio.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    subject_ref TEXT NOT NULL,
    subject_label TEXT NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    quantity REAL,
    price REAL,
    amount REAL,
    fee REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tx_subject
    ON transactions (subject_ref, date);
  CREATE TABLE IF NOT EXISTS price_marks (
    id TEXT PRIMARY KEY,
    subject_ref TEXT NOT NULL,
    currency TEXT NOT NULL,
    price REAL NOT NULL,
    as_of TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_marks_subject
    ON price_marks (subject_ref, as_of DESC);
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
export function openPortfolioStoreAt(customPath: string): void {
  closePortfolioStore();
  db = open(customPath);
}

export function closePortfolioStore(): void {
  db?.close();
  db = null;
}

export interface NewTransactionInput {
  subjectRef: string;
  subjectLabel: string;
  currency: "USD" | "JPY";
  kind: "buy" | "sell" | "dividend";
  date: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fee: number;
  note: string | null;
}

export function insertTransaction(input: NewTransactionInput): Transaction {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO transactions (
        id, subject_ref, subject_label, currency, kind, date,
        quantity, price, amount, fee, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.subjectRef,
      input.subjectLabel,
      input.currency,
      input.kind,
      input.date,
      input.quantity,
      input.price,
      input.amount,
      input.fee,
      input.note,
      createdAt
    );
  return { id, createdAt, ...input };
}

export function deleteTransaction(id: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM transactions WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

interface TransactionRow {
  id: string;
  subject_ref: string;
  subject_label: string;
  currency: string;
  kind: string;
  date: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fee: number;
  note: string | null;
  created_at: string;
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    subjectRef: row.subject_ref,
    subjectLabel: row.subject_label,
    currency: row.currency as "USD" | "JPY",
    kind: row.kind as Transaction["kind"],
    date: row.date,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    fee: row.fee,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function listTransactions(subjectRef?: string): Transaction[] {
  const rows = (
    subjectRef === undefined
      ? getDb()
          .prepare(`SELECT * FROM transactions ORDER BY date ASC, created_at ASC`)
          .all()
      : getDb()
          .prepare(
            `SELECT * FROM transactions WHERE subject_ref = ?
             ORDER BY date ASC, created_at ASC`
          )
          .all(subjectRef)
  ) as TransactionRow[];
  return rows.map(toTransaction);
}

export function getTransaction(id: string): Transaction | null {
  const row = getDb()
    .prepare(`SELECT * FROM transactions WHERE id = ?`)
    .get(id) as TransactionRow | undefined;
  return row === undefined ? null : toTransaction(row);
}

export interface NewPriceMarkInput {
  subjectRef: string;
  currency: "USD" | "JPY";
  price: number;
  asOf: string;
}

export function insertPriceMark(input: NewPriceMarkInput): PriceMark {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO price_marks (id, subject_ref, currency, price, as_of, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.subjectRef, input.currency, input.price, input.asOf, createdAt);
  return { id, createdAt, ...input };
}

/** Latest mark per subject: newest as_of wins; created_at breaks ties. */
export function getLatestMark(subjectRef: string): PriceMark | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM price_marks WHERE subject_ref = ?
       ORDER BY as_of DESC, created_at DESC LIMIT 1`
    )
    .get(subjectRef) as
    | {
        id: string;
        subject_ref: string;
        currency: string;
        price: number;
        as_of: string;
        created_at: string;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    id: row.id,
    subjectRef: row.subject_ref,
    currency: row.currency as "USD" | "JPY",
    price: row.price,
    asOf: row.as_of,
    createdAt: row.created_at,
  };
}

export function countTransactions(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM transactions`)
    .get() as { n: number };
  return row.n;
}
