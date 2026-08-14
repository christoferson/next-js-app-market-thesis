import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createPriceMarkSchema,
  createTransactionSchema,
  zodDetails,
} from "@/lib/validation/portfolio-request";

/**
 * Portfolio request contracts (P1). These schemas are the only boundary between
 * an untrusted request body and the ledger, so the tests focus on what is
 * rejected: kind-mismatched fields (a dividend carrying a price, a buy without
 * a quantity), non-positive quantities, negative fees, loose dates, and unknown
 * keys. A wrong row in the ledger silently corrupts the user's cost basis.
 */

const VALID_BUY = {
  subjectRef: "demo:stock-us-northstar-software",
  subjectLabel: "Northstar Software (demo)",
  currency: "USD",
  kind: "buy",
  date: "2026-01-05",
  quantity: 10,
  price: 400,
  amount: null,
  fee: 1.5,
  note: null,
} as const;

const VALID_SELL = { ...VALID_BUY, kind: "sell", quantity: 4, price: 450 } as const;

const VALID_DIVIDEND = {
  ...VALID_BUY,
  kind: "dividend",
  quantity: null,
  price: null,
  amount: 42.5,
} as const;

const VALID_MARK = {
  subjectRef: "demo:stock-us-northstar-software",
  currency: "USD",
  price: 460,
  asOf: "2026-06-30",
} as const;

/** Every transaction kind, so a rule can be asserted for all three at once. */
const KIND_BASES = [
  ["buy", VALID_BUY],
  ["sell", VALID_SELL],
  ["dividend", VALID_DIVIDEND],
] as const;

/** The two kinds that carry shares; dividends are cash-only. */
const SHARE_BASES = [
  ["buy", VALID_BUY],
  ["sell", VALID_SELL],
] as const;

function parse(body: unknown): ReturnType<typeof createTransactionSchema.safeParse> {
  return createTransactionSchema.safeParse(body);
}

function accepts(body: unknown): boolean {
  return parse(body).success;
}

/** The field-keyed error map the route returns to the browser. */
function details(body: unknown): Record<string, string[]> {
  const result = parse(body);
  if (result.success) throw new Error("Expected the payload to be rejected.");
  return zodDetails(result.error);
}

function omit(
  body: Record<string, unknown>,
  field: string
): Record<string, unknown> {
  const copy = { ...body };
  delete copy[field];
  return copy;
}

