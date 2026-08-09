import { describe, expect, it } from "vitest";
import {
  buildFilterChips,
  clearAllFilters,
} from "@/lib/discovery/filter-chips";
import {
  DEFAULT_DISCOVERY_STATE,
  type DiscoveryUrlState,
} from "@/lib/discovery/url-state";

const base = DEFAULT_DISCOVERY_STATE;

describe("buildFilterChips", () => {
  it("returns no chips for the default state", () => {
    expect(buildFilterChips(base)).toEqual([]);
  });

  it("builds a search chip whose removal clears the query and resets the page", () => {
    const state: DiscoveryUrlState = { ...base, query: "sakura", page: 3 };
    const chips = buildFilterChips(state);

    expect(chips).toHaveLength(1);
    expect(chips[0]?.label).toBe("Search: sakura");

    const removed = chips[0]!.remove(state);
    expect(removed.query).toBe("");
    expect(removed.page).toBe(1);
    expect(removed.assetType).toBe(state.assetType);
  });

  it("builds one chip per active ETF filter with formatted labels", () => {
    const state: DiscoveryUrlState = {
      ...base,
      assetType: "etf",
      etfFilters: {
        maximumExpenseRatio: 0.005,
        excludeLeveraged: true,
        minimumDividendYield: 0.02,
      },
    };
    const labels = buildFilterChips(state).map((chip) => chip.label);

    expect(labels).toContain("Expense ≤ 0.50%");
    expect(labels).toContain("Excluding leveraged");
    expect(labels).toContain("Yield ≥ 2.0%");
    expect(labels).toHaveLength(3);
  });

  it("removing one ETF chip keeps the other filters", () => {
    const state: DiscoveryUrlState = {
      ...base,
      assetType: "etf",
      etfFilters: { maximumExpenseRatio: 0.005, excludeLeveraged: true },
      page: 2,
    };
    const chip = buildFilterChips(state).find(
      (c) => c.key === "etf-max-expense"
    );

    const removed = chip!.remove(state);
    expect(removed.etfFilters).toEqual({ excludeLeveraged: true });
    expect(removed.page).toBe(1);
  });

  it("ignores ETF filters when another tab is active", () => {
    const state: DiscoveryUrlState = {
      ...base,
      assetType: "stock",
      etfFilters: { maximumExpenseRatio: 0.005 },
    };
    expect(buildFilterChips(state)).toEqual([]);
  });

  it("builds an index-sort chip only on the indices tab", () => {
    const sorted: DiscoveryUrlState = {
      ...base,
      assetType: "index",
      indexSort: { field: "yearToDateReturn", direction: "desc" },
    };
    const chips = buildFilterChips(sorted);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.label).toBe("Sorted by Year-to-date return (highest first)");

    const removed = chips[0]!.remove(sorted);
    expect(removed.indexSort).toBeNull();

    expect(
      buildFilterChips({ ...sorted, assetType: "etf", indexSort: sorted.indexSort })
    ).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state: DiscoveryUrlState = {
      ...base,
      assetType: "etf",
      etfFilters: { excludeLeveraged: true },
      query: "demo",
    };
    const before = structuredClone(state);
    for (const chip of buildFilterChips(state)) {
      chip.remove(state);
    }
    expect(state).toEqual(before);
  });
});

describe("clearAllFilters", () => {
  it("clears query, ETF filters, index sort, and pagination", () => {
    const state: DiscoveryUrlState = {
      ...base,
      assetType: "etf",
      market: "JP",
      query: "demo",
      page: 4,
      etfFilters: { excludeLeveraged: true, maximumExpenseRatio: 0.005 },
    };
    const cleared = clearAllFilters(state);

    expect(cleared.query).toBe("");
    expect(cleared.etfFilters).toEqual({});
    expect(cleared.indexSort).toBeNull();
    expect(cleared.page).toBe(1);
  });

  it("preserves tab and market selection", () => {
    const state: DiscoveryUrlState = {
      ...base,
      assetType: "index",
      market: "US",
      indexSort: { field: "oneYearReturn", direction: "asc" },
    };
    const cleared = clearAllFilters(state);

    expect(cleared.assetType).toBe("index");
    expect(cleared.market).toBe("US");
    expect(cleared.indexSort).toBeNull();
  });
});
