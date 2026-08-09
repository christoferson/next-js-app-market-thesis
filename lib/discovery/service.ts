import "server-only";

import type { InstrumentSnapshot } from "@/lib/domain";
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
