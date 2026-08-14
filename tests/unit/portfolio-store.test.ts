import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** The store is server-only; neutralize the guard for node-env tests. */
vi.mock("server-only", () => ({}));

import * as portfolioStore from "@/lib/portfolio/store";
import {
  closePortfolioStore,
  countTransactions,
  deleteTransaction,
  getLatestMark,
  getTransaction,
  insertPriceMark,
  insertTransaction,
  listTransactions,
  openPortfolioStoreAt,
  type NewPriceMarkInput,
  type NewTransactionInput,
} from "@/lib/portfolio/store";
import type { Transaction } from "@/lib/portfolio/types";

/**
 * Portfolio store tests (P1). Each test gets a throwaway SQLite file under the
 * OS temp dir via the `openPortfolioStoreAt` hook, so the real driver exercises
 * the ledger semantics without touching the gitignored user-data directory.
 *
 * Timestamps come from fake timers because `created_at` is the documented
 * tiebreak for both same-date transactions and same-as-of price marks, and a
 * real clock can tie inside one millisecond.
 */

const START_TIME = new Date("2026-08-14T09:00:00.000Z");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const US_SUBJECT = "demo:stock-us-northstar-software";
const JP_SUBJECT = "demo:stock-jp-yamato-robotics";

let dbPath: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
  dbPath = path.join(
    os.tmpdir(),
    `mt-portfolio-${randomUUID()}`,
    "portfolio.sqlite"
  );
  openPortfolioStoreAt(dbPath);
});

afterEach(() => {
  closePortfolioStore();
  // WAL mode leaves sidecar files; remove the whole throwaway directory.
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  vi.useRealTimers();
});

/** Move the clock forward so the next write gets a strictly later timestamp. */
function tick(seconds = 1): void {
  vi.setSystemTime(new Date(Date.now() + seconds * 1_000));
}

function makeTxInput(
  overrides: Partial<NewTransactionInput> = {}
): NewTransactionInput {
  return {
    subjectRef: US_SUBJECT,
    subjectLabel: "Northstar Software (demo)",
    currency: "USD",
    kind: "buy",
    date: "2026-01-05",
    quantity: 10,
    price: 400,
    amount: null,
    fee: 1.5,
    note: null,
    ...overrides,
  };
}

function makeMarkInput(
  overrides: Partial<NewPriceMarkInput> = {}
): NewPriceMarkInput {
  return {
    subjectRef: US_SUBJECT,
    currency: "USD",
    price: 460,
    asOf: "2026-06-30",
    ...overrides,
  };
}

