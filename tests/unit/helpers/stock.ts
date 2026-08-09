import type {
  MetricValue,
  QuoteSnapshot,
  StockMetrics,
  StockSnapshot,
} from "@/lib/domain";
import { DEMO_PROVENANCE, demoMetric, missingMetric } from "@/data/demo/shared";
import { demoStocks } from "@/data/demo/stocks";
import type { CategoryScore, RuleScore, StrategyScore } from "@/lib/screener/types";

/**
 * Test-only builders. Synthetic snapshots let a test set one metric at a
 * precise threshold without depending on fixture values; real fixtures are
 * used for integration-flavoured assertions.
 */

/** A metric override: a number sets the value, null/omitted leaves it missing. */
export type MetricOverrides = Partial<Record<keyof StockMetrics, number | null>>;

export interface SyntheticStockOptions {
  id?: string;
  symbol?: string;
  name?: string;
  /** Explicitly passing `sector: undefined` models a stock with no sector. */
  sector?: string | undefined;
  isActive?: boolean;
  marketCap?: number | null;
  /** When false the snapshot has no quote at all. */
  hasQuote?: boolean;
  metrics?: MetricOverrides;
}

/** Every metric a rule can reference, at its full-score threshold. */
export const FULL_SCORE_METRICS: MetricOverrides = {
  returnOnEquity: 0.2,
  operatingMargin: 0.2,
  freeCashFlowMargin: 0.15,
  revenueGrowth: 0.2,
  epsGrowth: 0.25,
  peRatio: 15,
  freeCashFlowYield: 0.07,
  priceToBook: 1.5,
  debtToEquity: 0.3,
  currentRatio: 2,
  shareCountCagr3Y: 0,
};

/** Every metric a rule can reference, at its zero-score threshold. */
export const ZERO_SCORE_METRICS: MetricOverrides = {
  returnOnEquity: 0,
  operatingMargin: 0,
  freeCashFlowMargin: 0,
  revenueGrowth: -0.05,
  epsGrowth: -0.1,
  peRatio: 40,
  freeCashFlowYield: 0,
  priceToBook: 6,
  debtToEquity: 2,
  currentRatio: 0.8,
  shareCountCagr3Y: 0.05,
};

function metricFor(
  overrides: MetricOverrides,
  id: keyof StockMetrics
): MetricValue {
  const value = overrides[id];
  if (value === undefined || value === null) return missingMetric("test");
  return demoMetric(value);
}

function buildMetrics(overrides: MetricOverrides): StockMetrics {
  return {
    peRatio: metricFor(overrides, "peRatio"),
    priceToBook: metricFor(overrides, "priceToBook"),
    revenueGrowth: metricFor(overrides, "revenueGrowth"),
    epsGrowth: metricFor(overrides, "epsGrowth"),
    returnOnEquity: metricFor(overrides, "returnOnEquity"),
    operatingMargin: metricFor(overrides, "operatingMargin"),
    freeCashFlowMargin: metricFor(overrides, "freeCashFlowMargin"),
    freeCashFlowYield: metricFor(overrides, "freeCashFlowYield"),
    debtToEquity: metricFor(overrides, "debtToEquity"),
    currentRatio: metricFor(overrides, "currentRatio"),
    dividendYield: metricFor(overrides, "dividendYield"),
    shareCountCagr3Y: metricFor(overrides, "shareCountCagr3Y"),
  };
}

/**
 * Build a synthetic stock snapshot. Defaults: every metric missing, sector
 * "Industrials" (not excluded), active, quote present with a null market cap.
 */
export function makeStock(options: SyntheticStockOptions = {}): StockSnapshot {
  const id = options.id ?? "stock-test-synthetic";
  const sector = "sector" in options ? options.sector : "Industrials";
  const metrics = buildMetrics(options.metrics ?? {});

  const quote: QuoteSnapshot | null =
    options.hasQuote === false
      ? null
      : {
          instrumentId: id,
          price: 100,
          previousClose: 100,
          dayChange: 0,
          dayChangePercent: 0,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          marketCap: options.marketCap ?? null,
          averageVolume: null,
          currency: "USD",
          asOf: "2026-08-07",
        };

  return {
    assetType: "stock",
    instrument: {
      id,
      assetType: "stock",
      symbol: options.symbol ?? "TST.DEMO",
      name: options.name ?? "Test Synthetic Corp",
      listingMarket: "US",
      exchangeCode: "XDMO",
      exchangeName: "US Demo Exchange",
      currency: "USD",
      countryCode: "US",
      sector,
      industry: "Machinery",
      isTradable: true,
      isActive: options.isActive ?? true,
    },
    quote,
    provenance: DEMO_PROVENANCE,
    metrics,
  };
}

/** Look up a demo stock fixture by instrument ID; throws when absent. */
export function findDemoStock(instrumentId: string): StockSnapshot {
  const snapshot = demoStocks.find((s) => s.instrument.id === instrumentId);
  if (snapshot === undefined) {
    throw new Error(`Unknown demo stock fixture: ${instrumentId}`);
  }
  return snapshot;
}

export function allRuleScores(score: StrategyScore): RuleScore[] {
  return score.categories.flatMap((category) => category.rules);
}

/** Find a scored rule by rule ID; throws when the strategy has no such rule. */
export function ruleById(score: StrategyScore, ruleId: string): RuleScore {
  const rule = allRuleScores(score).find((r) => r.ruleId === ruleId);
  if (rule === undefined) throw new Error(`Unknown rule: ${ruleId}`);
  return rule;
}

/** Find a scored category by category ID; throws when absent. */
export function categoryById(
  score: StrategyScore,
  categoryId: string
): CategoryScore {
  const category = score.categories.find((c) => c.categoryId === categoryId);
  if (category === undefined) throw new Error(`Unknown category: ${categoryId}`);
  return category;
}
