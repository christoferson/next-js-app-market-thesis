import type {
  EtfMetrics,
  EtfSnapshot,
  MetricValue,
  QuoteSnapshot,
  SupportedCurrency,
  SupportedMarket,
} from "@/lib/domain";
import { DEMO_PROVENANCE, demoMetric, missingMetric } from "@/data/demo/shared";
import { demoEtfs } from "@/data/demo/etfs";

/**
 * Test-only ETF builders. Synthetic funds let a test put a single fund metric
 * exactly on a filter threshold without depending on fixture values; the demo
 * fixtures are used for integration-flavoured assertions.
 */

/** The numeric fund metrics an ETF filter can reference. */
export type EtfNumericMetric =
  | "expenseRatio"
  | "assetsUnderManagement"
  | "averageVolume"
  | "dividendYield"
  | "holdingsCount";

/** A metric override: a number sets the value, null/omitted leaves it missing. */
export type EtfMetricOverrides = Partial<
  Record<EtfNumericMetric, number | null>
>;

export interface SyntheticEtfOptions {
  id?: string;
  symbol?: string;
  name?: string;
  listingMarket?: SupportedMarket;
  currency?: SupportedCurrency;
  metrics?: EtfMetricOverrides;
  /** Omitted (or explicitly undefined) models a fund with no category. */
  category?: string | undefined;
  exposureRegions?: string[];
  exposureSectors?: string[];
  isLeveraged?: boolean | null;
  isInverse?: boolean | null;
  leverageFactor?: number | null;
}

function metricFor(
  overrides: EtfMetricOverrides,
  id: EtfNumericMetric
): MetricValue {
  const value = overrides[id];
  if (value === undefined || value === null) return missingMetric("test");
  return demoMetric(value);
}

function buildMetrics(options: SyntheticEtfOptions): EtfMetrics {
  const overrides = options.metrics ?? {};
  return {
    expenseRatio: metricFor(overrides, "expenseRatio"),
    assetsUnderManagement: metricFor(overrides, "assetsUnderManagement"),
    averageVolume: metricFor(overrides, "averageVolume"),
    dividendYield: metricFor(overrides, "dividendYield"),
    holdingsCount: metricFor(overrides, "holdingsCount"),
    category: options.category,
    trackingIndex: "Test Synthetic Index",
    issuer: "Test Synthetic Issuer",
    exposureRegions: options.exposureRegions ?? [],
    exposureSectors: options.exposureSectors ?? [],
    isLeveraged: options.isLeveraged ?? null,
    isInverse: options.isInverse ?? null,
    leverageFactor: options.leverageFactor ?? null,
  };
}

/**
 * Build a synthetic ETF snapshot. Defaults model a fund with no usable filter
 * data at all: every numeric metric missing, no category, no exposure regions,
 * and unknown (null) leveraged/inverse status.
 */
export function makeEtf(options: SyntheticEtfOptions = {}): EtfSnapshot {
  const id = options.id ?? "etf-test-synthetic";
  const currency = options.currency ?? "USD";

  const quote: QuoteSnapshot = {
    instrumentId: id,
    price: 100,
    previousClose: 100,
    dayChange: 0,
    dayChangePercent: 0,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    // A fund's own market capitalization is not a meaningful metric.
    marketCap: null,
    averageVolume: null,
    currency,
    asOf: "2026-08-07",
  };

  return {
    assetType: "etf",
    instrument: {
      id,
      assetType: "etf",
      symbol: options.symbol ?? "TSTF.DEMO",
      name: options.name ?? "Test Synthetic Demo ETF",
      listingMarket: options.listingMarket ?? "US",
      exchangeCode: "XDMO",
      exchangeName: "US Demo Exchange",
      currency,
      countryCode: "US",
      isTradable: true,
      isActive: true,
    },
    quote,
    provenance: DEMO_PROVENANCE,
    metrics: buildMetrics(options),
  };
}

/** Look up a demo ETF fixture by symbol; throws when absent. */
export function findDemoEtf(symbol: string): EtfSnapshot {
  const snapshot = demoEtfs.find((etf) => etf.instrument.symbol === symbol);
  if (snapshot === undefined) {
    throw new Error(`Unknown demo ETF fixture: ${symbol}`);
  }
  return snapshot;
}

export function etfSymbols(snapshots: readonly EtfSnapshot[]): string[] {
  return snapshots.map((snapshot) => snapshot.instrument.symbol);
}
