import type { AssetType, SupportedMarket } from "@/lib/domain";
import type { EtfFilters } from "@/lib/screener/etf-filter";
import {
  isIndexSortField,
  type IndexSortField,
  type SortDirection,
} from "./index-sort";

/**
 * URL-backed Discovery state. Defaults are never written to the URL, so
 * `/discover` stays clean until the user changes something. Invalid values
 * fall back to defaults rather than producing an error state.
 *
 * D4: ETF filters and index sorting are asset-scoped — they parse only when
 * the matching tab is active and are dropped from the URL when the asset
 * type changes, so incompatible filters are never preserved (SPEC §10.6).
 */
export interface DiscoveryUrlState {
  assetType: AssetType;
  market: SupportedMarket | undefined;
  query: string;
  page: number;

  /** Present only when assetType === "etf". */
  etfFilters: EtfFilters;
  /** Present only when assetType === "index". */
  indexSort: { field: IndexSortField; direction: SortDirection } | null;
}

export const DEFAULT_DISCOVERY_STATE: DiscoveryUrlState = {
  assetType: "stock",
  market: undefined,
  query: "",
  page: 1,
  etfFilters: {},
  indexSort: null,
};

const ASSET_TYPES = new Set<string>(["stock", "etf", "index"]);
const MARKETS = new Set<string>(["US", "JP"]);

function parsePositiveNumber(raw: string | null): number | undefined {
  // A valueless param (?maxExpense=) is "not set", never an active zero
  // filter — Number("") is 0, which would silently exclude most funds.
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseDecimalFraction(raw: string | null): number | undefined {
  const value = parsePositiveNumber(raw);
  return value !== undefined && value <= 1 ? value : undefined;
}

/** Parse search params into state. Unknown or invalid values fall back safely. */
export function parseDiscoveryUrlState(
  searchParams: URLSearchParams
): DiscoveryUrlState {
  const assetParam = searchParams.get("asset");
  const marketParam = searchParams.get("market");
  const queryParam = searchParams.get("q");
  const pageParam = searchParams.get("page");

  const assetType = (
    assetParam !== null && ASSET_TYPES.has(assetParam) ? assetParam : "stock"
  ) as AssetType;

  const market = (
    marketParam !== null && MARKETS.has(marketParam) ? marketParam : undefined
  ) as SupportedMarket | undefined;

  const parsedPage = pageParam !== null ? Number(pageParam) : 1;
  const page =
    Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  // Asset-scoped: ETF filter params are ignored unless the ETF tab is active.
  const etfFilters: EtfFilters = {};
  if (assetType === "etf") {
    const category = searchParams.get("etfCategory");
    if (category !== null && category.trim() !== "") {
      etfFilters.category = category.trim().slice(0, 100);
    }
    const region = searchParams.get("etfRegion");
    if (region !== null && region.trim() !== "") {
      etfFilters.exposureRegion = region.trim().slice(0, 100);
    }
    const maxExpense = parseDecimalFraction(searchParams.get("maxExpense"));
    if (maxExpense !== undefined) etfFilters.maximumExpenseRatio = maxExpense;
    const minAum = parsePositiveNumber(searchParams.get("minAum"));
    if (minAum !== undefined) etfFilters.minimumAssetsUnderManagement = minAum;
    const minVolume = parsePositiveNumber(searchParams.get("minVolume"));
    if (minVolume !== undefined) etfFilters.minimumAverageVolume = minVolume;
    const minYield = parseDecimalFraction(searchParams.get("minYield"));
    if (minYield !== undefined) etfFilters.minimumDividendYield = minYield;
    if (searchParams.get("exLeveraged") === "1") {
      etfFilters.excludeLeveraged = true;
    }
    if (searchParams.get("exInverse") === "1") {
      etfFilters.excludeInverse = true;
    }
  }

  // Asset-scoped: index sort params are ignored unless the Indices tab is active.
  let indexSort: DiscoveryUrlState["indexSort"] = null;
  if (assetType === "index") {
    const field = searchParams.get("sortField");
    const direction = searchParams.get("sortDir");
    if (
      field !== null &&
      isIndexSortField(field) &&
      (direction === "asc" || direction === "desc")
    ) {
      indexSort = { field, direction };
    }
  }

  return {
    assetType,
    market,
    // Code-point-aware clamp so a 100-unit cut can never split a surrogate pair.
    query: [...(queryParam ?? "").trim()].slice(0, 100).join(""),
    page,
    etfFilters,
    indexSort,
  };
}

/** Serialize state to search params, omitting defaults and incompatible params. */
export function serializeDiscoveryUrlState(
  state: DiscoveryUrlState
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.assetType !== DEFAULT_DISCOVERY_STATE.assetType) {
    params.set("asset", state.assetType);
  }
  if (state.market !== undefined) {
    params.set("market", state.market);
  }
  if (state.query !== "") {
    params.set("q", state.query);
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  }

  if (state.assetType === "etf") {
    const f = state.etfFilters;
    if (f.category !== undefined) params.set("etfCategory", f.category);
    if (f.exposureRegion !== undefined) params.set("etfRegion", f.exposureRegion);
    if (f.maximumExpenseRatio !== undefined) {
      params.set("maxExpense", String(f.maximumExpenseRatio));
    }
    if (f.minimumAssetsUnderManagement !== undefined) {
      params.set("minAum", String(f.minimumAssetsUnderManagement));
    }
    if (f.minimumAverageVolume !== undefined) {
      params.set("minVolume", String(f.minimumAverageVolume));
    }
    if (f.minimumDividendYield !== undefined) {
      params.set("minYield", String(f.minimumDividendYield));
    }
    if (f.excludeLeveraged === true) params.set("exLeveraged", "1");
    if (f.excludeInverse === true) params.set("exInverse", "1");
  }

  if (state.assetType === "index" && state.indexSort !== null) {
    params.set("sortField", state.indexSort.field);
    params.set("sortDir", state.indexSort.direction);
  }

  return params;
}

export function discoveryStatesEqual(
  a: DiscoveryUrlState,
  b: DiscoveryUrlState
): boolean {
  return (
    serializeDiscoveryUrlState(a).toString() ===
    serializeDiscoveryUrlState(b).toString()
  );
}

/**
 * Transition to a different asset type, dropping incompatible state:
 * ETF filters, index sort, and pagination reset; market and search survive.
 */
export function changeAssetType(
  state: DiscoveryUrlState,
  assetType: AssetType
): DiscoveryUrlState {
  return {
    assetType,
    market: state.market,
    query: state.query,
    page: 1,
    etfFilters: {},
    indexSort: null,
  };
}