describe("createTransactionSchema valid payloads", () => {
  it("parses a buy unchanged", () => {
    const result = parse(VALID_BUY);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(VALID_BUY);
  });

  it("parses a sell unchanged", () => {
    const result = parse(VALID_SELL);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(VALID_SELL);
  });

  it("parses a dividend unchanged", () => {
    const result = parse(VALID_DIVIDEND);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(VALID_DIVIDEND);
    expect(result.data.quantity).toBeNull();
    expect(result.data.price).toBeNull();
  });

  it("accepts both currencies and keeps them as given", () => {
    for (const currency of ["USD", "JPY"] as const) {
      const result = parse({ ...VALID_BUY, currency });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.currency).toBe(currency);
    }
  });

  it("rejects an unsupported currency", () => {
    for (const currency of ["EUR", "usd", "", null, 1]) {
      expect(accepts({ ...VALID_BUY, currency })).toBe(false);
    }
  });

  it("rejects an unknown kind", () => {
    for (const kind of ["split", "Buy", "transfer", "", null, 1]) {
      expect(accepts({ ...VALID_BUY, kind })).toBe(false);
    }
  });

  it("requires an object body", () => {
    for (const body of [null, undefined, 42, "buy", []]) {
      expect(accepts(body)).toBe(false);
    }
  });

  it("preserves a Japanese subject label and note", () => {
    const result = parse({
      ...VALID_BUY,
      subjectRef: "research-jp:toyota",
      subjectLabel: "トヨタ自動車",
      currency: "JPY",
      note: "有価証券報告書を読んだ。",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.subjectLabel).toBe("トヨタ自動車");
    expect(result.data.note).toBe("有価証券報告書を読んだ。");
  });

  it("trims the subject label and note", () => {
    const result = parse({
      ...VALID_BUY,
      subjectLabel: "  Northstar Software (demo)  ",
      note: "  Opened after the 10-K.  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.subjectLabel).toBe("Northstar Software (demo)");
    expect(result.data.note).toBe("Opened after the 10-K.");
  });

  it("rejects a whitespace-only subject label", () => {
    expect(accepts({ ...VALID_BUY, subjectLabel: "    " })).toBe(false);
    expect(accepts({ ...VALID_BUY, subjectLabel: "" })).toBe(false);
  });

  it("bounds the subject label at 200 characters", () => {
    expect(accepts({ ...VALID_BUY, subjectLabel: "a".repeat(200) })).toBe(true);
    expect(accepts({ ...VALID_BUY, subjectLabel: "a".repeat(201) })).toBe(false);
  });

  it("bounds the note at 500 characters and allows null", () => {
    expect(accepts({ ...VALID_BUY, note: "a".repeat(500) })).toBe(true);
    expect(accepts({ ...VALID_BUY, note: "a".repeat(501) })).toBe(false);
    expect(accepts({ ...VALID_BUY, note: null })).toBe(true);
  });

  it("requires the nullable fields to be present, not omitted", () => {
    // Explicit nulls keep "no price recorded" distinct from "field forgotten".
    for (const field of ["quantity", "price", "amount", "note"]) {
      expect(accepts(omit({ ...VALID_BUY }, field))).toBe(false);
    }
  });

  it("rejects a missing required field", () => {
    for (const field of [
      "subjectRef",
      "subjectLabel",
      "currency",
      "kind",
      "date",
    ]) {
      expect(accepts(omit({ ...VALID_BUY }, field))).toBe(false);
    }
  });
});

describe("createTransactionSchema kind-specific rules", () => {
  it.each(SHARE_BASES)("requires a quantity for a %s", (_kind, base) => {
    const result = details({ ...base, quantity: null });

    expect(result.quantity).toEqual([
      "Buys and sells require a share quantity.",
    ]);
  });

  it.each(SHARE_BASES)("requires a price for a %s", (_kind, base) => {
    const result = details({ ...base, price: null });

    expect(result.price).toEqual([
      "Buys and sells require a per-share price.",
    ]);
  });

  it.each(SHARE_BASES)("rejects a cash amount on a %s", (_kind, base) => {
    const result = details({ ...base, amount: 4_000 });

    expect(result.amount).toEqual([
      "Buys and sells must not carry a cash amount (derived).",
    ]);
  });

  it("reports quantity and price together when a buy omits both", () => {
    const result = details({ ...VALID_BUY, quantity: null, price: null });

    expect(Object.keys(result).sort()).toEqual(["price", "quantity"]);
  });

  it("reports all three kind violations for a sell at once", () => {
    const result = details({
      ...VALID_SELL,
      quantity: null,
      price: null,
      amount: 1_800,
    });

    expect(Object.keys(result).sort()).toEqual([
      "amount",
      "price",
      "quantity",
    ]);
  });

  it("requires a cash amount for a dividend", () => {
    const result = details({ ...VALID_DIVIDEND, amount: null });

    expect(result.amount).toEqual([
      "Dividends require the cash amount received.",
    ]);
  });

  it("rejects a share quantity on a dividend", () => {
    const result = details({ ...VALID_DIVIDEND, quantity: 10 });

    expect(result.quantity).toEqual([
      "Dividends must not carry share quantity or price.",
    ]);
  });

  it("rejects a per-share price on a dividend", () => {
    // A dividend is cash received; a per-share rate would invite the reader to
    // treat it as a trade. The issue is reported under `quantity`.
    const result = details({ ...VALID_DIVIDEND, price: 4.25 });

    expect(result.quantity).toEqual([
      "Dividends must not carry share quantity or price.",
    ]);
  });

  it("reports one issue when a dividend carries both quantity and price", () => {
    const result = details({ ...VALID_DIVIDEND, quantity: 10, price: 4.25 });

    expect(result.quantity).toEqual([
      "Dividends must not carry share quantity or price.",
    ]);
    expect(result.price).toBeUndefined();
  });

  it("rejects a dividend with no amount and a stray quantity", () => {
    const result = details({
      ...VALID_DIVIDEND,
      amount: null,
      quantity: 10,
      price: 4.25,
    });

    expect(Object.keys(result).sort()).toEqual(["amount", "quantity"]);
  });

  it("applies the same rules to a sell as to a buy", () => {
    expect(accepts(VALID_SELL)).toBe(true);
    expect(accepts({ ...VALID_SELL, quantity: null })).toBe(false);
    expect(accepts({ ...VALID_SELL, price: null })).toBe(false);
    expect(accepts({ ...VALID_SELL, amount: 1_800 })).toBe(false);
    expect(accepts({ ...VALID_SELL, quantity: 0 })).toBe(false);
    expect(accepts({ ...VALID_SELL, quantity: -4 })).toBe(false);
    expect(accepts({ ...VALID_SELL, price: 0 })).toBe(true);
  });
});

describe("createTransactionSchema quantity", () => {
  it("accepts a positive and a fractional quantity", () => {
    for (const quantity of [1, 10, 2.5, 0.001, 1_000_000]) {
      const result = parse({ ...VALID_BUY, quantity });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.quantity).toBe(quantity);
    }
  });

  it("rejects a zero quantity", () => {
    // Buying zero shares is not a transaction; it would divide the average cost
    // by nothing downstream.
    const result = details({ ...VALID_BUY, quantity: 0 });

    expect(result.quantity).toBeDefined();
  });

  it("rejects a negative quantity instead of inferring a sell", () => {
    for (const quantity of [-1, -0.5, -1_000]) {
      expect(accepts({ ...VALID_BUY, quantity })).toBe(false);
    }
    // Direction is carried by `kind`, never by the sign of the quantity.
    expect(accepts({ ...VALID_SELL, quantity: -4 })).toBe(false);
  });

  it("rejects NaN and Infinity for the quantity", () => {
    for (const quantity of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(accepts({ ...VALID_BUY, quantity })).toBe(false);
    }
  });

  it("rejects a numeric string quantity", () => {
    expect(accepts({ ...VALID_BUY, quantity: "10" })).toBe(false);
  });
});

describe("createTransactionSchema price", () => {
  it("accepts a zero price for shares received at no cost", () => {
    // A grant, bonus issue or spin-off share genuinely costs zero. Zero is a
    // real price here, unlike a missing metric, which stays null.
    const result = parse({ ...VALID_BUY, price: 0 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.price).toBe(0);
  });

  it("accepts a fractional and a large price", () => {
    for (const price of [0.0001, 12.34, 5_000, 1_234_567.89]) {
      const result = parse({ ...VALID_BUY, price });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.price).toBe(price);
    }
  });

  it("rejects a negative price", () => {
    for (const price of [-0.01, -1, -400]) {
      expect(accepts({ ...VALID_BUY, price })).toBe(false);
    }
  });

  it("rejects NaN and Infinity for the price", () => {
    for (const price of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(accepts({ ...VALID_BUY, price })).toBe(false);
    }
  });

  it("rejects a numeric string price", () => {
    expect(accepts({ ...VALID_BUY, price: "400" })).toBe(false);
  });
});

describe("createTransactionSchema amount", () => {
  it("accepts a positive dividend amount", () => {
    for (const amount of [0.01, 42.5, 1_000_000] as const) {
      const result = parse({ ...VALID_DIVIDEND, amount });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(amount);
    }
  });

  it("rejects a zero or negative dividend amount", () => {
    for (const amount of [0, -0.01, -42.5]) {
      expect(accepts({ ...VALID_DIVIDEND, amount })).toBe(false);
    }
  });

  it("rejects NaN and Infinity for the amount", () => {
    for (const amount of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(accepts({ ...VALID_DIVIDEND, amount })).toBe(false);
    }
  });
});

describe("createTransactionSchema fee", () => {
  it("defaults the fee to zero when omitted", () => {
    const result = parse(omit({ ...VALID_BUY }, "fee"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.fee).toBe(0);
  });

  it("accepts an explicit zero and a fractional fee", () => {
    for (const fee of [0, 0.01, 1.5, 550] as const) {
      const result = parse({ ...VALID_BUY, fee });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.fee).toBe(fee);
    }
  });

  it("rejects a negative fee", () => {
    // A negative fee would quietly reduce the cost basis, so it is rejected
    // rather than being read as a rebate.
    for (const fee of [-0.01, -1, -550]) {
      const result = details({ ...VALID_BUY, fee });
      expect(result.fee).toBeDefined();
    }
  });

  it("rejects NaN, Infinity and a null fee", () => {
    for (const fee of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      null,
      "1.5",
    ]) {
      expect(accepts({ ...VALID_BUY, fee })).toBe(false);
    }
  });

  it.each(KIND_BASES)("defaults the fee for a %s as well", (_kind, base) => {
    const result = parse(omit({ ...base }, "fee"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.fee).toBe(0);
  });
});

describe("createTransactionSchema date", () => {
  it("accepts an ISO date", () => {
    for (const date of ["2026-01-05", "1999-12-31", "2026-02-28"]) {
      const result = parse({ ...VALID_BUY, date });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.date).toBe(date);
    }
  });

  it.each(["2027-02-30", "2027-13-01", "2027-00-15", "2027-04-31", "2026-06-31"])(
    "rejects the impossible calendar date %s",
    (date) => {
      expect(details({ ...VALID_BUY, date }).date).toEqual([
        "This is not a real calendar date.",
      ]);
    }
  );

  it("accepts a leap day in a leap year only", () => {
    expect(accepts({ ...VALID_BUY, date: "2028-02-29" })).toBe(true);
    expect(accepts({ ...VALID_BUY, date: "2027-02-29" })).toBe(false);
  });

  it.each([
    "March 2027",
    "2027-3-31",
    "31-03-2027",
    "2027/03/31",
    "2027-03-31T00:00:00.000Z",
    "2027",
    "",
    "today",
  ])("rejects the loose date %s", (date) => {
    expect(accepts({ ...VALID_BUY, date })).toBe(false);
  });

  it("reports a readable message for a malformed date", () => {
    expect(details({ ...VALID_BUY, date: "March 2027" }).date).toEqual([
      "Use an ISO date (YYYY-MM-DD).",
    ]);
  });

  it("rejects a non-string date", () => {
    for (const date of [null, 20_260_105, new Date("2026-01-05")]) {
      expect(accepts({ ...VALID_BUY, date })).toBe(false);
    }
  });

  it("accepts a future date without complaint", () => {
    // Manual bookkeeping may be entered ahead of settlement; the schema does
    // not depend on the current date, which keeps the tests deterministic.
    expect(accepts({ ...VALID_BUY, date: "2099-12-31" })).toBe(true);
  });
});

