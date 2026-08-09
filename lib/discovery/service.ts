import "server-only";

import type { InstrumentSnapshot } from "@/lib/domain";
import { MarketDataError } from "@/lib/market-data/errors";
import type { PaginatedResult } from "@/lib/market-data/types";
import { getMarketDataProvider } from "@/lib/market-data/get-provider";
import { paginate } from "@/lib/market-data/providers/demo/filters";
import type { DiscoveryQuery } from "@/lib/validation/discovery-query";
import { filterEtfSnapshots, type EtfFilters } from "@/lib/screener/etf-filter";
import {
  sortIndexSnapshots,
  type IndexSortField,
  type SortDirection,
} from "./index-sort";

export interface DiscoveryMeta {
  provider: string;
  providerDisplayName: string;
  isDemo: boolean;
  fetchedAt: string;
  asOf: string | null;
  warnings: string[];
}

export interface DiscoveryListSummary {
  /** Instruments excluded because they failed an active filter. */
  filteredOutCount: number;
  /** Instruments excluded because required filter data was unavailable. */
  excludedForMissingDataCount: number;
}

export interface DiscoveryResult {
  result: PaginatedResult<InstrumentSnapshot>;
  summary: DiscoveryListSummary;
  meta: DiscoveryMeta;
}

/** D4 asset-scoped refinements applied on top of the provider list. */
export interface DiscoveryRefinements {
  etfFilters?: EtfFilters;
  indexSort?: { field: IndexSortField; direction: SortDirection } | null;
}

function hasActiveEtfFilters(filters: EtfFilters | undefined): boolean {
  return filters !== undefined && Object.keys(filters).length > 0;
}

/**
 * The single discovery entry point shared by the server-rendered page and
 * the API route, so filtering and pagination are never duplicated.
 *
 * ETF filtering and index sorting are Market Thesis logic (like stock
 * screening), applied to the provider universe before pagination. Filters
 * for one asset type are never applied to another (SPEC §10.6).
 */
export async function listDiscoveryInstruments(
  query: DiscoveryQuery,
  refinements: DiscoveryRefinements = {}
): Promise<DiscoveryResult> {
  const provider = getMarketDataProvider();

  const applyEtfFilters =
    query.assetType === "etf" && hasActiveEtfFilters(refinements.etfFilters);
  const applyIndexSort =
    query.assetType === "index" &&
    refinements.indexSort !== null &&
    refinements.indexSort !== undefined;

  const summary: DiscoveryListSummary = {
    filteredOutCount: 0,
    excludedForMissingDataCount: 0,
  };

  let result: PaginatedResult<InstrumentSnapshot>;

  if (!applyEtfFilters && !applyIndexSort) {
    result = await provider.listInstruments({
      assetType: query.assetType,
      market: query.market,
      query: query.query,
      page: query.page,
      pageSize: query.pageSize,
    });
  } else {
    // Refinements need the whole matching universe before paginating.
    const universe = await provider.listInstruments({
      assetType: query.assetType,
      market: query.market,
      query: query.query,
      page: 1,
      pageSize: 100,
    });

    let items = universe.items;

    if (applyEtfFilters) {
      const etfItems = items.filter(
        (s): s is Extract<InstrumentSnapshot, { assetType: "etf" }> =>
          s.assetType === "etf"
      );
      const filtered = filterEtfSnapshots(etfItems, refinements.etfFilters!);
      summary.filteredOutCount = filtered.filteredOutCount;
      summary.excludedForMissingDataCount =
        filtered.excludedForMissingDataCount;
      items = filtered.items;
    }

    if (applyIndexSort) {
      const indexItems = items.filter(
        (s): s is Extract<InstrumentSnapshot, { assetType: "index" }> =>
          s.assetType === "index"
      );
      items = sortIndexSnapshots(
        indexItems,
        refinements.indexSort!.field,
        refinements.indexSort!.direction
      );
    }

    result = paginate(items, query.page, query.pageSize);
  }

  const first = result.items[0];

  return {
    result,
    summary,
    meta: {
      provider: provider.id,
      providerDisplayName: provider.displayName,
      isDemo: first?.provenance.isDemo ?? provider.id === "demo",
      fetchedAt: first?.provenance.fetchedAt ?? new Date().toISOString(),
      asOf: first?.provenance.asOf ?? null,
      warnings: first?.provenance.warnings ?? [],
    },
  };
}

/** Stable instrument IDs are slugs; reject anything else before lookup. */
const INSTRUMENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

/**
 * Look up one instrument by its stable ID. Returns null for unknown IDs;
 * throws INVALID_REQUEST for IDs that are not even well-formed.
 */
export async function getDiscoveryInstrument(
  instrumentId: string
): Promise<InstrumentSnapshot | null> {
  if (!INSTRUMENT_ID_PATTERN.test(instrumentId)) {
    throw new MarketDataError(
      "INVALID_REQUEST",
      "The instrument ID is invalid."
    );
  }
  return getMarketDataProvider().getInstrument(instrumentId);
}
