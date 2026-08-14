import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateCurrencyTotals,
  calculatePosition,
  validateSellQuantity,
  type PositionInput,
} from "@/lib/portfolio/calculate";
import type { Position, PriceMark, Transaction } from "@/lib/portfolio/types";

/**
 * Portfolio arithmetic (P1). This is the financial-integrity file: the numbers
 * asserted here are what the user reads as their own cost basis and realized
 * gain, so the tests state exact arithmetic rather than "roughly right".
 *
 * The rules under test (lib/portfolio/calculate.ts):
 * - MOVING-AVERAGE cost basis. A buy raises the basis by price x quantity plus
 *   the fee; a sell lowers the basis by quantity x average cost and leaves the
 *   average cost per share untouched.
 * - Realized gain on a sell is proceeds NET OF FEE minus quantity x average
 *   cost, and it may be negative — losses are never clamped.
 * - A full exit reads as exactly zero shares with a null basis, never as float
 *   dust or a zero-cost holding.
 * - Missing data is null, never 0: no mark means no market value, not a value
 *   of nothing.
 * - USD and JPY totals are computed independently and never combined.
 *
 * Everything here is pure and deterministic: no clock, no database, no network.
 */

const SUBJECT = "demo:stock-us-northstar-software";
const LABEL = "Northstar Software (demo)";

/** Creation order drives the same-date tiebreak, so it is derived from a counter. */
const CREATED_BASE = Date.parse("2026-01-01T00:00:00.000Z");

let sequence = 0;

beforeEach(() => {
  sequence = 0;
});

/**
 * A buy of 10 shares at 100 with no fee, unless overridden. `id` and
 * `createdAt` both advance with creation order so "recorded later" is
 * expressible without hand-written timestamps.
 */
function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1;
  return {
    id: `tx-${String(sequence).padStart(3, "0")}`,
    subjectRef: SUBJECT,
    subjectLabel: LABEL,
    currency: "USD",
    kind: "buy",
    date: "2026-01-05",
    quantity: 10,
    price: 100,
    amount: null,
    fee: 0,
    note: null,
    createdAt: new Date(CREATED_BASE + sequence * 1_000).toISOString(),
    ...overrides,
  };
}

function makeMark(overrides: Partial<PriceMark> = {}): PriceMark {
  return {
    id: "mark-001",
    subjectRef: SUBJECT,
    currency: "USD",
    price: 120,
    asOf: "2026-06-30",
    createdAt: "2026-06-30T12:00:00.000Z",
    ...overrides,
  };
}

function position(
  transactions: Transaction[],
  latestMark: PriceMark | null = null,
  overrides: Partial<PositionInput> = {}
): Position {
  return calculatePosition({
    subjectRef: SUBJECT,
    subjectLabel: LABEL,
    currency: "USD",
    transactions,
    latestMark,
    ...overrides,
  });
}

/** A position built straight from numbers, for the totals tests. */
function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    subjectRef: SUBJECT,
    subjectLabel: LABEL,
    currency: "USD",
    quantity: 10,
    averageCost: 100,
    costBasis: 1_000,
    realizedGain: 0,
    dividendIncome: 0,
    totalFees: 0,
    latestMark: null,
    markValue: null,
    unrealizedGain: null,
    transactionCount: 1,
    firstTransactionDate: "2026-01-05",
    lastTransactionDate: "2026-01-05",
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

const OVERSELL_MESSAGE =
  "This sell would exceed the shares held on that date. Record the missing buy first.";

