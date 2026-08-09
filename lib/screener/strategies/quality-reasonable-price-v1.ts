import type { StrategyDefinition } from "@/lib/screener/types";

/**
 * Quality at a Reasonable Price, version 1 (SPEC §11.3–11.4 — the formulas
 * are mandatory and must not change without explicit user approval).
 *
 * Percent thresholds are decimals (0.20 = 20%), matching metric storage.
 * This is a research-ranking strategy, not a buy recommendation.
 */
export const qualityReasonablePriceV1: StrategyDefinition = {
  id: "quality-reasonable-price",
  version: 1,
  displayName: "Quality at a Reasonable Price",
  description:
    "Identifies financially healthy, profitable companies with reasonable " +
    "growth and valuation characteristics. Measures alignment with the " +
    "selected criteria — it does not predict future returns.",
  assetType: "stock",

  excludedSectors: ["Financials", "Real Estate"],

  minimumAvailableWeight: 70,

  categories: [
    {
      id: "quality",
      label: "Quality",
      maximumPoints: 30,
      rules: [
        {
          id: "return-on-equity",
          metricId: "returnOnEquity",
          label: "Return on equity",
          weight: 10,
          direction: "higher",
          zeroScoreAt: 0,
          fullScoreAt: 0.2,
          missingBehavior: "unavailable",
        },
        {
          id: "operating-margin",
          metricId: "operatingMargin",
          label: "Operating margin",
          weight: 10,
          direction: "higher",
          zeroScoreAt: 0,
          fullScoreAt: 0.2,
          missingBehavior: "unavailable",
        },
        {
          id: "free-cash-flow-margin",
          metricId: "freeCashFlowMargin",
          label: "Free-cash-flow margin",
          weight: 10,
          direction: "higher",
          zeroScoreAt: 0,
          fullScoreAt: 0.15,
          missingBehavior: "unavailable",
        },
      ],
    },
    {
      id: "growth",
      label: "Growth",
      maximumPoints: 20,
      rules: [
        {
          id: "revenue-growth",
          metricId: "revenueGrowth",
          label: "Revenue growth",
          weight: 10,
          direction: "higher",
          zeroScoreAt: -0.05,
          fullScoreAt: 0.2,
          missingBehavior: "unavailable",
        },
        {
          id: "eps-growth",
          metricId: "epsGrowth",
          label: "EPS growth",
          weight: 10,
          direction: "higher",
          zeroScoreAt: -0.1,
          fullScoreAt: 0.25,
          missingBehavior: "unavailable",
        },
      ],
    },
    {
      id: "valuation",
      label: "Valuation",
      maximumPoints: 25,
      rules: [
        {
          id: "pe-ratio",
          metricId: "peRatio",
          label: "P/E ratio",
          weight: 10,
          direction: "lower",
          fullScoreAt: 15,
          zeroScoreAt: 40,
          missingBehavior: "unavailable",
        },
        {
          id: "free-cash-flow-yield",
          metricId: "freeCashFlowYield",
          label: "Free-cash-flow yield",
          weight: 10,
          direction: "higher",
          zeroScoreAt: 0,
          fullScoreAt: 0.07,
          missingBehavior: "unavailable",
        },
        {
          id: "price-to-book",
          metricId: "priceToBook",
          label: "Price-to-book",
          weight: 5,
          direction: "lower",
          fullScoreAt: 1.5,
          zeroScoreAt: 6,
          missingBehavior: "unavailable",
        },
      ],
    },
    {
      id: "financial-health",
      label: "Financial Health",
      maximumPoints: 15,
      rules: [
        {
          id: "debt-to-equity",
          metricId: "debtToEquity",
          label: "Debt-to-equity",
          weight: 10,
          direction: "lower",
          fullScoreAt: 0.3,
          zeroScoreAt: 2,
          missingBehavior: "unavailable",
        },
        {
          id: "current-ratio",
          metricId: "currentRatio",
          label: "Current ratio",
          weight: 5,
          direction: "higher",
          zeroScoreAt: 0.8,
          fullScoreAt: 2,
          missingBehavior: "unavailable",
        },
      ],
    },
    {
      id: "shareholder-alignment",
      label: "Shareholder Alignment",
      maximumPoints: 10,
      rules: [
        {
          id: "share-count-cagr-3y",
          metricId: "shareCountCagr3Y",
          label: "Three-year share-count CAGR",
          weight: 10,
          direction: "lower",
          fullScoreAt: 0,
          zeroScoreAt: 0.05,
          missingBehavior: "unavailable",
        },
      ],
    },
  ],
};