describe("createTransactionSchema subjectRef", () => {
  it.each([
    "demo:stock-us-northstar-software",
    "demo:x",
    "research:aapl",
    "research-jp:toyota",
    "research:brk-b",
    "demo:etf-jp-sakura-dividend",
  ])("accepts %s", (subjectRef) => {
    expect(accepts({ ...VALID_BUY, subjectRef })).toBe(true);
  });

  it.each([
    ["an unsupported scope", "portfolio:x"],
    ["a missing colon", "demoxyz"],
    ["a bare scope", "demo"],
    ["an empty id", "demo:"],
    ["an uppercase scope", "Demo:x"],
    ["an uppercase id", "demo:Northstar"],
    ["a leading hyphen in the id", "demo:-x"],
    ["a dot in the id", "research:aapl.us"],
    ["an underscore in the id", "research:brk_b"],
    ["leading whitespace", " demo:x"],
    ["a colon inside the id", "demo:stock:us"],
    ["an empty string", ""],
  ])("rejects %s", (_label, subjectRef) => {
    expect(accepts({ ...VALID_BUY, subjectRef })).toBe(false);
  });

  it("accepts a 100-character id but not a 101-character one", () => {
    expect(accepts({ ...VALID_BUY, subjectRef: `demo:${"a".repeat(100)}` })).toBe(
      true
    );
    expect(accepts({ ...VALID_BUY, subjectRef: `demo:${"a".repeat(101)}` })).toBe(
      false
    );
  });

  it("reports the failure under subjectRef with a readable message", () => {
    expect(details({ ...VALID_BUY, subjectRef: "portfolio:x" }).subjectRef).toEqual(
      ["subjectRef must be scope:id (demo:, research:, research-jp:)."]
    );
  });
});