describe("calculatePosition: a single buy", () => {
  it("reports the quantity, the fee-inclusive basis and the average cost", () => {
    const result = position([makeTx({ quantity: 10, price: 400, fee: 1.5 })]);

    expect(result.quantity).toBe(10);
    // Basis = 10 x 400 + 1.5. The commission is part of what the shares cost.
    expect(result.costBasis).toBe(4_001.5);
    expect(result.averageCost).toBeCloseTo(400.15, 10);
    expect(result.totalFees).toBe(1.5);
  });

  it("keeps the average cost above the trade price by exactly the fee per share", () => {
    const result = position([makeTx({ quantity: 20, price: 50, fee: 4 })]);

    expect(result.costBasis).toBe(1_004);
    expect(result.averageCost).toBe(50.2);
    expect((result.averageCost ?? 0) - 50).toBeCloseTo(4 / 20, 12);
  });

  it("leaves realized gain, dividends and marks empty", () => {
    const result = position([makeTx()]);

    expect(result.realizedGain).toBe(0);
    expect(result.dividendIncome).toBe(0);
    expect(result.markValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
    expect(result.latestMark).toBeNull();
  });

  it("carries the subject identity and dates through unchanged", () => {
    const result = position([makeTx({ date: "2026-02-17" })]);

    expect(result.subjectRef).toBe(SUBJECT);
    expect(result.subjectLabel).toBe(LABEL);
    expect(result.currency).toBe("USD");
    expect(result.transactionCount).toBe(1);
    expect(result.firstTransactionDate).toBe("2026-02-17");
    expect(result.lastTransactionDate).toBe("2026-02-17");
  });

  it("supports a fractional share quantity", () => {
    const result = position([makeTx({ quantity: 2.5, price: 200, fee: 0 })]);

    expect(result.quantity).toBe(2.5);
    expect(result.costBasis).toBe(500);
    expect(result.averageCost).toBe(200);
  });

  it("keeps JPY amounts in JPY with no conversion", () => {
    const result = position(
      [makeTx({ currency: "JPY", quantity: 100, price: 5_000, fee: 550 })],
      null,
      { currency: "JPY" }
    );

    expect(result.currency).toBe("JPY");
    expect(result.costBasis).toBe(500_550);
    expect(result.averageCost).toBe(5_005.5);
  });
});

describe("calculatePosition: moving-average cost basis", () => {
  it("averages two buys at different prices over the combined lot", () => {
    // 10 @ 400 with a 1 fee = 4001, then 5 @ 420 with no fee = 2100.
    const result = position([
      makeTx({ quantity: 10, price: 400, fee: 1, date: "2026-01-05" }),
      makeTx({ quantity: 5, price: 420, fee: 0, date: "2026-02-05" }),
    ]);

    expect(result.quantity).toBe(15);
    expect(result.costBasis).toBe(6_101);
    expect(result.averageCost).toBeCloseTo(406.7333333333, 9);
    expect(result.averageCost).toBeCloseTo(6_101 / 15, 12);
    expect(result.totalFees).toBe(1);
  });

  it("weights by quantity rather than averaging the two prices", () => {
    const result = position([
      makeTx({ quantity: 10, price: 400, fee: 0, date: "2026-01-05" }),
      makeTx({ quantity: 5, price: 420, fee: 0, date: "2026-02-05" }),
    ]);

    // A plain mean of 400 and 420 would be 410; the larger lot pulls it down.
    expect(result.averageCost).not.toBe(410);
    expect(result.averageCost).toBeCloseTo(6_100 / 15, 12);
    expect(result.costBasis).toBe(6_100);
  });

  it("accumulates three buys into one running average", () => {
    const result = position([
      makeTx({ quantity: 10, price: 100, fee: 5, date: "2026-01-05" }),
      makeTx({ quantity: 10, price: 150, fee: 5, date: "2026-02-05" }),
      makeTx({ quantity: 20, price: 200, fee: 10, date: "2026-03-05" }),
    ]);

    expect(result.quantity).toBe(40);
    expect(result.costBasis).toBe(6_520);
    expect(result.averageCost).toBe(163);
    expect(result.totalFees).toBe(20);
  });

  it("lowers the average when a later lot is cheaper", () => {
    const result = position([
      makeTx({ quantity: 10, price: 500, fee: 0, date: "2026-01-05" }),
      makeTx({ quantity: 10, price: 300, fee: 0, date: "2026-02-05" }),
    ]);

    expect(result.averageCost).toBe(400);
    expect(result.costBasis).toBe(8_000);
  });
});

describe("calculatePosition: sells", () => {
  /** 10 shares at 400 with a 1 fee: basis 4001, average cost 400.1. */
  function openLot(): Transaction {
    return makeTx({ quantity: 10, price: 400, fee: 1, date: "2026-01-05" });
  }

  it("realizes proceeds net of the sell fee minus the sold shares' cost", () => {
    const result = position([
      openLot(),
      makeTx({
        kind: "sell",
        quantity: 4,
        price: 450,
        fee: 2,
        date: "2026-03-05",
      }),
    ]);

    // (4 x 450 - 2) - 4 x 400.1 = 1798 - 1600.4 = 197.6
    expect(result.realizedGain).toBeCloseTo(197.6, 10);
  });

  it("leaves the average cost per share unchanged by the sell", () => {
    const before = position([openLot()]);
    const after = position([
      openLot(),
      makeTx({
        kind: "sell",
        quantity: 4,
        price: 450,
        fee: 2,
        date: "2026-03-05",
      }),
    ]);

    expect(after.averageCost).toBeCloseTo(before.averageCost ?? 0, 12);
    expect(after.averageCost).toBeCloseTo(400.1, 10);
  });

  it("reduces the basis by the sold shares at average cost, not at market", () => {
    const result = position([
      openLot(),
      makeTx({
        kind: "sell",
        quantity: 4,
        price: 450,
        fee: 2,
        date: "2026-03-05",
      }),
    ]);

    // 4001 - 4 x 400.1 = 2400.6 (the 450 sale price never touches the basis).
    expect(result.costBasis).toBeCloseTo(2_400.6, 10);
    expect(result.quantity).toBe(6);
  });

  it("counts the sell fee in total fees and subtracts it from the gain once", () => {
    const withoutFee = position([
      openLot(),
      makeTx({ kind: "sell", quantity: 4, price: 450, fee: 0, date: "2026-03-05" }),
    ]);
    const withFee = position([
      openLot(),
      makeTx({ kind: "sell", quantity: 4, price: 450, fee: 2, date: "2026-03-05" }),
    ]);

    expect(withoutFee.realizedGain - withFee.realizedGain).toBeCloseTo(2, 10);
    expect(withFee.totalFees).toBe(3);
    expect(withFee.costBasis).toBeCloseTo(withoutFee.costBasis ?? 0, 10);
  });

  it("computes a negative realized loss without clamping it at zero", () => {
    const result = position([
      openLot(),
      makeTx({ kind: "sell", quantity: 4, price: 300, fee: 2, date: "2026-03-05" }),
    ]);

    // (4 x 300 - 2) - 1600.4 = 1198 - 1600.4 = -402.4
    expect(result.realizedGain).toBeCloseTo(-402.4, 10);
    expect(result.realizedGain).toBeLessThan(0);
  });

  it("nets a gain and a loss across two sells", () => {
    const result = position([
      makeTx({ quantity: 10, price: 100, fee: 0, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 4, price: 150, fee: 0, date: "2026-02-05" }),
      makeTx({ kind: "sell", quantity: 4, price: 50, fee: 0, date: "2026-03-05" }),
    ]);

    // +200 then -200.
    expect(result.realizedGain).toBeCloseTo(0, 10);
    expect(result.quantity).toBe(2);
    expect(result.averageCost).toBe(100);
    expect(result.costBasis).toBe(200);
  });

  it("prices a sell at the average after a second buy, not at the first lot", () => {
    const result = position([
      makeTx({ quantity: 10, price: 400, fee: 0, date: "2026-01-05" }),
      makeTx({ quantity: 10, price: 600, fee: 0, date: "2026-02-05" }),
      makeTx({ kind: "sell", quantity: 5, price: 700, fee: 0, date: "2026-03-05" }),
    ]);

    // Moving average is 500, so the gain is 5 x 200 = 1000. FIFO would report
    // 5 x (700 - 400) = 1500; the method is a stated product rule, not a detail.
    expect(result.realizedGain).toBe(1_000);
    expect(result.averageCost).toBe(500);
    expect(result.costBasis).toBe(7_500);
    expect(result.quantity).toBe(15);
  });
});

describe("calculatePosition: full exit", () => {
  it("reports exactly zero shares and a null basis after selling everything", () => {
    const result = position([
      makeTx({ quantity: 10, price: 400, fee: 1, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 10, price: 500, fee: 3, date: "2026-06-05" }),
    ]);

    expect(result.quantity).toBe(0);
    expect(result.costBasis).toBeNull();
    expect(result.averageCost).toBeNull();
    // (10 x 500 - 3) - 4001 = 996
    expect(result.realizedGain).toBeCloseTo(996, 10);
    expect(result.totalFees).toBe(4);
  });

  it("zeroes float dust so a closed position never shows a residual sliver", () => {
    const result = position([
      makeTx({ quantity: 0.1, price: 100, date: "2026-01-05" }),
      makeTx({ quantity: 0.2, price: 100, date: "2026-02-05" }),
      makeTx({ kind: "sell", quantity: 0.3, price: 110, date: "2026-03-05" }),
    ]);

    // 0.1 + 0.2 - 0.3 is 5.55e-17 in IEEE-754; the position must still read 0.
    expect(result.quantity).toBe(0);
    expect(Object.is(result.quantity, 0)).toBe(true);
    expect(result.quantity).not.toBe(0.1 + 0.2 - 0.3);
    expect(result.costBasis).toBeNull();
    expect(result.averageCost).toBeNull();
    expect(result.realizedGain).toBeCloseTo(3, 9);
  });

  it("reports a closed position rather than a zero-cost holding", () => {
    const result = position([
      makeTx({ quantity: 5, price: 100, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 5, price: 100, date: "2026-02-05" }),
    ]);

    // Closed is expressed as zero shares with null basis and null average —
    // never as "5 shares that cost nothing" or "a basis of 0".
    expect(result.quantity).toBe(0);
    expect(result.costBasis).not.toBe(0);
    expect(result.costBasis).toBeNull();
    expect(result.averageCost).not.toBe(0);
    expect(result.averageCost).toBeNull();
  });

  it("starts a fresh average from the new lot after a full exit", () => {
    const result = position([
      makeTx({ quantity: 10, price: 400, fee: 0, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 10, price: 500, fee: 0, date: "2026-02-05" }),
      makeTx({ quantity: 5, price: 200, fee: 0, date: "2026-03-05" }),
    ]);

    // The closed lot's 4000 basis must not leak into the re-entry.
    expect(result.quantity).toBe(5);
    expect(result.costBasis).toBe(1_000);
    expect(result.averageCost).toBe(200);
    expect(result.realizedGain).toBe(1_000);
  });

  it("keeps the realized gain from the closed lot after re-entering", () => {
    const result = position([
      makeTx({ quantity: 10, price: 400, fee: 0, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 10, price: 500, fee: 0, date: "2026-02-05" }),
      makeTx({ quantity: 5, price: 200, fee: 0, date: "2026-03-05" }),
      makeTx({ kind: "sell", quantity: 5, price: 180, fee: 0, date: "2026-04-05" }),
    ]);

    // +1000 from the first round, -100 from the second.
    expect(result.realizedGain).toBe(900);
    expect(result.quantity).toBe(0);
    expect(result.costBasis).toBeNull();
  });

  it("survives a round trip through dust on repeated partial exits", () => {
    const result = position([
      makeTx({ quantity: 0.3, price: 100, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 0.1, price: 100, date: "2026-02-05" }),
      makeTx({ kind: "sell", quantity: 0.1, price: 100, date: "2026-03-05" }),
      makeTx({ kind: "sell", quantity: 0.1, price: 100, date: "2026-04-05" }),
    ]);

    expect(result.quantity).toBe(0);
    expect(result.costBasis).toBeNull();
    expect(result.realizedGain).toBeCloseTo(0, 9);
  });
});

describe("calculatePosition: dividends", () => {
  it("accumulates dividend income without touching shares or basis", () => {
    const shares = position([makeTx({ quantity: 10, price: 100 })]);
    const withDividend = position([
      makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 42.5,
        date: "2026-04-05",
      }),
    ]);

    expect(withDividend.dividendIncome).toBe(42.5);
    expect(withDividend.quantity).toBe(shares.quantity);
    expect(withDividend.costBasis).toBe(shares.costBasis);
    expect(withDividend.averageCost).toBe(shares.averageCost);
    expect(withDividend.realizedGain).toBe(0);
  });

  it("sums several dividend payments", () => {
    const result = position([
      makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 12,
        date: "2026-04-05",
      }),
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 13.25,
        date: "2026-07-05",
      }),
    ]);

    expect(result.dividendIncome).toBe(25.25);
    expect(result.transactionCount).toBe(3);
  });

  it("counts a dividend fee in total fees while reporting gross income", () => {
    const result = position([
      makeTx({ quantity: 10, price: 100, fee: 0, date: "2026-01-05" }),
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 100,
        fee: 15,
        date: "2026-04-05",
      }),
    ]);

    // dividendIncome is the gross amount recorded; the withholding/fee shows up
    // in totalFees rather than being netted out of the income line.
    expect(result.dividendIncome).toBe(100);
    expect(result.totalFees).toBe(15);
    expect(result.costBasis).toBe(1_000);
  });

  it("records a dividend paid after the position was closed", () => {
    const result = position([
      makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 10, price: 120, date: "2026-02-05" }),
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 8,
        date: "2026-03-05",
      }),
    ]);

    expect(result.dividendIncome).toBe(8);
    expect(result.quantity).toBe(0);
    expect(result.costBasis).toBeNull();
    expect(result.realizedGain).toBe(200);
  });

  it("keeps dividend income out of the realized gain line", () => {
    const result = position([
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 60,
        date: "2026-04-05",
      }),
    ]);

    expect(result.dividendIncome).toBe(60);
    expect(result.realizedGain).toBe(0);
    expect(result.quantity).toBe(0);
  });
});

