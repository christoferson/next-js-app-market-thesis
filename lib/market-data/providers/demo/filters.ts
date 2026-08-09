import type {
  AssetType,
  SupportedMarket,
  InstrumentSnapshot,
} from "@/lib/domain";
import type { PaginatedResult } from "@/lib/market-data/types";

/** Pure, deterministic asset-type filter. */
export function filterByAssetType(
  snapshots: readonly InstrumentSnapshot[],
  assetType: AssetType
): InstrumentSnapshot[] {
  return snapshots.filter((s) => s.instrument.assetType === assetType);
}

/** Pure, deterministic market filter. An omitted market means all markets. */
export function filterByMarket(
  snapshots: readonly InstrumentSnapshot[],
  market?: SupportedMarket
): InstrumentSnapshot[] {
  if (market === undefined) {
    return [...snapshots];
  }
  return snapshots.filter((s) => s.instrument.listingMarket === market);
}

/**
 * Pure, deterministic pagination. Pages are 1-based. A page beyond the
 * available range returns an empty items array with valid metadata.
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const total = items.length;
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    items: pageItems,
    page,
    pageSize,
    total,
    hasNextPage: startIndex + pageSize < total,
  };
}
