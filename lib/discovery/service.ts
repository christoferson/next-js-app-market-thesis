import "server-only";

import type { InstrumentSnapshot } from "@/lib/domain";
import { MarketDataError } from "@/lib/market-data/errors";
import type { PaginatedResult } from "@/lib/market-data/types";
import { getMarketDataProvider } from "@/lib/market-data/get-provider";
import type { DiscoveryQuery } from "@/lib/validation/discovery-query";

export interface DiscoveryMeta {
  provider: string;
  providerDisplayName: string;
  isDemo: boolean;
  fetchedAt: string;
  asOf: string | null;
  warnings: string[];
}

export interface DiscoveryResult {
  result: PaginatedResult<InstrumentSnapshot>;
  meta: DiscoveryMeta;
}

/**
 * The single discovery entry point shared by the server-rendered page and
 * the API route, so filtering and pagination are never duplicated.
 */
export async function listDiscoveryInstruments(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  const provider = getMarketDataProvider();

  const result = await provider.listInstruments({
    assetType: query.assetType,
    market: query.market,
    query: query.query,
    page: query.page,
    pageSize: query.pageSize,
  });

  const first = result.items[0];

  return {
    result,
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