describe("calculatePosition: fees", () => {
  it("sums fees across buys, sells and dividends", () => {
    const result = position([
      makeTx({ quantity: 10, price: 100, fee: 1, date: "2026-01-05" }),
      makeTx({ quantity: 10, price: 110, fee: 2, date: "2026-02-05" }),
      makeTx({
        kind: "sell",
        quantity: 5,
        price: 130,
        fee: 3,
        date: "2026-03-05",
      }),
      makeTx({
        kind: "dividend",
        quantity: null,
        price: null,
        amount: 20,
        fee: 4,
        date: "2026-04-05",
      }),
    ]);

    expect(result.totalFees).toBe(10);
  });

  it("reports zero total fees for a fee-free history, not null", () => {
    const result = position([makeTx({ fee: 0 })]);

    expect(result.totalFees).toBe(0);
  });
});

describe("calculatePosition: chronological replay", () => {
  it("replays transactions in date order regardless of array order", () => {
    const buy = makeTx({ quantity: 10, price: 400, fee: 0, date: "2026-01-05" });
    const sell = makeTx({
      kind: "sell",
      quantity: 4,
      price: 500,
      fee: 0,
      date: "2026-03-05",
    });

    const ordered = position([buy, sell]);
    const reversed = position([sell, buy]);

    expect(reversed).toEqual(ordered);
    expect(reversed.realizedGain).toBe(400);
    expect(reversed.quantity).toBe(6);
  });

  it("replays a buy dated earlier than a sell even when recorded afterwards", () => {
    // The user records the March sell first, then remembers the January buy.
    const sellRecordedFirst = makeTx({
      kind: "sell",
      quantity: 4,
      price: 500,
      fee: 0,
      date: "2026-03-05",
    });
    const buyRecordedLater = makeTx({
      quantity: 10,
      price: 400,
      fee: 0,
      date: "2026-01-05",
    });

    const result = position([sellRecordedFirst, buyRecordedLater]);

    expect(result.quantity).toBe(6);
    expect(result.averageCost).toBe(400);
    expect(result.costBasis).toBe(2_400);
    expect(result.realizedGain).toBe(400);
  });

  it("breaks a same-date tie with createdAt rather than array position", () => {
    const buy = makeTx({
      quantity: 10,
      price: 400,
      fee: 0,
      date: "2026-05-05",
    });
    const sellAfterTheBuy = makeTx({
      kind: "sell",
      quantity: 10,
      price: 450,
      fee: 0,
      date: "2026-05-05",
    });

    const asRecorded = position([buy, sellAfterTheBuy]);
    const shuffled = position([sellAfterTheBuy, buy]);

    expect(asRecorded.realizedGain).toBe(500);
    expect(asRecorded.quantity).toBe(0);
    // Array order is irrelevant: the earlier createdAt still sorts first.
    expect(shuffled).toEqual(asRecorded);
  });

  it("is order-independent when date, createdAt and only the id differ", () => {
    const shared = { date: "2026-05-05", createdAt: "2026-05-05T00:00:00.000Z" };
    const buy = makeTx({
      ...shared,
      id: "tx-aaa",
      quantity: 10,
      price: 400,
      fee: 0,
    });
    const sell = makeTx({
      ...shared,
      id: "tx-bbb",
      kind: "sell",
      quantity: 4,
      price: 450,
      fee: 0,
    });

    // The id is the final tiebreak, so both array orders replay identically.
    expect(position([sell, buy])).toEqual(position([buy, sell]));
    expect(position([buy, sell]).quantity).toBe(6);
  });

  it("takes the first and last transaction dates from date order", () => {
    const result = position([
      makeTx({ date: "2026-07-05" }),
      makeTx({ date: "2026-01-05" }),
      makeTx({ date: "2026-04-05" }),
    ]);

    expect(result.firstTransactionDate).toBe("2026-01-05");
    expect(result.lastTransactionDate).toBe("2026-07-05");
    expect(result.transactionCount).toBe(3);
  });

  it("does not mutate or reorder the caller's transaction array", () => {
    const transactions = [
      makeTx({ date: "2026-07-05" }),
      makeTx({ date: "2026-01-05" }),
    ];
    const snapshot = transactions.map((transaction) => ({ ...transaction }));

    position(transactions);

    expect(transactions).toEqual(snapshot);
    expect(at(transactions, 0).date).toBe("2026-07-05");
  });
});

