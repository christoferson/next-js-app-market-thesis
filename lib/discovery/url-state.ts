import type { AssetType, SupportedMarket } from "@/lib/domain";

/**
 * URL-backed Discovery state (D2). Defaults are never written to the URL,
 * so `/discover` stays clean until the user changes something. Invalid
 * values fall back to defaults rather than producing an error state.
 */
export interface DiscoveryUrlState {
  assetType: AssetType;
  market: SupportedMarket | undefined;
  query: string;
  page: number;
}

export const DEFAULT_DISCOVERY_STATE: DiscoveryUrlState = {
  assetType: "stock",
  market: undefined,
  query: "",
  page: 1,
};

const ASSET_TYPES = new Set<string>(["stock", "etf", "index"]);
const MARKETS = new Set<string>(["US", "JP"]);

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

  return {
    assetType,
    market,
    // Code-point-aware clamp so a 100-unit cut can never split a surrogate pair.
    query: [...(queryParam ?? "").trim()].slice(0, 100).join(""),
    page,
  };
}

/** Serialize state to search params, omitting defaults. */
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
  return params;
}

export function discoveryStatesEqual(
  a: DiscoveryUrlState,
  b: DiscoveryUrlState
): boolean {
  return (
    a.assetType === b.assetType &&
    a.market === b.market &&
    a.query === b.query &&
    a.page === b.page
  );
}