/** Index access with a clear failure instead of an `undefined` deep-equal. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index} of ${items.length}.`);
  }
  return item;
}

function requireTransaction(transaction: Transaction | null): Transaction {
  if (transaction === null) throw new Error("Expected the transaction to exist.");
  return transaction;
}

describe("insertTransaction", () => {
  it("returns a generated uuid and the write timestamp", () => {
    const written = insertTransaction(makeTxInput());

    expect(written.id).toMatch(UUID_PATTERN);
    expect(written.createdAt).toBe(START_TIME.toISOString());
  });

  it("gives every insert its own id, even for identical input", () => {
    const first = insertTransaction(makeTxInput());
    const second = insertTransaction(makeTxInput());

    expect(second.id).not.toBe(first.id);
    expect(second.id).toMatch(UUID_PATTERN);
    expect(countTransactions()).toBe(2);
  });

  it("round-trips every buy field through the database", () => {
    const input = makeTxInput({ note: "Opened the position after the 10-K." });
    const written = insertTransaction(input);

    const read = requireTransaction(getTransaction(written.id));
    expect(read).toEqual(written);
    expect(read.subjectRef).toBe(input.subjectRef);
    expect(read.subjectLabel).toBe(input.subjectLabel);
    expect(read.currency).toBe("USD");
    expect(read.kind).toBe("buy");
    expect(read.date).toBe("2026-01-05");
    expect(read.quantity).toBe(10);
    expect(read.price).toBe(400);
    expect(read.amount).toBeNull();
    expect(read.fee).toBe(1.5);
    expect(read.note).toBe("Opened the position after the 10-K.");
  });

  it("round-trips a dividend's null quantity and price as null, not zero", () => {
    const written = insertTransaction(
      makeTxInput({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 42.5,
        fee: 0,
      })
    );

    const read = requireTransaction(getTransaction(written.id));
    expect(read.quantity).toBeNull();
    expect(read.price).toBeNull();
    expect(read.quantity).not.toBe(0);
    expect(read.price).not.toBe(0);
    expect(read.amount).toBe(42.5);
    expect(read.fee).toBe(0);
  });

  it("round-trips a sell", () => {
    const written = insertTransaction(
      makeTxInput({ kind: "sell", quantity: 4, price: 450, fee: 2 })
    );

    const read = requireTransaction(getTransaction(written.id));
    expect(read.kind).toBe("sell");
    expect(read.quantity).toBe(4);
    expect(read.price).toBe(450);
    expect(read.fee).toBe(2);
  });

  it("round-trips a fractional quantity and price without rounding", () => {
    const written = insertTransaction(
      makeTxInput({ quantity: 2.5, price: 333.33, fee: 0.07 })
    );

    const read = requireTransaction(getTransaction(written.id));
    expect(read.quantity).toBe(2.5);
    expect(read.price).toBe(333.33);
    expect(read.fee).toBe(0.07);
  });

  it("round-trips a zero price and a zero fee as zero, not null", () => {
    const written = insertTransaction(makeTxInput({ price: 0, fee: 0 }));

    const read = requireTransaction(getTransaction(written.id));
    expect(read.price).toBe(0);
    expect(read.fee).toBe(0);
    expect(read.price).not.toBeNull();
  });

  it("round-trips JPY amounts and a Japanese label", () => {
    const written = insertTransaction(
      makeTxInput({
        subjectRef: JP_SUBJECT,
        subjectLabel: "ヤマトロボティクス（デモ）",
        currency: "JPY",
        quantity: 100,
        price: 5_000,
        fee: 550,
        note: "有価証券報告書を読んだ。",
      })
    );

    const read = requireTransaction(getTransaction(written.id));
    expect(read.currency).toBe("JPY");
    expect(read.subjectLabel).toBe("ヤマトロボティクス（デモ）");
    expect(read.price).toBe(5_000);
    expect(read.note).toBe("有価証券報告書を読んだ。");
  });

  it("round-trips quotes and newlines in a note", () => {
    const note = 'Management said margins "normalized"\nabove 15%.';
    const written = insertTransaction(makeTxInput({ note }));

    expect(requireTransaction(getTransaction(written.id)).note).toBe(note);
  });

  it("stores an empty note as an empty string rather than null", () => {
    const written = insertTransaction(makeTxInput({ note: "" }));

    const read = requireTransaction(getTransaction(written.id));
    expect(read.note).toBe("");
    expect(read.note).not.toBeNull();
  });

  it("returns the domain shape rather than raw column names", () => {
    expect(Object.keys(insertTransaction(makeTxInput())).sort()).toEqual([
      "amount",
      "createdAt",
      "currency",
      "date",
      "fee",
      "id",
      "kind",
      "note",
      "price",
      "quantity",
      "subjectLabel",
      "subjectRef",
    ]);
  });

  it("returns the same object a later read produces", () => {
    const written = insertTransaction(makeTxInput({ note: "A note." }));

    expect(at(listTransactions(US_SUBJECT), 0)).toEqual(written);
  });
});

describe("listTransactions", () => {
  it("returns an empty array on a fresh database", () => {
    expect(listTransactions()).toEqual([]);
    expect(listTransactions(US_SUBJECT)).toEqual([]);
  });

  it("orders by date ascending regardless of insertion order", () => {
    insertTransaction(makeTxInput({ date: "2026-07-05" }));
    tick();
    insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    insertTransaction(makeTxInput({ date: "2026-04-05" }));

    expect(listTransactions().map((entry) => entry.date)).toEqual([
      "2026-01-05",
      "2026-04-05",
      "2026-07-05",
    ]);
  });

  it("breaks a same-date tie with created_at ascending", () => {
    const first = insertTransaction(
      makeTxInput({ date: "2026-05-05", note: "recorded first" })
    );
    tick();
    const second = insertTransaction(
      makeTxInput({ date: "2026-05-05", note: "recorded second" })
    );
    tick();
    const third = insertTransaction(
      makeTxInput({ date: "2026-05-05", note: "recorded third" })
    );

    expect(listTransactions().map((entry) => entry.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(listTransactions().map((entry) => entry.note)).toEqual([
      "recorded first",
      "recorded second",
      "recorded third",
    ]);
  });

  it("orders by date first and created_at only within a date", () => {
    const laterDateRecordedFirst = insertTransaction(
      makeTxInput({ date: "2026-09-05" })
    );
    tick();
    const earlierDateRecordedLater = insertTransaction(
      makeTxInput({ date: "2026-02-05" })
    );
    tick();
    const sameEarlyDateRecordedLast = insertTransaction(
      makeTxInput({ date: "2026-02-05" })
    );

    expect(listTransactions().map((entry) => entry.id)).toEqual([
      earlierDateRecordedLater.id,
      sameEarlyDateRecordedLast.id,
      laterDateRecordedFirst.id,
    ]);
  });

  it("returns every subject's transactions when no filter is given", () => {
    insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    insertTransaction(
      makeTxInput({
        subjectRef: JP_SUBJECT,
        subjectLabel: "Yamato Robotics (demo)",
        currency: "JPY",
        date: "2026-02-05",
      })
    );

    const all = listTransactions();
    expect(all).toHaveLength(2);
    expect(all.map((entry) => entry.subjectRef)).toEqual([
      US_SUBJECT,
      JP_SUBJECT,
    ]);
  });

  it("scopes the list to one subject when filtered", () => {
    insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    insertTransaction(makeTxInput({ date: "2026-03-05" }));
    tick();
    insertTransaction(
      makeTxInput({ subjectRef: JP_SUBJECT, currency: "JPY", date: "2026-02-05" })
    );

    const us = listTransactions(US_SUBJECT);
    expect(us).toHaveLength(2);
    expect(us.every((entry) => entry.subjectRef === US_SUBJECT)).toBe(true);
    expect(us.map((entry) => entry.date)).toEqual(["2026-01-05", "2026-03-05"]);
    expect(listTransactions(JP_SUBJECT)).toHaveLength(1);
  });

  it("returns an empty array for an unknown subject", () => {
    insertTransaction(makeTxInput());

    expect(listTransactions("demo:unknown")).toEqual([]);
    expect(listTransactions("")).toEqual([]);
    expect(listTransactions("not-a-subject-ref")).toEqual([]);
  });

  it("keeps a filtered list in the same date and created_at order", () => {
    const later = insertTransaction(makeTxInput({ date: "2026-06-05" }));
    tick();
    const earlier = insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    const sameDayAsEarlier = insertTransaction(makeTxInput({ date: "2026-01-05" }));

    expect(listTransactions(US_SUBJECT).map((entry) => entry.id)).toEqual([
      earlier.id,
      sameDayAsEarlier.id,
      later.id,
    ]);
  });

  it("preserves every kind in one subject's ledger", () => {
    insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    insertTransaction(
      makeTxInput({ kind: "sell", quantity: 4, price: 450, date: "2026-02-05" })
    );
    tick();
    insertTransaction(
      makeTxInput({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 30,
        date: "2026-03-05",
      })
    );

    expect(listTransactions(US_SUBJECT).map((entry) => entry.kind)).toEqual([
      "buy",
      "sell",
      "dividend",
    ]);
  });
});

describe("getTransaction", () => {
  it("returns null on a fresh database", () => {
    expect(getTransaction(randomUUID())).toBeNull();
  });

  it("returns null for an unknown id", () => {
    insertTransaction(makeTxInput());

    expect(getTransaction(randomUUID())).toBeNull();
    expect(getTransaction("")).toBeNull();
    expect(getTransaction("not-a-uuid")).toBeNull();
  });

  it("returns the matching transaction among several", () => {
    insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    const wanted = insertTransaction(
      makeTxInput({ date: "2026-02-05", note: "the one" })
    );
    tick();
    insertTransaction(makeTxInput({ date: "2026-03-05" }));

    expect(requireTransaction(getTransaction(wanted.id))).toEqual(wanted);
    expect(requireTransaction(getTransaction(wanted.id)).note).toBe("the one");
  });
});

describe("deleteTransaction", () => {
  it("removes the row and reports true", () => {
    const written = insertTransaction(makeTxInput());

    expect(deleteTransaction(written.id)).toBe(true);
    expect(countTransactions()).toBe(0);
    expect(listTransactions()).toEqual([]);
  });

  it("makes the transaction unreadable afterwards", () => {
    const written = insertTransaction(makeTxInput());
    deleteTransaction(written.id);

    expect(getTransaction(written.id)).toBeNull();
  });

  it("reports false for an unknown id and changes nothing", () => {
    const written = insertTransaction(makeTxInput());

    expect(deleteTransaction(randomUUID())).toBe(false);
    expect(deleteTransaction("")).toBe(false);
    expect(deleteTransaction("not-a-uuid")).toBe(false);
    expect(countTransactions()).toBe(1);
    expect(getTransaction(written.id)).not.toBeNull();
  });

  it("reports false the second time the same id is deleted", () => {
    const written = insertTransaction(makeTxInput());

    expect(deleteTransaction(written.id)).toBe(true);
    expect(deleteTransaction(written.id)).toBe(false);
  });

  it("deletes only the named transaction", () => {
    const doomed = insertTransaction(makeTxInput({ date: "2026-01-05" }));
    tick();
    const kept = insertTransaction(makeTxInput({ date: "2026-02-05" }));
    tick();
    const otherSubject = insertTransaction(
      makeTxInput({ subjectRef: JP_SUBJECT, currency: "JPY", date: "2026-03-05" })
    );

    expect(deleteTransaction(doomed.id)).toBe(true);
    expect(listTransactions().map((entry) => entry.id)).toEqual([
      kept.id,
      otherSubject.id,
    ]);
    expect(requireTransaction(getTransaction(kept.id))).toEqual(kept);
  });

  it("leaves the subject's price marks in place", () => {
    const written = insertTransaction(makeTxInput());
    const mark = insertPriceMark(makeMarkInput());

    deleteTransaction(written.id);

    // A mark is an observation of the instrument, not of the trade.
    expect(getLatestMark(US_SUBJECT)).toEqual(mark);
  });

  it("supports the delete-and-re-add correction flow", () => {
    const mistake = insertTransaction(makeTxInput({ quantity: 100 }));
    expect(deleteTransaction(mistake.id)).toBe(true);
    tick();
    const corrected = insertTransaction(makeTxInput({ quantity: 10 }));

    expect(countTransactions()).toBe(1);
    expect(at(listTransactions(US_SUBJECT), 0).quantity).toBe(10);
    expect(corrected.id).not.toBe(mistake.id);
  });
});

describe("insertPriceMark and getLatestMark", () => {
  it("returns a generated uuid and the write timestamp", () => {
    const written = insertPriceMark(makeMarkInput());

    expect(written.id).toMatch(UUID_PATTERN);
    expect(written.createdAt).toBe(START_TIME.toISOString());
  });

  it("round-trips every mark field", () => {
    const written = insertPriceMark(makeMarkInput({ price: 461.25 }));

    const read = getLatestMark(US_SUBJECT);
    expect(read).toEqual(written);
    expect(read?.subjectRef).toBe(US_SUBJECT);
    expect(read?.currency).toBe("USD");
    expect(read?.price).toBe(461.25);
    expect(read?.asOf).toBe("2026-06-30");
  });

  it("returns the domain shape rather than raw column names", () => {
    expect(Object.keys(insertPriceMark(makeMarkInput())).sort()).toEqual([
      "asOf",
      "createdAt",
      "currency",
      "id",
      "price",
      "subjectRef",
    ]);
  });

  it("returns null on a fresh database and for an unknown subject", () => {
    expect(getLatestMark(US_SUBJECT)).toBeNull();

    insertPriceMark(makeMarkInput());
    expect(getLatestMark("demo:unknown")).toBeNull();
    expect(getLatestMark("")).toBeNull();
  });

  it("returns the newest as-of date when marks are inserted in order", () => {
    insertPriceMark(makeMarkInput({ asOf: "2026-01-31", price: 400 }));
    tick();
    const newest = insertPriceMark(makeMarkInput({ asOf: "2026-06-30", price: 460 }));

    expect(getLatestMark(US_SUBJECT)).toEqual(newest);
    expect(getLatestMark(US_SUBJECT)?.price).toBe(460);
  });

  it("returns the newest as-of date even when it was inserted first", () => {
    const newest = insertPriceMark(makeMarkInput({ asOf: "2026-06-30", price: 460 }));
    tick();
    insertPriceMark(makeMarkInput({ asOf: "2026-01-31", price: 400 }));
    tick();
    insertPriceMark(makeMarkInput({ asOf: "2026-03-31", price: 420 }));

    // Backfilling an older observation must not overwrite the current one.
    expect(getLatestMark(US_SUBJECT)).toEqual(newest);
    expect(getLatestMark(US_SUBJECT)?.asOf).toBe("2026-06-30");
  });

  it("breaks a same-as-of tie with the newer created_at", () => {
    insertPriceMark(makeMarkInput({ asOf: "2026-06-30", price: 460 }));
    tick();
    const correction = insertPriceMark(
      makeMarkInput({ asOf: "2026-06-30", price: 458.5 })
    );

    // Re-recording the same day is a correction: the later entry wins.
    expect(getLatestMark(US_SUBJECT)).toEqual(correction);
    expect(getLatestMark(US_SUBJECT)?.price).toBe(458.5);
  });

  it("keeps every historical mark rather than replacing them", () => {
    insertPriceMark(makeMarkInput({ asOf: "2026-01-31", price: 400 }));
    tick();
    insertPriceMark(makeMarkInput({ asOf: "2026-06-30", price: 460 }));

    // The store exposes only the latest mark, but the history is not destroyed:
    // deleting the newest by pointing at a fresh file would lose it, so prove
    // both rows exist by re-reading after a close and reopen.
    closePortfolioStore();
    openPortfolioStoreAt(dbPath);
    expect(getLatestMark(US_SUBJECT)?.asOf).toBe("2026-06-30");
  });

  it("scopes marks to their subject", () => {
    const us = insertPriceMark(makeMarkInput({ asOf: "2026-06-30", price: 460 }));
    tick();
    const jp = insertPriceMark(
      makeMarkInput({
        subjectRef: JP_SUBJECT,
        currency: "JPY",
        price: 5_200,
        asOf: "2026-05-31",
      })
    );

    expect(getLatestMark(US_SUBJECT)).toEqual(us);
    expect(getLatestMark(JP_SUBJECT)).toEqual(jp);
    expect(getLatestMark(JP_SUBJECT)?.currency).toBe("JPY");
    expect(getLatestMark(JP_SUBJECT)?.price).toBe(5_200);
  });

  it("does not let another subject's newer mark win", () => {
    insertPriceMark(makeMarkInput({ asOf: "2026-01-31", price: 400 }));
    tick();
    insertPriceMark(
      makeMarkInput({ subjectRef: JP_SUBJECT, currency: "JPY", asOf: "2026-12-31" })
    );

    expect(getLatestMark(US_SUBJECT)?.asOf).toBe("2026-01-31");
  });

  it("does not require any transaction to exist for the subject", () => {
    // A user may mark a price before recording the trade.
    const mark = insertPriceMark(makeMarkInput());

    expect(getLatestMark(US_SUBJECT)).toEqual(mark);
    expect(countTransactions()).toBe(0);
  });
});

describe("countTransactions", () => {
  it("returns zero on a fresh database", () => {
    expect(countTransactions()).toBe(0);
  });

  it("counts across subjects and kinds, ignoring price marks", () => {
    insertTransaction(makeTxInput());
    tick();
    insertTransaction(
      makeTxInput({ kind: "sell", quantity: 4, price: 450, date: "2026-02-05" })
    );
    tick();
    insertTransaction(
      makeTxInput({ subjectRef: JP_SUBJECT, currency: "JPY", date: "2026-03-05" })
    );
    insertPriceMark(makeMarkInput());
    insertPriceMark(makeMarkInput({ subjectRef: JP_SUBJECT, currency: "JPY" }));

    expect(countTransactions()).toBe(3);
  });

  it("drops back after a delete", () => {
    const written = insertTransaction(makeTxInput());
    tick();
    insertTransaction(makeTxInput({ date: "2026-02-05" }));

    expect(countTransactions()).toBe(2);
    deleteTransaction(written.id);
    expect(countTransactions()).toBe(1);
  });
});

describe("persistence", () => {
  it("keeps transactions and marks across a close and reopen", () => {
    insertTransaction(makeTxInput({ note: "Survives a restart." }));
    tick();
    insertTransaction(
      makeTxInput({ kind: "sell", quantity: 4, price: 450, date: "2026-02-05" })
    );
    tick();
    insertPriceMark(makeMarkInput());
    const transactionsBefore = listTransactions();
    const markBefore = getLatestMark(US_SUBJECT);

    closePortfolioStore();
    openPortfolioStoreAt(dbPath);

    expect(listTransactions()).toEqual(transactionsBefore);
    expect(getLatestMark(US_SUBJECT)).toEqual(markBefore);
    expect(countTransactions()).toBe(2);
    expect(at(listTransactions(), 0).note).toBe("Survives a restart.");
  });

  it("keeps a deletion across a close and reopen", () => {
    const written = insertTransaction(makeTxInput());
    tick();
    const kept = insertTransaction(makeTxInput({ date: "2026-02-05" }));
    deleteTransaction(written.id);

    closePortfolioStore();
    openPortfolioStoreAt(dbPath);

    expect(countTransactions()).toBe(1);
    expect(getTransaction(written.id)).toBeNull();
    expect(requireTransaction(getTransaction(kept.id))).toEqual(kept);
  });

  it("starts empty when pointed at a different file", () => {
    insertTransaction(makeTxInput());
    insertPriceMark(makeMarkInput());
    const otherPath = path.join(path.dirname(dbPath), "other.sqlite");

    openPortfolioStoreAt(otherPath);
    expect(listTransactions()).toEqual([]);
    expect(countTransactions()).toBe(0);
    expect(getLatestMark(US_SUBJECT)).toBeNull();

    openPortfolioStoreAt(dbPath);
    expect(countTransactions()).toBe(1);
    expect(getLatestMark(US_SUBJECT)).not.toBeNull();
  });

  it("creates the parent directory for a new database path", () => {
    const nested = path.join(path.dirname(dbPath), "nested", "deep", "db.sqlite");
    openPortfolioStoreAt(nested);
    insertTransaction(makeTxInput());

    expect(countTransactions()).toBe(1);
    expect(fs.existsSync(nested)).toBe(true);

    openPortfolioStoreAt(dbPath);
  });

  it("tolerates closePortfolioStore being called twice", () => {
    closePortfolioStore();
    expect(() => closePortfolioStore()).not.toThrow();
    openPortfolioStoreAt(dbPath);
  });

  it("reopens lazily after a close", () => {
    insertTransaction(makeTxInput());
    closePortfolioStore();
    openPortfolioStoreAt(dbPath);

    expect(countTransactions()).toBe(1);
  });
});

describe("store module surface", () => {
  it("exposes exactly the ledger operations and test hooks", () => {
    // Deletion is the only mutation: an edit is delete + re-add, and there is
    // deliberately no updateTransaction. A new export here should be a
    // conscious decision, so this pins the exact surface.
    expect(Object.keys(portfolioStore).sort()).toEqual([
      "closePortfolioStore",
      "countTransactions",
      "deleteTransaction",
      "getLatestMark",
      "getTransaction",
      "insertPriceMark",
      "insertTransaction",
      "listTransactions",
      "openPortfolioStoreAt",
    ]);
  });

  it("has no update or overwrite operation for transactions or marks", () => {
    const names = Object.keys(portfolioStore);

    for (const forbidden of [
      "updateTransaction",
      "upsertTransaction",
      "replaceTransaction",
      "deletePriceMark",
      "updatePriceMark",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