describe("calculatePosition: price marks", () => {
  it("values the holding at quantity x mark price", () => {
    const result = position(
      [makeTx({ quantity: 10, price: 100, fee: 0 })],
      makeMark({ price: 137.5 })
    );

    expect(result.markValue).toBe(1_375);
    expect(result.latestMark?.asOf).toBe("2026-06-30");
  });

  it("reports the unrealized gain as mark value minus basis", () => {
    const result = position(
      [makeTx({ quantity: 10, price: 100, fee: 5 })],
      makeMark({ price: 120 })
    );

    expect(result.costBasis).toBe(1_005);
    expect(result.markValue).toBe(1_200);
    expect(result.unrealizedGain).toBe(195);
  });

  it("reports a negative unrealized loss when the mark is below cost", () => {
    const result = position(
      [makeTx({ quantity: 10, price: 100, fee: 0 })],
      makeMark({ price: 80 })
    );

    expect(result.unrealizedGain).toBe(-200);
  });

  it("leaves both mark fields null when no mark exists — never zero", () => {
    const result = position([makeTx({ quantity: 10, price: 100 })], null);

    expect(result.markValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
    expect(result.markValue).not.toBe(0);
    expect(result.unrealizedGain).not.toBe(0);
    expect(result.latestMark).toBeNull();
  });

  it("reports no market value for a closed position even when a mark exists", () => {
    const result = position(
      [
        makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
        makeTx({ kind: "sell", quantity: 10, price: 130, date: "2026-02-05" }),
      ],
      makeMark({ price: 150 })
    );

    // Zero shares at any price is not a holding worth 0; it is not a holding.
    expect(result.quantity).toBe(0);
    expect(result.markValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
    // The mark itself is still surfaced for display context.
    expect(result.latestMark?.price).toBe(150);
  });

  it("leaves mark fields null for an empty history with a mark", () => {
    const result = position([], makeMark());

    expect(result.markValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
  });

  it("values a fractional holding without rounding", () => {
    const result = position(
      [makeTx({ quantity: 2.5, price: 100, fee: 0 })],
      makeMark({ price: 133.33 })
    );

    expect(result.markValue).toBeCloseTo(333.325, 10);
    expect(result.unrealizedGain).toBeCloseTo(83.325, 10);
  });

  it("ignores a mark in a different currency (never mixes USD and JPY)", () => {
    // A JPY mark must not value a USD position — mixing currencies without
    // an explicit rate is forbidden (SPEC §2.5). The mismatched mark is
    // dropped entirely: no markValue, no unrealized gain, no latestMark.
    const result = position(
      [makeTx({ quantity: 10, price: 100, fee: 0 })],
      makeMark({ currency: "JPY", price: 15_000 })
    );

    expect(result.markValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
    expect(result.latestMark).toBeNull();
    expect(result.currency).toBe("USD");
  });
});

describe("calculatePosition: empty and degenerate histories", () => {
  it("returns an empty position for no transactions", () => {
    const result = position([]);

    expect(result.quantity).toBe(0);
    expect(result.averageCost).toBeNull();
    expect(result.costBasis).toBeNull();
    expect(result.realizedGain).toBe(0);
    expect(result.dividendIncome).toBe(0);
    expect(result.totalFees).toBe(0);
    expect(result.transactionCount).toBe(0);
    expect(result.markValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
  });

  it("uses an empty string for the dates of an empty history", () => {
    const result = position([]);

    // DISCREPANCY: `firstTransactionDate`/`lastTransactionDate` are typed as
    // `string`, so an empty history gets "" rather than null. Callers must not
    // render this as a date. A position with no transactions is not reachable
    // through the service (positions are derived from grouped transactions).
    expect(result.firstTransactionDate).toBe("");
    expect(result.lastTransactionDate).toBe("");
  });

  it("produces no NaN or Infinity for a normal history", () => {
    const result = position(
      [
        makeTx({ quantity: 3, price: 333.33, fee: 0.77, date: "2026-01-05" }),
        makeTx({
          kind: "sell",
          quantity: 1,
          price: 111.11,
          fee: 0.11,
          date: "2026-02-05",
        }),
        makeTx({
          kind: "dividend",
          quantity: null,
          price: null,
          amount: 1.23,
          date: "2026-03-05",
        }),
      ],
      makeMark({ price: 400 })
    );

    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value), `${key} must be finite`).toBe(true);
      }
    }
  });

  it("treats a buy with a null quantity or price as contributing nothing", () => {
    // The request schema forbids this shape; the calculation degrades to zero
    // rather than producing NaN if a malformed row ever reaches it.
    const result = position([
      makeTx({ quantity: null, price: null, date: "2026-01-05" }),
      makeTx({ quantity: 10, price: 100, date: "2026-02-05" }),
    ]);

    expect(result.quantity).toBe(10);
    expect(result.costBasis).toBe(1_000);
    expect(Number.isNaN(result.averageCost)).toBe(false);
  });

  it("treats a dividend with a null amount as zero income, not NaN", () => {
    const result = position([
      makeTx({ kind: "dividend", quantity: null, price: null, amount: null }),
    ]);

    expect(result.dividendIncome).toBe(0);
    expect(Number.isNaN(result.dividendIncome)).toBe(false);
  });

  it("reports a negative quantity when a sell has no matching buy", () => {
    // DOCUMENTED GAP: calculatePosition does not police the ledger — the API
    // route rejects an oversell up front via validateSellQuantity. If an
    // unmatched sell ever reached here, the average cost falls back to 0, so
    // the whole proceeds look like a gain and the negative holding reads as
    // "closed" (null basis) rather than as an error.
    const result = position([
      makeTx({ kind: "sell", quantity: 5, price: 100, fee: 0 }),
    ]);

    expect(result.quantity).toBe(-5);
    expect(result.realizedGain).toBe(500);
    expect(result.costBasis).toBeNull();
    expect(result.averageCost).toBeNull();
  });
});

describe("validateSellQuantity", () => {
  function existing(transactions: Transaction[]): {
    subjectRef: string;
    existing: Transaction[];
  } {
    return { subjectRef: SUBJECT, existing: transactions };
  }

  it("accepts a sell below the shares held at that date", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 4, price: 120, date: "2026-03-05" }),
      existing([makeTx({ quantity: 10, price: 100, date: "2026-01-05" })])
    );

    expect(result).toEqual({ ok: true });
  });

  it("accepts a sell of exactly the shares held", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 10, price: 120, date: "2026-03-05" }),
      existing([makeTx({ quantity: 10, price: 100, date: "2026-01-05" })])
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a sell of more than the shares held, with a readable message", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 11, price: 120, date: "2026-03-05" }),
      existing([makeTx({ quantity: 10, price: 100, date: "2026-01-05" })])
    );

    expect(result).toEqual({ ok: false, message: OVERSELL_MESSAGE });
    if (result.ok) return;
    expect(result.message).toContain("Record the missing buy first.");
  });

  it("rejects a sell dated before the only buy", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 1, price: 120, date: "2025-12-31" }),
      existing([makeTx({ quantity: 10, price: 100, date: "2026-01-05" })])
    );

    // Chronological replay: on that date nothing was held yet.
    expect(result.ok).toBe(false);
  });

  it("rejects any sell when nothing has been bought", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 1, price: 120, date: "2026-03-05" }),
      existing([])
    );

    expect(result.ok).toBe(false);
  });

  it("respects the running balance for a candidate inserted mid-history", () => {
    const history = [
      makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
      makeTx({ quantity: 5, price: 120, date: "2026-02-05" }),
      makeTx({ kind: "sell", quantity: 12, price: 150, date: "2026-03-05" }),
    ];

    // Selling 8 on 2026-01-20 is affordable at that moment (10 held) but leaves
    // only 7 for the existing March sell of 12, so the ledger goes negative.
    const rejected = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 8, price: 130, date: "2026-01-20" }),
      existing(history)
    );
    expect(rejected.ok).toBe(false);

    // Selling 3 keeps every later balance non-negative.
    const accepted = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 3, price: 130, date: "2026-01-20" }),
      existing(history)
    );
    expect(accepted.ok).toBe(true);
  });

  it("handles interleaved buys and sells for a candidate at the end", () => {
    const history = [
      makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 6, price: 120, date: "2026-02-05" }),
      makeTx({ quantity: 4, price: 90, date: "2026-03-05" }),
      makeTx({ kind: "sell", quantity: 2, price: 130, date: "2026-04-05" }),
    ];

    // 10 - 6 + 4 - 2 = 6 shares remain.
    expect(
      validateSellQuantity(
        makeTx({ kind: "sell", quantity: 6, price: 140, date: "2026-05-05" }),
        existing(history)
      ).ok
    ).toBe(true);
    expect(
      validateSellQuantity(
        makeTx({ kind: "sell", quantity: 7, price: 140, date: "2026-05-05" }),
        existing(history)
      ).ok
    ).toBe(false);
  });

  it("reaches the same verdict whatever order the history is supplied in", () => {
    const history = [
      makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
      makeTx({ kind: "sell", quantity: 6, price: 120, date: "2026-02-05" }),
      makeTx({ quantity: 4, price: 90, date: "2026-03-05" }),
    ];
    const candidate = makeTx({
      kind: "sell",
      quantity: 8,
      price: 140,
      date: "2026-04-05",
    });

    const forwards = validateSellQuantity(candidate, existing(history));
    const backwards = validateSellQuantity(
      candidate,
      existing([...history].reverse())
    );

    expect(backwards).toEqual(forwards);
    expect(forwards.ok).toBe(true);
  });

  it("tolerates float dust when the sell exactly closes a fractional lot", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 0.3, price: 120, date: "2026-03-05" }),
      existing([
        makeTx({ quantity: 0.1, price: 100, date: "2026-01-05" }),
        makeTx({ quantity: 0.2, price: 100, date: "2026-02-05" }),
      ])
    );

    // 0.1 + 0.2 - 0.3 is -5.55e-17, well inside the 1e-9 tolerance.
    expect(result).toEqual({ ok: true });
  });

  it("still rejects a shortfall larger than the float tolerance", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 0.3001, price: 120, date: "2026-03-05" }),
      existing([
        makeTx({ quantity: 0.1, price: 100, date: "2026-01-05" }),
        makeTx({ quantity: 0.2, price: 100, date: "2026-02-05" }),
      ])
    );

    expect(result.ok).toBe(false);
  });

  it("ignores dividends when counting shares", () => {
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 10, price: 120, date: "2026-04-05" }),
      existing([
        makeTx({ quantity: 10, price: 100, date: "2026-01-05" }),
        makeTx({
          kind: "dividend",
          quantity: null,
          price: null,
          amount: 50,
          date: "2026-02-05",
        }),
      ])
    );

    // A cash dividend adds no shares, so 10 is still the whole holding.
    expect(result.ok).toBe(true);
  });

  it("uses createdAt to order a candidate against a same-date buy", () => {
    const buy = makeTx({ quantity: 10, price: 100, date: "2026-03-05" });
    const sellRecordedAfter = makeTx({
      kind: "sell",
      quantity: 10,
      price: 120,
      date: "2026-03-05",
    });
    expect(
      validateSellQuantity(sellRecordedAfter, existing([buy])).ok
    ).toBe(true);

    // A sell whose createdAt precedes the buy replays before it, so it fails.
    const sellRecordedBefore = makeTx({
      kind: "sell",
      quantity: 10,
      price: 120,
      date: "2026-03-05",
      createdAt: "2025-12-01T00:00:00.000Z",
    });
    expect(
      validateSellQuantity(sellRecordedBefore, existing([buy])).ok
    ).toBe(false);
  });

  it("treats a candidate with a null quantity as selling nothing", () => {
    // The request schema requires a quantity for sells; this only guarantees
    // the validator cannot throw or produce NaN on a malformed candidate.
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: null, price: 120, date: "2026-03-05" }),
      existing([makeTx({ quantity: 10, price: 100, date: "2026-01-05" })])
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a non-sell candidate without checking the balance", () => {
    const result = validateSellQuantity(
      makeTx({ quantity: 1_000, price: 100, date: "2026-03-05" }),
      existing([])
    );

    expect(result.ok).toBe(true);
  });

  it("does not mutate the supplied history", () => {
    const history = [
      makeTx({ quantity: 10, price: 100, date: "2026-03-05" }),
      makeTx({ quantity: 5, price: 100, date: "2026-01-05" }),
    ];
    const snapshot = history.map((transaction) => ({ ...transaction }));

    validateSellQuantity(
      makeTx({ kind: "sell", quantity: 3, price: 120, date: "2026-04-05" }),
      existing(history)
    );

    expect(history).toEqual(snapshot);
    expect(history).toHaveLength(2);
  });

  it("ignores other subjects' transactions — their shares cannot fund this sell", () => {
    // Defense in depth: even when a caller passes a mixed ledger, only the
    // candidate's own subject counts toward the running balance.
    const result = validateSellQuantity(
      makeTx({ kind: "sell", quantity: 10, price: 120, date: "2026-03-05" }),
      {
        subjectRef: SUBJECT,
        existing: [
          makeTx({
            subjectRef: "demo:etf-jp-sakura-dividend",
            quantity: 10,
            price: 100,
            date: "2026-01-05",
          }),
        ],
      }
    );

    expect(result.ok).toBe(false);
  });
});

