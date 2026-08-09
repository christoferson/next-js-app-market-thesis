import type {
  IndexMetrics,
  IndexSnapshot,
  MetricValue,
  QuoteSnapshot,
  SupportedCurrency,
  SupportedMarket,
} from "@/lib/domain";
import { DEMO_PROVENANCE, demoMetric, missingMetric } from "@/data/demo/shared";
import { demoIndices } from "@/data/demo/indices";

/**
 * Test-only index builders. Synthetic indices let a sort test control return
 * values (and ties) precisely; the demo fixtures cover the real ordering.
 */

export type IndexNumericMetric =
  | "oneMonthReturn"
  | "yearToDateReturn"
  | "oneYearReturn"
  | "constituentCount";

/** A metric override: a number sets the value, null/omitted leaves it missing. */
export type IndexMetricOverrides = Partial<
  Record<IndexNumericMetric, number | null>
>;

export interface SyntheticIndexOptions {
  id?: string;
  symbol?: string;
  name?: string;
  listingMarket?: SupportedMarket;
  currency?: SupportedCurrency;
  metrics?: IndexMetricOverrides;
  methodologySummary?: string;
}

function metricFor(
  overrides: IndexMetricOverrides,
  id: IndexNumericMetric
): MetricValue {
  const value = overrides[id];
  if (value === undefined || value === null) return missingMetric("test");
  return demoMetric(value);
}

function buildMetrics(options: SyntheticIndexOptions): IndexMetrics {
  const overrides = options.metrics ?? {};
  return {
    oneMonthReturn: metricFor(overrides, "oneMonthReturn"),
    yearToDateReturn: metricFor(overrides, "yearToDateReturn"),
    oneYearReturn: metricFor(overrides, "oneYearReturn"),
    constituentCount: metricFor(overrides, "constituentCount"),
    methodologySummary: options.methodologySummary,
  };
}

/**
 * Build a synthetic index snapshot. Defaults: every return missing, and an
 * index is never tradable.
 */
export function makeIndex(options: SyntheticIndexOptions = {}): IndexSnapshot {
  const symbol = options.symbol ?? "TSTI.DEMO";
  const id = options.id ?? `index-test-${symbol}`;
  const currency = options.currency ?? "USD";

  const quote: QuoteSnapshot = {
    instrumentId: id,
    // An index level, never a share price.
    price: 1_000,
    previousClose: 1_000,
    dayChange: 0,
    dayChangePercent: 0,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    marketCap: null,
    averageVolume: null,
    currency,
    asOf: "2026-08-07",
  };

  return {
    assetType: "index",
    instrument: {
      id,
      assetType: "index",
      symbol,
      name: options.name ?? `Test Synthetic ${symbol} Index`,
      listingMarket: options.listingMarket ?? "US",
      exchangeCode: "XDMO",
      exchangeName: "US Demo Exchange",
      currency,
      countryCode: "US",
      isTradable: false,
      isActive: true,
    },
    quote,
    provenance: DEMO_PROVENANCE,
    metrics: buildMetrics(options),
  };
}

/** Look up a demo index fixture by symbol; throws when absent. */
export function findDemoIndex(symbol: string): IndexSnapshot {
  const snapshot = demoIndices.find(
    (index) => index.instrument.symbol === symbol
  );
  if (snapshot === undefined) {
    throw new Error(`Unknown demo index fixture: ${symbol}`);
  }
  return snapshot;
}

export function indexSymbols(snapshots: readonly IndexSnapshot[]): string[] {
  return snapshots.map((snapshot) => snapshot.instrument.symbol);
}
