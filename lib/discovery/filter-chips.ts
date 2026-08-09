import { formatCompactNumber, formatPercent } from "@/lib/format";
import type { DiscoveryUrlState } from "./url-state";
import type { EtfFilters } from "@/lib/screener/etf-filter";

/**
 * One removable filter chip (D6). `remove` returns the state with just that
 * refinement cleared, so the chip row and clear-all behavior stay pure and
 * testable outside the UI.
 */
export interface FilterChip {
  key: string;
  label: string;
  remove: (state: DiscoveryUrlState) => DiscoveryUrlState;
}

function removeEtfFilter(
  key: keyof EtfFilters
): (state: DiscoveryUrlState) => DiscoveryUrlState {
  return (state) => {
    const etfFilters = { ...state.etfFilters };
    delete etfFilters[key];
    return { ...state, etfFilters, page: 1 };
  };
}

const INDEX_SORT_LABELS: Record<string, string> = {
  oneMonthReturn: "1-month return",
  yearToDateReturn: "Year-to-date return",
  oneYearReturn: "1-year return",
};

/** Chips for the active URL-backed refinements of the current tab. */
export function buildFilterChips(state: DiscoveryUrlState): FilterChip[] {
  const chips: FilterChip[] = [];

  if (state.query !== "") {
    chips.push({
      key: "query",
      label: `Search: ${state.query}`,
      remove: (s) => ({ ...s, query: "", page: 1 }),
    });
  }

  if (state.assetType === "etf") {
    const f = state.etfFilters;
    if (f.category !== undefined) {
      chips.push({
        key: "etf-category",
        label: `Category: ${f.category}`,
        remove: removeEtfFilter("category"),
      });
    }
    if (f.exposureRegion !== undefined) {
      chips.push({
        key: "etf-region",
        label: `Exposure: ${f.exposureRegion}`,
        remove: removeEtfFilter("exposureRegion"),
      });
    }
    if (f.maximumExpenseRatio !== undefined) {
      chips.push({
        key: "etf-max-expense",
        label: `Expense ≤ ${formatPercent(f.maximumExpenseRatio, 2)}`,
        remove: removeEtfFilter("maximumExpenseRatio"),
      });
    }
    if (f.minimumAssetsUnderManagement !== undefined) {
      chips.push({
        key: "etf-min-aum",
        label: `AUM ≥ ${formatCompactNumber(f.minimumAssetsUnderManagement)}`,
        remove: removeEtfFilter("minimumAssetsUnderManagement"),
      });
    }
    if (f.minimumAverageVolume !== undefined) {
      chips.push({
        key: "etf-min-volume",
        label: `Volume ≥ ${formatCompactNumber(f.minimumAverageVolume)}`,
        remove: removeEtfFilter("minimumAverageVolume"),
      });
    }
    if (f.minimumDividendYield !== undefined) {
      chips.push({
        key: "etf-min-yield",
        label: `Yield ≥ ${formatPercent(f.minimumDividendYield)}`,
        remove: removeEtfFilter("minimumDividendYield"),
      });
    }
    if (f.excludeLeveraged === true) {
      chips.push({
        key: "etf-ex-leveraged",
        label: "Excluding leveraged",
        remove: removeEtfFilter("excludeLeveraged"),
      });
    }
    if (f.excludeInverse === true) {
      chips.push({
        key: "etf-ex-inverse",
        label: "Excluding inverse",
        remove: removeEtfFilter("excludeInverse"),
      });
    }
  }

  if (state.assetType === "index" && state.indexSort !== null) {
    const fieldLabel =
      INDEX_SORT_LABELS[state.indexSort.field] ?? state.indexSort.field;
    const directionLabel =
      state.indexSort.direction === "desc" ? "highest first" : "lowest first";
    chips.push({
      key: "index-sort",
      label: `Sorted by ${fieldLabel} (${directionLabel})`,
      remove: (s) => ({ ...s, indexSort: null, page: 1 }),
    });
  }

  return chips;
}

/** Clear every removable refinement while keeping tab and market selection. */
export function clearAllFilters(state: DiscoveryUrlState): DiscoveryUrlState {
  return {
    ...state,
    query: "",
    etfFilters: {},
    indexSort: null,
    page: 1,
  };
}
