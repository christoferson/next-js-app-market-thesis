import { describe, expect, it } from "vitest";
import type { IndexSnapshot } from "@/lib/domain";
import {
  INDEX_SORT_FIELDS,
  isIndexSortField,
  sortIndexSnapshots,
  type IndexSortField,
} from "@/lib/discovery/index-sort";
import { demoIndices } from "@/data/demo/indices";
import { indexSymbols, makeIndex } from "./helpers/index";

/**
 * Expected ordering derived from the data rather than hardcoded: values are
 * read from the snapshots, sorted numerically, and the nulls appended in
 * symbol order. Nulls last applies in both directions.
 */
function expectedOrder(
  snapshots: readonly IndexSnapshot[],
  field: IndexSortField,
  direction: "asc" | "desc"
): string[] {
  const withValue: { symbol: string; value: number }[] = [];
  const withoutValue: string[] = [];

  for (const snapshot of snapshots) {
    const value = snapshot.metrics[field].value;
    const symbol = snapshot.instrument.symbol;
    if (value === null) {
      withoutValue.push(symbol);
    } else {
      withValue.push({ symbol, value });
    }
  }

  withValue.sort((a, b) =>
    a.value === b.value
      ? a.symbol.localeCompare(b.symbol)
      : direction === "asc"
        ? a.value - b.value
        : b.value - a.value
  );

  return [
    ...withValue.map((entry) => entry.symbol),
    ...[...withoutValue].sort((a, b) => a.localeCompare(b)),
  ];
}

describe("isIndexSortField", () => {
  it.each([...INDEX_SORT_FIELDS])("accepts %s", (field) => {
    expect(isIndexSortField(field)).toBe(true);
  });

  it("exposes exactly the three supported return fields", () => {
    expect([...INDEX_SORT_FIELDS]).toEqual([
      "oneMonthReturn",
      "yearToDateReturn",
      "oneYearReturn",
    ]);
  });

  it.each([
    "price",
    "",
    "level",
    "constituentCount",
    "OneYearReturn",
    "peRatio",
  ])("rejects %s", (value) => {
    expect(isIndexSortField(value)).toBe(false);
  });
});

describe("sortIndexSnapshots on synthetic values", () => {
  const snapshots: readonly IndexSnapshot[] = [
    makeIndex({
      symbol: "MID.DEMO",
      metrics: { oneMonthReturn: 0.02, yearToDateReturn: 0.05, oneYearReturn: 0.1 },
    }),
    makeIndex({
      symbol: "LOW.DEMO",
      metrics: {
        oneMonthReturn: -0.03,
        yearToDateReturn: -0.01,
        oneYearReturn: -0.2,
      },
    }),
    makeIndex({
      symbol: "HIGH.DEMO",
      metrics: { oneMonthReturn: 0.09, yearToDateReturn: 0.21, oneYearReturn: 0.4 },
    }),
  ];

  it.each([...INDEX_SORT_FIELDS])("sorts %s ascending", (field) => {
    const sorted = sortIndexSnapshots(snapshots, field, "asc");

    expect(indexSymbols(sorted)).toEqual(["LOW.DEMO", "MID.DEMO", "HIGH.DEMO"]);
    expect(indexSymbols(sorted)).toEqual(expectedOrder(snapshots, field, "asc"));
  });

  it.each([...INDEX_SORT_FIELDS])("sorts %s descending", (field) => {
    const sorted = sortIndexSnapshots(snapshots, field, "desc");

    expect(indexSymbols(sorted)).toEqual(["HIGH.DEMO", "MID.DEMO", "LOW.DEMO"]);
    expect(indexSymbols(sorted)).toEqual(expectedOrder(snapshots, field, "desc"));
  });

  it("sorts negative returns below positive ones ascending", () => {
    const sorted = sortIndexSnapshots(snapshots, "oneYearReturn", "asc");

    expect(sorted[0]?.instrument.symbol).toBe("LOW.DEMO");
    expect(sorted[0]?.metrics.oneYearReturn.value).toBe(-0.2);
  });

  it("does not mutate the input array", () => {
    const originalOrder = indexSymbols(snapshots);

    sortIndexSnapshots(snapshots, "oneYearReturn", "desc");
    sortIndexSnapshots(snapshots, "oneMonthReturn", "asc");

    expect(indexSymbols(snapshots)).toEqual(originalOrder);
  });

  it("returns a new array", () => {
    const sorted = sortIndexSnapshots(snapshots, "oneYearReturn", "asc");

    expect(sorted).not.toBe(snapshots);
    expect(sorted).toHaveLength(snapshots.length);
  });

  it("produces identical results across repeated calls", () => {
    const first = sortIndexSnapshots(snapshots, "yearToDateReturn", "desc");
    const second = sortIndexSnapshots(snapshots, "yearToDateReturn", "desc");

    expect(indexSymbols(first)).toEqual(indexSymbols(second));
  });

  it("handles an empty and a single-item input", () => {
    expect(sortIndexSnapshots([], "oneYearReturn", "asc")).toEqual([]);
    const single = [makeIndex({ symbol: "ONE.DEMO" })];
    expect(indexSymbols(sortIndexSnapshots(single, "oneYearReturn", "desc"))).toEqual(
      ["ONE.DEMO"]
    );
  });
});

