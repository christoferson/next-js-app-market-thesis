import type {
  AssetType,
  SupportedMarket,
  InstrumentSnapshot,
} from "@/lib/domain";
import type { DataProviderId } from "@/lib/domain";

export interface InstrumentQuery {
  assetType: AssetType;
  /** Omitted market means all supported markets. */
  market?: SupportedMarket;

  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

/**
 * The D1 provider boundary. Live providers added in D5 implement this same
 * interface; UI and service code must never see provider-specific shapes.
 */
export interface MarketDataProvider {
  readonly id: DataProviderId;
  readonly displayName: string;

  listInstruments(
    query: InstrumentQuery
  ): Promise<PaginatedResult<InstrumentSnapshot>>;
}
