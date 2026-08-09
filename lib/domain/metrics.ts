export type MetricOrigin = "provider" | "calculated" | "demo";

/**
 * A single financial metric with provenance.
 *
 * Missing data is always `null` — never 0, undefined, NaN, or Infinity.
 * Percentages are stored as decimals (0.15 = 15%).
 * Ratios are stored as plain ratio values (P/E 18.4 = 18.4).
 */
export interface MetricValue {
  value: number | null;
  origin: MetricOrigin;

  period?: "TTM" | "FY" | "Quarter" | "Current";
  fiscalPeriod?: string;
  asOf?: string;

  sourceField?: string;
  unavailableReason?: string;
}

export interface StockMetrics {
  peRatio: MetricValue;
  priceToBook: MetricValue;

  revenueGrowth: MetricValue;
  epsGrowth: MetricValue;

  returnOnEquity: MetricValue;
  operatingMargin: MetricValue;
  freeCashFlowMargin: MetricValue;
  freeCashFlowYield: MetricValue;

  debtToEquity: MetricValue;
  currentRatio: MetricValue;

  dividendYield: MetricValue;
  shareCountCagr3Y: MetricValue;
}

export interface EtfMetrics {
  expenseRatio: MetricValue;
  assetsUnderManagement: MetricValue;
  averageVolume: MetricValue;
  dividendYield: MetricValue;
  holdingsCount: MetricValue;

  category?: string;
  trackingIndex?: string;
  issuer?: string;

  /** Listing market is not investment exposure. Keep these separate. */
  exposureRegions: string[];
  exposureSectors: string[];

  isLeveraged: boolean | null;
  isInverse: boolean | null;
  leverageFactor: number | null;
}

export interface IndexMetrics {
  oneMonthReturn: MetricValue;
  yearToDateReturn: MetricValue;
  oneYearReturn: MetricValue;

  constituentCount: MetricValue;
  methodologySummary?: string;
}
