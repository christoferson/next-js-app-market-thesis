import type { Instrument, SupportedCurrency } from "./instruments";
import type { StockMetrics, EtfMetrics, IndexMetrics } from "./metrics";
import type { DataProvenance } from "./provenance";

export interface QuoteSnapshot {
  instrumentId: string;

  /**
   * Last price for tradable assets. For an index this holds the index level and
   * the UI must label it "Level", never "Price".
   */
  price: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;

  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;

  marketCap: number | null;
  averageVolume: number | null;

  currency: SupportedCurrency;
  asOf: string | null;
}

export interface BaseInstrumentSnapshot {
  instrument: Instrument;
  quote: QuoteSnapshot | null;
  provenance: DataProvenance;
}

export interface StockSnapshot extends BaseInstrumentSnapshot {
  instrument: Instrument & { assetType: "stock" };
  assetType: "stock";
  metrics: StockMetrics;
}

export interface EtfSnapshot extends BaseInstrumentSnapshot {
  instrument: Instrument & { assetType: "etf" };
  assetType: "etf";
  metrics: EtfMetrics;
}

export interface IndexSnapshot extends BaseInstrumentSnapshot {
  instrument: Instrument & { assetType: "index" };
  assetType: "index";
  metrics: IndexMetrics;
}

/**
 * Discriminated union over `assetType`. Consumers must handle all three
 * variants exhaustively; use `assertNever` in default branches.
 */
export type InstrumentSnapshot = StockSnapshot | EtfSnapshot | IndexSnapshot;

export function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(value)}`);
}
