"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AssetType, SupportedMarket } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import {
  changeAssetType,
  serializeDiscoveryUrlState,
  type DiscoveryUrlState,
} from "@/lib/discovery/url-state";
import type { EtfFilters } from "@/lib/screener/etf-filter";
import { AssetTabs } from "./asset-tabs";
import { EtfFilterPanel } from "./etf-filter-panel";
import {
  IndexSortControl,
  type IndexSortSelection,
} from "./index-sort-control";
import { MarketSelector } from "./market-selector";
import { Pagination } from "./pagination";

const SEARCH_DEBOUNCE_MS = 300;

/** Distinct values in the ETF universe, derived server-side. */
export interface EtfFacets {
  categories: readonly string[];
  exposureRegions: readonly string[];
}

export interface DiscoveryControlsProps {
  state: DiscoveryUrlState;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
  meta: {
    isDemo: boolean;
    asOf: string | null;
  };
  /** Server-rendered results (tables/cards) for the current URL state. */
  children: React.ReactNode;
  /**
   * When true the child renders its own result set, count and pagination
   * (D3 screener), so the URL-driven list count and pager are suppressed.
   */
  childOwnsResults?: boolean;
  /**
   * D4: select options for the ETF filter panel. Required for the panel to
   * offer categories and regions; only supplied on the ETFs tab.
   */
  etfFacets?: EtfFacets;
  /** D4: how many instruments the active refinements excluded, and why. */
  summary?: {
    filteredOutCount: number;
    excludedForMissingDataCount: number;
  };
}

/**
 * Plain-language exclusion lines. Only non-zero counts are reported, so a
 * user is never told that nothing was excluded.
 */
function exclusionLines(
  summary: DiscoveryControlsProps["summary"]
): readonly string[] {
  if (summary === undefined) return [];
  const lines: string[] = [];
  if (summary.filteredOutCount > 0) {
    lines.push(
      `${summary.filteredOutCount} ${
        summary.filteredOutCount === 1 ? "ETF" : "ETFs"
      } did not match the filters.`
    );
  }
  if (summary.excludedForMissingDataCount > 0) {
    lines.push(
      `${summary.excludedForMissingDataCount} excluded because required filter data was unavailable.`
    );
  }
  return lines;
}

/**
 * URL-driven Discovery controls (D2). Every change navigates to a new URL;
 * the server re-renders results for that state. Browser back/forward and
 * refresh restore Discovery state for free, and URLs are shareable.
 */
export function DiscoveryControls({
  state,
  pagination,
  meta,
  children,
  childOwnsResults = false,
  etfFacets,
  summary,
}: DiscoveryControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [searchText, setSearchText] = useState(state.query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when navigation (back/forward) changes the URL
  // query from outside this component.
  const lastUrlQuery = useRef(state.query);
  useEffect(() => {
    if (state.query !== lastUrlQuery.current) {
      lastUrlQuery.current = state.query;
      setSearchText(state.query);
    }
  }, [state.query]);

  function navigate(next: DiscoveryUrlState) {
    const params = serializeDiscoveryUrlState(next);
    const url = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => {
      router.push(url, { scroll: false });
    });
  }

  function handleAssetTypeChange(assetType: AssetType) {
    if (assetType === state.assetType) return;
    // Market and search survive tab switches; pagination resets and
    // asset-incompatible filters/sort are dropped (SPEC §10.6).
    navigate(changeAssetType(state, assetType));
  }

  function handleMarketChange(market: SupportedMarket | undefined) {
    if (market === state.market) return;
    navigate({ ...state, market, page: 1 });
  }

  function handlePageChange(page: number) {
    if (page === state.page || page < 1) return;
    navigate({ ...state, page });
  }

  // D4 refinements are asset-scoped: each handler is only reachable from the
  // tab that owns it, and serialization drops params for the other tabs.
  function handleEtfFiltersApply(etfFilters: EtfFilters) {
    navigate({ ...state, etfFilters, page: 1 });
  }

  function handleIndexSortChange(indexSort: IndexSortSelection | null) {
    navigate({ ...state, indexSort, page: 1 });
  }

  function handleSearchChange(text: string) {
    setSearchText(text);
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const trimmed = text.trim();
      if (trimmed === state.query) return;
      lastUrlQuery.current = trimmed;
      navigate({ ...state, query: trimmed, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / Math.max(pagination.pageSize, 1))
  );

  const lines = exclusionLines(summary);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <AssetTabs value={state.assetType} onChange={handleAssetTypeChange} />

        <div className="w-full md:max-w-xs">
          <label
            htmlFor="discovery-search"
            className="mb-1 block text-xs font-medium text-stone-600"
          >
            Search
          </label>
          <input
            id="discovery-search"
            type="search"
            value={searchText}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Symbol or name"
            autoComplete="off"
            className="w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MarketSelector value={state.market} onChange={handleMarketChange} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          {childOwnsResults ? null : (
            <span>{`${pagination.total} results`}</span>
          )}
          <span>{`As of ${formatDate(meta.asOf)}`}</span>
          {meta.isDemo ? (
            <span className="rounded-sm border border-stone-300 px-1.5 py-0.5 text-stone-600">
              Demo data — not current market information.
            </span>
          ) : null}
        </div>
      </div>

      {state.assetType === "etf" && etfFacets !== undefined ? (
        <EtfFilterPanel
          filters={state.etfFilters}
          categories={etfFacets.categories}
          exposureRegions={etfFacets.exposureRegions}
          onApply={handleEtfFiltersApply}
        />
      ) : null}

      {state.assetType === "index" ? (
        <IndexSortControl
          value={state.indexSort}
          onChange={handleIndexSortChange}
        />
      ) : null}

      <div
        id="discovery-results"
        role="tabpanel"
        aria-labelledby={`asset-tab-${state.assetType}`}
        aria-busy={isPending}
        tabIndex={-1}
        className="space-y-4"
      >
        <p role="status" className="min-h-5 text-xs text-stone-500">
          {isPending ? "Loading instruments…" : ""}
        </p>

        <div className={isPending ? "opacity-60 transition-opacity" : undefined}>
          {children}
        </div>

        {!childOwnsResults && lines.length > 0 ? (
          <ul className="space-y-1">
            {lines.map((line) => (
              <li key={line} className="text-xs text-stone-500">
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        {!childOwnsResults && (pagination.total > 0 || pagination.page > 1) ? (
          <Pagination
            page={pagination.page}
            totalPages={totalPages}
            hasNextPage={pagination.hasNextPage}
            onPageChange={handlePageChange}
          />
        ) : null}
      </div>
    </section>
  );
}