describe("calculateCurrencyTotals", () => {
  const USD_OPEN = makePosition({
    subjectRef: "demo:stock-us-northstar-software",
    subjectLabel: "Northstar Software (demo)",
    currency: "USD",
    quantity: 10,
    averageCost: 400,
    costBasis: 4_000,
    realizedGain: 120,
    dividendIncome: 30,
    totalFees: 5,
  });

  const JPY_OPEN = makePosition({
    subjectRef: "demo:stock-jp-yamato-robotics",
    subjectLabel: "Yamato Robotics (demo)",
    currency: "JPY",
    quantity: 100,
    averageCost: 5_000,
    costBasis: 500_000,
    realizedGain: 9_000,
    dividendIncome: 2_500,
    totalFees: 1_100,
  });

  function marked(base: Position, markValue: number, asOf: string): Position {
    return {
      ...base,
      latestMark: makeMark({
        subjectRef: base.subjectRef,
        currency: base.currency,
        price: markValue / base.quantity,
        asOf,
      }),
      markValue,
      unrealizedGain: markValue - (base.costBasis ?? 0),
    };
  }

  function forCurrency(
    totals: readonly ReturnType<typeof calculateCurrencyTotals>[number][],
    currency: "USD" | "JPY"
  ): ReturnType<typeof calculateCurrencyTotals>[number] {
    const found = totals.find((entry) => entry.currency === currency);
    if (found === undefined) {
      throw new Error(`Expected totals for ${currency}.`);
    }
    return found;
  }

  it("returns one entry per currency and never a combined figure", () => {
    const totals = calculateCurrencyTotals([USD_OPEN, JPY_OPEN]);

    expect(totals).toHaveLength(2);
    expect(forCurrency(totals, "USD").costBasis).toBe(4_000);
    expect(forCurrency(totals, "JPY").costBasis).toBe(500_000);

    // Nothing anywhere in the output equals a USD+JPY sum. Adding 4000 USD to
    // 500000 JPY is meaningless without a rate, so the number must not exist.
    const numbers = totals.flatMap((entry) =>
      Object.values(entry).filter(
        (value): value is number => typeof value === "number"
      )
    );
    expect(numbers).not.toContain(504_000);
    expect(numbers).not.toContain(9_120);
    expect(numbers).not.toContain(2_530);
    expect(numbers).not.toContain(1_105);
  });

  it("keeps each currency's realized gain, dividends and fees separate", () => {
    const totals = calculateCurrencyTotals([USD_OPEN, JPY_OPEN]);

    const usd = forCurrency(totals, "USD");
    expect(usd.realizedGain).toBe(120);
    expect(usd.dividendIncome).toBe(30);
    expect(usd.totalFees).toBe(5);

    const jpy = forCurrency(totals, "JPY");
    expect(jpy.realizedGain).toBe(9_000);
    expect(jpy.dividendIncome).toBe(2_500);
    expect(jpy.totalFees).toBe(1_100);
  });

  it("returns an empty array for no positions", () => {
    expect(calculateCurrencyTotals([])).toEqual([]);
  });

  it("returns a single entry when only one currency is held", () => {
    const totals = calculateCurrencyTotals([USD_OPEN]);

    expect(totals).toHaveLength(1);
    expect(at(totals, 0).currency).toBe("USD");
  });

  it("sums several positions within one currency", () => {
    const second = makePosition({
      subjectRef: "demo:etf-us-broad-market",
      currency: "USD",
      quantity: 5,
      costBasis: 1_500,
      realizedGain: -80,
      dividendIncome: 12,
      totalFees: 3,
    });

    const usd = forCurrency(calculateCurrencyTotals([USD_OPEN, second]), "USD");
    expect(usd.positionCount).toBe(2);
    expect(usd.openPositionCount).toBe(2);
    expect(usd.costBasis).toBe(5_500);
    expect(usd.realizedGain).toBe(40);
    expect(usd.dividendIncome).toBe(42);
    expect(usd.totalFees).toBe(8);
  });

  it("sums marked value only across positions that have a mark", () => {
    const unmarked = makePosition({
      subjectRef: "demo:etf-us-broad-market",
      currency: "USD",
      quantity: 5,
      costBasis: 1_500,
    });

    const usd = forCurrency(
      calculateCurrencyTotals([
        marked(USD_OPEN, 4_600, "2026-06-30"),
        unmarked,
      ]),
      "USD"
    );

    expect(usd.markedValue).toBe(4_600);
    expect(usd.costBasis).toBe(5_500);
    // The honesty pair: the marked value covers only part of the basis.
    expect(usd.unmarkedPositionCount).toBe(1);
  });

  it("reports a null marked value when nothing is marked — never zero", () => {
    const usd = forCurrency(calculateCurrencyTotals([USD_OPEN]), "USD");

    expect(usd.markedValue).toBeNull();
    expect(usd.markedValue).not.toBe(0);
    expect(usd.unmarkedPositionCount).toBe(1);
    expect(usd.oldestMarkDate).toBeNull();
  });

  it("reports zero unmarked positions when every open position is marked", () => {
    const totals = calculateCurrencyTotals([
      marked(USD_OPEN, 4_600, "2026-06-30"),
      marked(JPY_OPEN, 520_000, "2026-05-31"),
    ]);

    expect(forCurrency(totals, "USD").unmarkedPositionCount).toBe(0);
    expect(forCurrency(totals, "JPY").unmarkedPositionCount).toBe(0);
    expect(forCurrency(totals, "USD").markedValue).toBe(4_600);
    expect(forCurrency(totals, "JPY").markedValue).toBe(520_000);
  });

  it("takes the oldest mark date among marked positions", () => {
    const second = marked(
      makePosition({
        subjectRef: "demo:etf-us-broad-market",
        currency: "USD",
        quantity: 5,
        costBasis: 1_500,
      }),
      1_700,
      "2026-02-14"
    );

    const usd = forCurrency(
      calculateCurrencyTotals([marked(USD_OPEN, 4_600, "2026-06-30"), second]),
      "USD"
    );

    // The staleness indicator reports the WORST case, not the newest mark.
    expect(usd.oldestMarkDate).toBe("2026-02-14");
  });

  it("does not let another currency's mark date leak into the total", () => {
    const totals = calculateCurrencyTotals([
      marked(USD_OPEN, 4_600, "2026-06-30"),
      marked(JPY_OPEN, 520_000, "2026-01-31"),
    ]);

    expect(forCurrency(totals, "USD").oldestMarkDate).toBe("2026-06-30");
    expect(forCurrency(totals, "JPY").oldestMarkDate).toBe("2026-01-31");
  });

  it("excludes closed positions from the basis and the open count", () => {
    const closed = makePosition({
      subjectRef: "demo:stock-us-retired",
      currency: "USD",
      quantity: 0,
      averageCost: null,
      costBasis: null,
      realizedGain: 250,
      dividendIncome: 15,
      totalFees: 7,
    });

    const usd = forCurrency(calculateCurrencyTotals([USD_OPEN, closed]), "USD");

    expect(usd.positionCount).toBe(2);
    expect(usd.openPositionCount).toBe(1);
    expect(usd.costBasis).toBe(4_000);
    // Realized gain, dividends and fees are historical facts: they stay.
    expect(usd.realizedGain).toBe(370);
    expect(usd.dividendIncome).toBe(45);
    expect(usd.totalFees).toBe(12);
  });

  it("does not count a closed position as unmarked", () => {
    const closed = makePosition({
      subjectRef: "demo:stock-us-retired",
      currency: "USD",
      quantity: 0,
      averageCost: null,
      costBasis: null,
      latestMark: makeMark({ asOf: "2020-01-01" }),
      markValue: null,
      unrealizedGain: null,
    });

    const usd = forCurrency(
      calculateCurrencyTotals([marked(USD_OPEN, 4_600, "2026-06-30"), closed]),
      "USD"
    );

    expect(usd.openPositionCount).toBe(1);
    expect(usd.unmarkedPositionCount).toBe(0);
    expect(usd.markedValue).toBe(4_600);
    // A closed position's stale mark must not become the staleness indicator.
    expect(usd.oldestMarkDate).toBe("2026-06-30");
  });

  it("returns a null marked value for a currency whose only position is closed", () => {
    const closed = makePosition({
      currency: "JPY",
      quantity: 0,
      averageCost: null,
      costBasis: null,
      realizedGain: 4_000,
    });

    const jpy = forCurrency(calculateCurrencyTotals([closed]), "JPY");
    expect(jpy.positionCount).toBe(1);
    expect(jpy.openPositionCount).toBe(0);
    expect(jpy.costBasis).toBe(0);
    expect(jpy.markedValue).toBeNull();
    expect(jpy.unmarkedPositionCount).toBe(0);
    expect(jpy.realizedGain).toBe(4_000);
  });

  it("orders the currencies USD then JPY, whatever the input order", () => {
    const usdFirst = calculateCurrencyTotals([USD_OPEN, JPY_OPEN]);
    const jpyFirst = calculateCurrencyTotals([JPY_OPEN, USD_OPEN]);

    expect(usdFirst.map((entry) => entry.currency)).toEqual(["USD", "JPY"]);
    expect(jpyFirst.map((entry) => entry.currency)).toEqual(["USD", "JPY"]);
    expect(jpyFirst).toEqual(usdFirst);
  });

  it("does not mutate the supplied positions array", () => {
    const positions = [USD_OPEN, JPY_OPEN];
    const snapshot = positions.map((entry) => ({ ...entry }));

    calculateCurrencyTotals(positions);

    expect(positions).toEqual(snapshot);
    expect(at(positions, 0).currency).toBe("USD");
  });

  it("exposes exactly the documented totals fields", () => {
    const usd = forCurrency(calculateCurrencyTotals([USD_OPEN]), "USD");

    expect(Object.keys(usd).sort()).toEqual([
      "costBasis",
      "currency",
      "dividendIncome",
      "markedValue",
      "oldestMarkDate",
      "openPositionCount",
      "positionCount",
      "realizedGain",
      "totalFees",
      "unmarkedPositionCount",
    ]);
  });

  it("keeps totals consistent with positions produced by calculatePosition", () => {
    const usd = position(
      [
        makeTx({ quantity: 10, price: 400, fee: 1, date: "2026-01-05" }),
        makeTx({
          kind: "dividend",
          quantity: null,
          price: null,
          amount: 30,
          date: "2026-04-05",
        }),
      ],
      makeMark({ price: 460 })
    );
    const jpy = position(
      [makeTx({ currency: "JPY", quantity: 100, price: 5_000, fee: 550 })],
      null,
      { currency: "JPY", subjectRef: "demo:stock-jp-yamato-robotics" }
    );

    const totals = calculateCurrencyTotals([usd, jpy]);

    expect(forCurrency(totals, "USD").costBasis).toBe(4_001);
    expect(forCurrency(totals, "USD").markedValue).toBe(4_600);
    expect(forCurrency(totals, "USD").dividendIncome).toBe(30);
    expect(forCurrency(totals, "JPY").costBasis).toBe(500_550);
    expect(forCurrency(totals, "JPY").markedValue).toBeNull();
    expect(forCurrency(totals, "JPY").unmarkedPositionCount).toBe(1);
  });
});
