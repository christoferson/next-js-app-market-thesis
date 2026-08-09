import type { InstrumentSnapshot } from "@/lib/domain";
import type {
  InstrumentQuery,
  MarketDataProvider,
  PaginatedResult,
} from "@/lib/market-data/types";
import { filterByAssetType, filterByMarket, paginate } from "./filters";
import { searchSnapshots } from "./search";
import { getDemoSnapshots } from "@/data/demo";

export const DEMO_PROVIDER_ID = "demo";
export const DEMO_PROVIDER_DISPLAY_NAME = "Demo Data";

/**
 * Deterministic local provider. No network access, no credentials, no
 * dependence on the current date. All records carry `isDemo: true` provenance.
 */
export function createDemoMarketDataProvider(): MarketDataProvider {
  return {
    id: DEMO_PROVIDER_ID,
    displayName: DEMO_PROVIDER_DISPLAY_NAME,

    async listInstruments(
      query: InstrumentQuery
    ): Promise<PaginatedResult<InstrumentSnapshot>> {
      const byAsset = filterByAssetType(getDemoSnapshots(), query.assetType);
      const byMarket = filterByMarket(byAsset, query.market);
      const searched = searchSnapshots(byMarket, query.query);
      return paginate(searched, query.page, query.pageSize);
    },

    async getInstrument(
      instrumentId: string
    ): Promise<InstrumentSnapshot | null> {
      return (
        getDemoSnapshots().find((s) => s.instrument.id === instrumentId) ?? null
      );
    },
  };
}