describe("sortIndexSnapshots missing-value handling", () => {
  const withMissing: readonly IndexSnapshot[] = [
    makeIndex({ symbol: "NULLB.DEMO", metrics: { oneYearReturn: null } }),
    makeIndex({ symbol: "POS.DEMO", metrics: { oneYearReturn: 0.15 } }),
    makeIndex({ symbol: "NULLA.DEMO", metrics: { oneYearReturn: null } }),
    makeIndex({ symbol: "NEG.DEMO", metrics: { oneYearReturn: -0.05 } }),
  ];

  it("places missing values last when sorting ascending", () => {
    const sorted = sortIndexSnapshots(withMissing, "oneYearReturn", "asc");

    expect(indexSymbols(sorted)).toEqual([
      "NEG.DEMO",
      "POS.DEMO",
      "NULLA.DEMO",
      "NULLB.DEMO",
    ]);
  });

  it("places missing values last when sorting descending", () => {
    const sorted = sortIndexSnapshots(withMissing, "oneYearReturn", "desc");

    expect(indexSymbols(sorted)).toEqual([
      "POS.DEMO",
      "NEG.DEMO",
      "NULLA.DEMO",
      "NULLB.DEMO",
    ]);
  });

  it("never sorts a missing value as if it were zero", () => {
    const ascending = sortIndexSnapshots(withMissing, "oneYearReturn", "asc");
    const negativeIndex = indexSymbols(ascending).indexOf("NEG.DEMO");
    const missingIndex = indexSymbols(ascending).indexOf("NULLA.DEMO");

    // Zero would sort above the -5% return; missing must sort below it.
    expect(missingIndex).toBeGreaterThan(negativeIndex);
  });

  it("orders an all-missing set deterministically by symbol", () => {
    const allMissing = [
      makeIndex({ symbol: "CCC.DEMO" }),
      makeIndex({ symbol: "AAA.DEMO" }),
      makeIndex({ symbol: "BBB.DEMO" }),
    ];

    for (const direction of ["asc", "desc"] as const) {
      expect(
        indexSymbols(sortIndexSnapshots(allMissing, "oneMonthReturn", direction))
      ).toEqual(["AAA.DEMO", "BBB.DEMO", "CCC.DEMO"]);
    }
  });
});

describe("sortIndexSnapshots tie-breaking", () => {
  const tied: readonly IndexSnapshot[] = [
    makeIndex({ symbol: "ZED.DEMO", metrics: { yearToDateReturn: 0.05 } }),
    makeIndex({ symbol: "ALFA.DEMO", metrics: { yearToDateReturn: 0.05 } }),
    makeIndex({ symbol: "MIKE.DEMO", metrics: { yearToDateReturn: 0.05 } }),
  ];

  it("breaks ties by symbol ascending, in both sort directions", () => {
    for (const direction of ["asc", "desc"] as const) {
      expect(
        indexSymbols(sortIndexSnapshots(tied, "yearToDateReturn", direction))
      ).toEqual(["ALFA.DEMO", "MIKE.DEMO", "ZED.DEMO"]);
    }
  });

  it("keeps tie-breaking stable across repeated calls", () => {
    const first = sortIndexSnapshots(tied, "yearToDateReturn", "desc");
    const second = sortIndexSnapshots(first, "yearToDateReturn", "desc");

    expect(indexSymbols(first)).toEqual(indexSymbols(second));
  });
});

describe("sortIndexSnapshots over the demo index universe", () => {
  it("covers all six demo indices with one missing 1-year return", () => {
    expect(demoIndices).toHaveLength(6);

    const missingOneYear = demoIndices.filter(
      (index) => index.metrics.oneYearReturn.value === null
    );
    expect(indexSymbols(missingOneYear)).toEqual(["DMOSML.DEMO"]);
  });

  it.each([...INDEX_SORT_FIELDS])(
    "matches the data-derived order for %s in both directions",
    (field) => {
      for (const direction of ["asc", "desc"] as const) {
        expect(
          indexSymbols(sortIndexSnapshots(demoIndices, field, direction))
        ).toEqual(expectedOrder(demoIndices, field, direction));
      }
    }
  );

  it("sorts year-to-date return descending with the strongest first", () => {
    const sorted = sortIndexSnapshots(demoIndices, "yearToDateReturn", "desc");
    const values = sorted.map((index) => index.metrics.yearToDateReturn.value);

    expect(indexSymbols(sorted)).toEqual(
      expectedOrder(demoIndices, "yearToDateReturn", "desc")
    );
    // Every demo index publishes a YTD return, so the series is monotonic.
    expect(values).not.toContain(null);
    for (let position = 1; position < values.length; position += 1) {
      const previous = values[position - 1];
      const current = values[position];
      expect(previous).not.toBeNull();
      expect(current).not.toBeNull();
      expect(previous ?? 0).toBeGreaterThanOrEqual(current ?? 0);
    }
    // The all-negative demo index sorts last on a descending return sort.
    expect(sorted.at(-1)?.instrument.symbol).toBe("0250.DEMO");
  });

  it("puts the index with no 1-year history last in both directions", () => {
    const ascending = sortIndexSnapshots(demoIndices, "oneYearReturn", "asc");
    const descending = sortIndexSnapshots(demoIndices, "oneYearReturn", "desc");

    expect(ascending.at(-1)?.instrument.symbol).toBe("DMOSML.DEMO");
    expect(descending.at(-1)?.instrument.symbol).toBe("DMOSML.DEMO");
    expect(ascending.at(-1)?.metrics.oneYearReturn.unavailableReason).toBeDefined();
  });

  it("does not mutate the demo fixture array", () => {
    const originalOrder = indexSymbols(demoIndices);

    for (const field of INDEX_SORT_FIELDS) {
      sortIndexSnapshots(demoIndices, field, "asc");
      sortIndexSnapshots(demoIndices, field, "desc");
    }

    expect(indexSymbols(demoIndices)).toEqual(originalOrder);
  });
});
