import { describe, expect, it } from "vitest";
import {
  evaluateEtfFilters,
  filterEtfSnapshots,
  type EtfFilters,
} from "@/lib/screener/etf-filter";
import { demoEtfs } from "@/data/demo/etfs";
import { etfSymbols, makeEtf, type EtfMetricOverrides } from "./helpers/etf";

const CATEGORY_LABEL = "Category";
const REGION_LABEL = "Exposure region";
const EXPENSE_LABEL = "Maximum expense ratio";
const AUM_LABEL = "Minimum assets under management";
const VOLUME_LABEL = "Minimum average volume";
const YIELD_LABEL = "Minimum dividend yield";
const LEVERAGED_LABEL = "Exclude leveraged ETFs";
const INVERSE_LABEL = "Exclude inverse ETFs";

function evaluate(filters: EtfFilters, metrics: EtfMetricOverrides = {}) {
  return evaluateEtfFilters(makeEtf({ metrics }), filters);
}

describe("evaluateEtfFilters with no active filters", () => {
  it("passes a fund with complete fund data", () => {
    const outcome = evaluate(
      {},
      { expenseRatio: 0.002, assetsUnderManagement: 5_000_000_000 }
    );

    expect(outcome).toEqual({
      passed: true,
      failedFilters: [],
      unavailableFilters: [],
    });
  });

  it("passes a fund whose every metric is missing", () => {
    const outcome = evaluate({});

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("treats excludeLeveraged false as inactive even when status is unknown", () => {
    const outcome = evaluateEtfFilters(makeEtf({ isLeveraged: null }), {
      excludeLeveraged: false,
    });

    expect(outcome.passed).toBe(true);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("treats excludeInverse false as inactive even when status is unknown", () => {
    const outcome = evaluateEtfFilters(makeEtf({ isInverse: null }), {
      excludeInverse: false,
    });

    expect(outcome.passed).toBe(true);
    expect(outcome.unavailableFilters).toEqual([]);
  });
});

describe("maximumExpenseRatio filter", () => {
  const filters: EtfFilters = { maximumExpenseRatio: 0.005 };

  it("passes an expense ratio below the maximum", () => {
    const outcome = evaluate(filters, { expenseRatio: 0.0009 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("passes an expense ratio exactly at the maximum", () => {
    const outcome = evaluate(filters, { expenseRatio: 0.005 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("fails an expense ratio above the maximum", () => {
    const outcome = evaluate(filters, { expenseRatio: 0.0051 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([EXPENSE_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("reports a missing expense ratio as unavailable, not failed", () => {
    const outcome = evaluate(filters, { expenseRatio: null });

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([EXPENSE_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("does not treat a missing expense ratio as 0%", () => {
    // 0% would pass every maximum; missing must never pass.
    const outcome = evaluate({ maximumExpenseRatio: 1 }, { expenseRatio: null });

    expect(outcome.passed).toBe(false);
  });

  it("passes a genuine zero expense ratio", () => {
    const outcome = evaluate(filters, { expenseRatio: 0 });

    expect(outcome.passed).toBe(true);
  });
});

describe("minimumAssetsUnderManagement filter", () => {
  const filters: EtfFilters = { minimumAssetsUnderManagement: 1_000_000_000 };

  it("passes AUM above the minimum", () => {
    const outcome = evaluate(filters, { assetsUnderManagement: 6_250_000_000 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("passes AUM exactly at the minimum", () => {
    const outcome = evaluate(filters, { assetsUnderManagement: 1_000_000_000 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("fails AUM below the minimum", () => {
    const outcome = evaluate(filters, { assetsUnderManagement: 999_999_999 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([AUM_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("reports missing AUM as unavailable, not failed", () => {
    const outcome = evaluate(filters, { assetsUnderManagement: null });

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([AUM_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("minimumAverageVolume filter", () => {
  const filters: EtfFilters = { minimumAverageVolume: 500_000 };

  it("passes volume above the minimum", () => {
    const outcome = evaluate(filters, { averageVolume: 812_000 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("passes volume exactly at the minimum", () => {
    const outcome = evaluate(filters, { averageVolume: 500_000 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("fails volume below the minimum", () => {
    const outcome = evaluate(filters, { averageVolume: 342_000 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([VOLUME_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("reports missing volume as unavailable, not failed", () => {
    const outcome = evaluate(filters, { averageVolume: null });

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([VOLUME_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("minimumDividendYield filter", () => {
  const filters: EtfFilters = { minimumDividendYield: 0.02 };

  it("passes a yield above the minimum", () => {
    const outcome = evaluate(filters, { dividendYield: 0.036 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("passes a yield exactly at the minimum", () => {
    const outcome = evaluate(filters, { dividendYield: 0.02 });

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("fails a yield below the minimum", () => {
    const outcome = evaluate(filters, { dividendYield: 0.019 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([YIELD_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("reports a missing yield as unavailable, not failed", () => {
    // A fund making no distributions has an unknown yield, not a 0% yield.
    const outcome = evaluate(filters, { dividendYield: null });

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([YIELD_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("category filter", () => {
  const filters: EtfFilters = { category: "Thematic Equity" };

  it("passes a matching category", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ category: "Thematic Equity" }),
      filters
    );

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("fails a different category", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ category: "Global Equity" }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([CATEGORY_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("matches exactly and is case-sensitive", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ category: "thematic equity" }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([CATEGORY_LABEL]);
  });

  it("reports an unknown category as unavailable, not failed", () => {
    const outcome = evaluateEtfFilters(makeEtf({}), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([CATEGORY_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("ignores the category of a fund when the filter is inactive", () => {
    const outcome = evaluateEtfFilters(makeEtf({ category: undefined }), {});

    expect(outcome.passed).toBe(true);
  });
});

describe("exposureRegion filter", () => {
  const filters: EtfFilters = { exposureRegion: "Japan" };

  it("passes a fund whose exposure includes the region", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ exposureRegions: ["United States", "Europe", "Japan"] }),
      filters
    );

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("passes a US-listed fund with Japan exposure (listing is not exposure)", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ listingMarket: "US", exposureRegions: ["Japan"] }),
      filters
    );

    expect(outcome.passed).toBe(true);
  });

  it("fails a fund whose exposure excludes the region", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ exposureRegions: ["United States"] }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([REGION_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("reports an empty exposure list as unavailable, not failed", () => {
    const outcome = evaluateEtfFilters(makeEtf({ exposureRegions: [] }), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([REGION_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("excludeLeveraged filter", () => {
  const filters: EtfFilters = { excludeLeveraged: true };

  it("fails a known leveraged fund", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({ isLeveraged: true, leverageFactor: 2 }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([LEVERAGED_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("passes a known non-leveraged fund", () => {
    const outcome = evaluateEtfFilters(makeEtf({ isLeveraged: false }), filters);

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("treats unknown leverage status as unavailable, never as not leveraged", () => {
    // "Exclude leveraged" cannot be satisfied by "we don't know".
    const outcome = evaluateEtfFilters(makeEtf({ isLeveraged: null }), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([LEVERAGED_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("excludeInverse filter", () => {
  const filters: EtfFilters = { excludeInverse: true };

  it("fails a known inverse fund", () => {
    const outcome = evaluateEtfFilters(makeEtf({ isInverse: true }), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([INVERSE_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("passes a known non-inverse fund", () => {
    const outcome = evaluateEtfFilters(makeEtf({ isInverse: false }), filters);

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("treats unknown inverse status as unavailable, never as not inverse", () => {
    const outcome = evaluateEtfFilters(makeEtf({ isInverse: null }), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([INVERSE_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("evaluateEtfFilters with several active filters", () => {
  const filters: EtfFilters = {
    category: "Global Equity",
    exposureRegion: "Japan",
    maximumExpenseRatio: 0.005,
    minimumAssetsUnderManagement: 1_000_000_000,
    minimumAverageVolume: 500_000,
    minimumDividendYield: 0.01,
    excludeLeveraged: true,
    excludeInverse: true,
  };

  it("passes a fund that satisfies every active filter", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({
        category: "Global Equity",
        exposureRegions: ["United States", "Japan"],
        metrics: {
          expenseRatio: 0.002,
          assetsUnderManagement: 5_000_000_000,
          averageVolume: 900_000,
          dividendYield: 0.014,
        },
        isLeveraged: false,
        isInverse: false,
      }),
      filters
    );

    expect(outcome).toEqual({
      passed: true,
      failedFilters: [],
      unavailableFilters: [],
    });
  });

  it("accumulates a label for every failing filter", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({
        category: "Leveraged Equity",
        exposureRegions: ["United States"],
        metrics: {
          expenseRatio: 0.0095,
          assetsUnderManagement: 10_000_000,
          averageVolume: 100_000,
          dividendYield: 0.001,
        },
        isLeveraged: true,
        isInverse: true,
      }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([]);
    expect([...outcome.failedFilters].sort()).toEqual(
      [
        AUM_LABEL,
        CATEGORY_LABEL,
        EXPENSE_LABEL,
        INVERSE_LABEL,
        LEVERAGED_LABEL,
        REGION_LABEL,
        VOLUME_LABEL,
        YIELD_LABEL,
      ].sort()
    );
  });

  it("reports an all-missing fund as unavailable for every active filter", () => {
    // The default synthetic fund has no filterable data at all.
    const outcome = evaluateEtfFilters(makeEtf(), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([]);
    expect(outcome.unavailableFilters).toHaveLength(8);
  });

  it("separates failed from unavailable filters on a mixed fund", () => {
    const outcome = evaluateEtfFilters(
      makeEtf({
        category: "Global Equity",
        exposureRegions: ["Japan"],
        metrics: {
          // Missing expense ratio, failing AUM.
          assetsUnderManagement: 10_000_000,
          averageVolume: 900_000,
          dividendYield: 0.014,
        },
        isLeveraged: false,
        isInverse: false,
      }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([AUM_LABEL]);
    expect(outcome.unavailableFilters).toEqual([EXPENSE_LABEL]);
  });

  it("never lets a missing metric pass an active numeric filter", () => {
    const numericFilters: readonly EtfFilters[] = [
      { maximumExpenseRatio: 1 },
      { minimumAssetsUnderManagement: 0 },
      { minimumAverageVolume: 0 },
      { minimumDividendYield: 0 },
    ];

    for (const filter of numericFilters) {
      // Even a maximally permissive threshold cannot be met by missing data.
      expect(evaluateEtfFilters(makeEtf(), filter).passed).toBe(false);
    }
  });
});

describe("filterEtfSnapshots over the demo ETF universe", () => {
  it("returns every fund and no exclusions when no filter is active", () => {
    const result = filterEtfSnapshots(demoEtfs, {});

    expect(result.items).toHaveLength(demoEtfs.length);
    expect(result.filteredOutCount).toBe(0);
    expect(result.excludedForMissingDataCount).toBe(0);
  });

  it("keeps only funds at or under a 0.5% expense ratio", () => {
    const maximumExpenseRatio = 0.005;
    const result = filterEtfSnapshots(demoEtfs, { maximumExpenseRatio });

    const expectedPassing = demoEtfs.filter((etf) => {
      const value = etf.metrics.expenseRatio.value;
      return value !== null && value <= maximumExpenseRatio;
    });

    expect(etfSymbols(result.items)).toEqual(etfSymbols(expectedPassing));
    expect(result.items.length).toBeGreaterThan(0);
    for (const etf of result.items) {
      expect(etf.metrics.expenseRatio.value).not.toBeNull();
    }
  });

  it("counts the fund with no published expense ratio as missing data, not a mismatch", () => {
    const result = filterEtfSnapshots(demoEtfs, { maximumExpenseRatio: 0.005 });

    const missingExpense = demoEtfs.filter(
      (etf) => etf.metrics.expenseRatio.value === null
    );
    expect(etfSymbols(missingExpense)).toEqual(["2559.DEMO"]);

    expect(result.excludedForMissingDataCount).toBe(missingExpense.length);
    expect(etfSymbols(result.items)).not.toContain("2559.DEMO");
    expect(
      result.items.length +
        result.filteredOutCount +
        result.excludedForMissingDataCount
    ).toBe(demoEtfs.length);
  });

  it("removes the leveraged demo fund via excludeLeveraged", () => {
    const result = filterEtfSnapshots(demoEtfs, { excludeLeveraged: true });

    const leveraged = demoEtfs.filter((etf) => etf.metrics.isLeveraged === true);
    expect(etfSymbols(leveraged)).toEqual(["TQ2X.DEMO"]);

    expect(etfSymbols(result.items)).not.toContain("TQ2X.DEMO");
    expect(result.filteredOutCount).toBe(leveraged.length);
    expect(result.excludedForMissingDataCount).toBe(0);
    expect(result.items).toHaveLength(demoEtfs.length - leveraged.length);
  });

  it("selects Japan exposure regardless of listing market", () => {
    const result = filterEtfSnapshots(demoEtfs, { exposureRegion: "Japan" });

    const symbols = etfSymbols(result.items);
    // US-listed, Japan-invested.
    expect(symbols).toContain("JPEQ.DEMO");
    // Tokyo-listed Japan funds.
    expect(symbols).toContain("1306.DEMO");
    expect(symbols).toContain("1489.DEMO");
    // Tokyo-listed but globally invested — still Japan exposure.
    expect(symbols).toContain("2559.DEMO");
    // US-only exposure must not appear.
    expect(symbols).not.toContain("BRDX.DEMO");
    expect(symbols).not.toContain("TQ2X.DEMO");

    expect(symbols).toEqual(
      etfSymbols(
        demoEtfs.filter((etf) => etf.metrics.exposureRegions.includes("Japan"))
      )
    );
    expect(result.excludedForMissingDataCount).toBe(0);
  });

  it("returns an empty result set for a category no demo fund uses", () => {
    const result = filterEtfSnapshots(demoEtfs, { category: "Municipal Bond" });

    expect(result.items).toEqual([]);
    expect(result.filteredOutCount).toBe(demoEtfs.length);
    expect(result.excludedForMissingDataCount).toBe(0);
  });

  it("preserves the input order of the passing funds", () => {
    const result = filterEtfSnapshots(demoEtfs, {
      minimumAssetsUnderManagement: 1_000_000_000,
    });
    const passingInInputOrder = demoEtfs.filter((etf) => {
      const value = etf.metrics.assetsUnderManagement.value;
      return value !== null && value >= 1_000_000_000;
    });

    expect(etfSymbols(result.items)).toEqual(etfSymbols(passingInInputOrder));
  });

  it("does not mutate the input array or its snapshots", () => {
    const before = JSON.stringify(demoEtfs);
    const originalOrder = etfSymbols(demoEtfs);

    filterEtfSnapshots(demoEtfs, {
      maximumExpenseRatio: 0.005,
      excludeLeveraged: true,
      exposureRegion: "Japan",
    });

    expect(etfSymbols(demoEtfs)).toEqual(originalOrder);
    expect(JSON.stringify(demoEtfs)).toBe(before);
  });

  it("is deterministic across repeated calls", () => {
    const filters: EtfFilters = {
      maximumExpenseRatio: 0.005,
      exposureRegion: "Japan",
    };

    expect(etfSymbols(filterEtfSnapshots(demoEtfs, filters).items)).toEqual(
      etfSymbols(filterEtfSnapshots(demoEtfs, filters).items)
    );
  });
});