describe("createTransactionSchema strictness", () => {
  it("rejects an unknown top-level field", () => {
    expect(accepts({ ...VALID_BUY, notes: "extra" })).toBe(false);
    expect(accepts({ ...VALID_BUY, action: "add-transaction" })).toBe(false);
  });

  it("rejects an attempt to set server-owned fields", () => {
    for (const injected of [
      { id: randomUUID() },
      { createdAt: "2026-01-01T00:00:00.000Z" },
      { realizedGain: 500 },
      { costBasis: 0 },
      { averageCost: 1 },
    ]) {
      expect(accepts({ ...VALID_BUY, ...injected })).toBe(false);
    }
  });

  it("reports an unknown key under the request key", () => {
    expect(Object.keys(details({ ...VALID_BUY, id: "x" }))).toEqual(["request"]);
  });
});

describe("createPriceMarkSchema", () => {
  it("parses a valid mark unchanged", () => {
    const result = createPriceMarkSchema.safeParse(VALID_MARK);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(VALID_MARK);
  });

  it("accepts both currencies", () => {
    for (const currency of ["USD", "JPY"] as const) {
      const result = createPriceMarkSchema.safeParse({ ...VALID_MARK, currency });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.currency).toBe(currency);
    }
  });

  it("rejects an unsupported currency", () => {
    for (const currency of ["EUR", "jpy", "", null]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, currency }).success
      ).toBe(false);
    }
  });

  it("accepts a positive fractional price", () => {
    for (const price of [0.0001, 12.34, 460, 5_200] as const) {
      const result = createPriceMarkSchema.safeParse({ ...VALID_MARK, price });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.price).toBe(price);
    }
  });

  it("rejects a zero price", () => {
    // Unlike a purchase price, an observed market price of zero is not a real
    // observation — it would zero out the whole marked value.
    expect(createPriceMarkSchema.safeParse({ ...VALID_MARK, price: 0 }).success).toBe(
      false
    );
  });

  it("rejects a negative price", () => {
    for (const price of [-0.01, -460]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, price }).success
      ).toBe(false);
    }
  });

  it("rejects NaN, Infinity, null and a numeric string price", () => {
    for (const price of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      null,
      "460",
    ]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, price }).success
      ).toBe(false);
    }
  });

  it("requires a real ISO calendar date for asOf", () => {
    expect(
      createPriceMarkSchema.safeParse({ ...VALID_MARK, asOf: "2026-06-30" }).success
    ).toBe(true);
    for (const asOf of [
      "2027-02-30",
      "2026-06-31",
      "2026-6-30",
      "June 2026",
      "2026-06-30T00:00:00.000Z",
      "",
      null,
    ]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, asOf }).success
      ).toBe(false);
    }
  });

  it("reports readable asOf messages", () => {
    const malformed = createPriceMarkSchema.safeParse({
      ...VALID_MARK,
      asOf: "June 2026",
    });
    expect(malformed.success).toBe(false);
    if (malformed.success) return;
    expect(zodDetails(malformed.error).asOf).toEqual([
      "Use an ISO date (YYYY-MM-DD).",
    ]);

    const impossible = createPriceMarkSchema.safeParse({
      ...VALID_MARK,
      asOf: "2027-02-30",
    });
    expect(impossible.success).toBe(false);
    if (impossible.success) return;
    expect(zodDetails(impossible.error).asOf).toEqual([
      "This is not a real calendar date.",
    ]);
  });

  it("applies the same subjectRef pattern as transactions", () => {
    for (const subjectRef of [
      "demo:x",
      "research:aapl",
      "research-jp:toyota",
    ]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, subjectRef }).success
      ).toBe(true);
    }
    for (const subjectRef of [
      "portfolio:x",
      "demo:",
      "Demo:x",
      "demo:Northstar",
      "",
      `demo:${"a".repeat(101)}`,
    ]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, subjectRef }).success
      ).toBe(false);
    }
  });

  it("rejects unknown fields, including transaction fields", () => {
    for (const injected of [
      { note: "manual mark" },
      { quantity: 10 },
      { id: randomUUID() },
      { createdAt: "2026-06-30T00:00:00.000Z" },
      { date: "2026-06-30" },
    ]) {
      expect(
        createPriceMarkSchema.safeParse({ ...VALID_MARK, ...injected }).success
      ).toBe(false);
    }
  });

  it("rejects a missing field", () => {
    for (const field of ["subjectRef", "currency", "price", "asOf"]) {
      expect(
        createPriceMarkSchema.safeParse(omit({ ...VALID_MARK }, field)).success
      ).toBe(false);
    }
  });

  it("requires an object body", () => {
    for (const body of [null, undefined, 460, "460", []]) {
      expect(createPriceMarkSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("zodDetails", () => {
  it("keys the messages by field name", () => {
    const result = details({
      ...VALID_BUY,
      subjectRef: "portfolio:x",
      subjectLabel: "   ",
      date: "March 2027",
      quantity: 0,
    });

    expect(Object.keys(result).sort()).toEqual([
      "date",
      "quantity",
      "subjectLabel",
      "subjectRef",
    ]);
    expect(result.subjectRef).toBeInstanceOf(Array);
    expect(typeof result.subjectRef?.[0]).toBe("string");
  });

  it("uses the request key when the issue has no path", () => {
    expect(Object.keys(details(null))).toEqual(["request"]);
    expect(details(null).request?.length).toBeGreaterThan(0);
  });

  it("collects several messages for one field into a single array", () => {
    // A quantity that is both non-positive and out of kind gives one array.
    const result = details({ ...VALID_BUY, quantity: 0 });

    expect(result.quantity).toBeInstanceOf(Array);
    expect(result.quantity?.length).toBeGreaterThanOrEqual(1);
  });

  it("returns an empty object shape rather than throwing on no issues", () => {
    // Every value is a string array, which is what the route serializes.
    const result = details({ ...VALID_BUY, fee: -1 });

    for (const messages of Object.values(result)) {
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.every((message) => typeof message === "string")).toBe(true);
    }
  });

  it("does not leak the submitted payload back to the caller", () => {
    const result = details({ ...VALID_BUY, quantity: -1 });

    expect(JSON.stringify(result)).not.toContain(
      "demo:stock-us-northstar-software"
    );
    expect("data" in result).toBe(false);
  });
});
