import type { StockMetrics } from "@/lib/domain";

/** Metric IDs a strategy rule may reference — keys of StockMetrics. */
export type StockMetricId = keyof StockMetrics;

export interface StrategyRule {
  id: string;
  metricId: StockMetricId;
  label: string;
  weight: number;

  direction: "higher" | "lower";
  /** Value at which the rule earns 0 points. */
  zeroScoreAt: number;
  /** Value at which the rule earns its full weight. */
  fullScoreAt: number;

  /** SPEC §11: missing metrics are always unavailable — never zero points. */
  missingBehavior: "unavailable";
}

export interface StrategyCategory {
  id: string;
  label: string;
  maximumPoints: number;
  rules: StrategyRule[];
}

export interface StrategyDefinition {
  id: string;
  version: number;
  displayName: string;
  description: string;
  assetType: "stock";

  /** Sectors excluded by default (different scoring models required). */
  excludedSectors: string[];

  categories: StrategyCategory[];
  /** Below this available weight the score is insufficient-data (null). */
  minimumAvailableWeight: number;
}

export type MatchLabel =
  | "Strong Match"
  | "Match"
  | "Partial Match"
  | "Low Match";

export interface RuleScore {
  ruleId: string;
  metricId: StockMetricId;
  label: string;
  weight: number;
  /** Earned points, or null when the metric was unavailable. */
  points: number | null;
  /** The metric value used, or null when unavailable. */
  value: number | null;
  unavailableReason?: string;
}

export interface CategoryScore {
  categoryId: string;
  label: string;
  maximumPoints: number;
  /** Points earned from usable rules in this category. */
  earnedPoints: number;
  /** Weight of usable rules in this category. */
  availableWeight: number;
  rules: RuleScore[];
}

export interface StrategyScore {
  strategyId: string;
  strategyVersion: number;

  /** Normalized 0–100 score, or null when data is insufficient. */
  total: number | null;
  label: MatchLabel | null;
  scoreStatus: "scored" | "insufficient-data";

  /** Sum of weights for metrics with usable values (out of 100). */
  availableWeight: number;
  /** Raw earned points before normalization. */
  earnedPoints: number;

  categories: CategoryScore[];
}

export interface MatchExplanation {
  strategyId: string;
  strategyVersion: number;
  label: MatchLabel | null;

  positiveReasons: string[];
  concerns: string[];
  unavailableMetrics: string[];
}
