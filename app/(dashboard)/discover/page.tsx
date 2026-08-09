import { listDiscoveryInstruments } from "@/lib/discovery/service";
import { parseDiscoveryUrlState } from "@/lib/discovery/url-state";
import {
  DiscoveryControls,
  type EtfFacets,
} from "@/components/discovery/discovery-controls";
import { ResultsTable } from "@/components/discovery/results-table";
import { ResultCards } from "@/components/discovery/result-cards";
import { StockScreener } from "@/components/screener/stock-screener";

/** Widest page the provider will return in one call (see DiscoveryQuery). */
const UNIVERSE_PAGE_SIZE = 100;

/**
 * Select options for the ETF filter panel, read from the unfiltered ETF
 * universe so the choices do not shrink as filters are applied. Derived from
 * normalized domain snapshots — the page never reads demo fixtures directly.
 */
async function loadEtfFacets(): Promise<EtfFacets> {
  const { result } = await listDiscoveryInstruments({
    assetType: "etf",
    page: 1,
    pageSize: UNIVERSE_PAGE_SIZE,
  });

  const categories = new Set<string>();
  const exposureRegions = new Set<string>();

  for (const snapshot of result.items) {
    if (snapshot.assetType !== "etf") continue;
    const { category, exposureRegions: regions } = snapshot.metrics;
    if (category !== undefined) categories.add(category);
    for (const region of regions) exposureRegions.add(region);
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    exposureRegions: [...exposureRegions].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * D2: Discovery state lives in the URL (?asset=&market=&q=&page=). The page
 * server-renders results for the requested state; the client controls
 * component navigates to new URLs, so back/forward and refresh restore state
 * and searches are shareable. Invalid URL values fall back to defaults.
 *
 * D3: the Stocks tab wraps the same controls in the screener, which renders
 * the server-rendered list until its strategy toggle is switched on. ETFs and
 * indices keep the D2 controls untouched — the strategy only covers stocks.
 *
 * D4: the ETFs tab additionally renders the ETF filter panel and the exclusion
 * summary, and the Indices tab renders the return sort control. Both refine
 * through the same URL state, so filters are dropped when the tab changes.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") {
      params.set(key, first);
    }
  }
  const state = parseDiscoveryUrlState(params);

  // The facet lookup only runs on the ETFs tab, and runs alongside the list
  // request rather than after it, so the panel costs no extra round trip.
  const [{ result, summary, meta }, etfFacets] = await Promise.all([
    listDiscoveryInstruments(
      {
        assetType: state.assetType,
        market: state.market,
        query: state.query === "" ? undefined : state.query,
        page: state.page,
        pageSize: 25,
      },
      {
        etfFilters: state.etfFilters,
        indexSort: state.indexSort,
      }
    ),
    state.assetType === "etf" ? loadEtfFacets() : undefined,
  ]);

  const controlsProps = {
    state,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      hasNextPage: result.hasNextPage,
    },
    meta: { isDemo: meta.isDemo, asOf: meta.asOf },
  };

  const results =
    result.items.length === 0 ? (
      <p className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
        No instruments match the selected filters.
      </p>
    ) : (
      <>
        <div className="hidden md:block">
          <ResultsTable snapshots={result.items} />
        </div>
        <div className="md:hidden">
          <ResultCards snapshots={result.items} />
        </div>
      </>
    );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Discover
        </h1>
        <p className="text-sm text-stone-600">
          Find research candidates across US and Japanese markets.
        </p>
      </div>

      {state.assetType === "stock" ? (
        <StockScreener {...controlsProps}>{results}</StockScreener>
      ) : (
        <DiscoveryControls
          {...controlsProps}
          etfFacets={etfFacets}
          summary={summary}
        >
          {results}
        </DiscoveryControls>
      )}
    </div>
  );
}
