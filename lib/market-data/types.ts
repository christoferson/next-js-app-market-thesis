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
  /** Free-text search over symbol, English name, and native name. */
  query?: string;

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

  /** Returns the snapshot for a stable instrument ID, or null when unknown. */
  getInstrument(instrumentId: string): Promise<InstrumentSnapshot | null>;
}
