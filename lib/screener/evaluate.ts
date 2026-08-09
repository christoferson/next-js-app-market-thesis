import type { StockSnapshot, MetricValue } from "@/lib/domain";
import { scoreHigherIsBetter, scoreLowerIsBetter } from "./score";
import type {
  CategoryScore,
  MatchLabel,
  RuleScore,
  StrategyDefinition,
  StrategyRule,
  StrategyScore,
} from "./types";

export const FINANCIAL_EXCLUSION_EXPLANATION =
  "Financial companies and REITs are excluded because their balance sheets " +
  "and valuation metrics require different scoring models.";

/**
 * Strategy eligibility (SPEC §11.8). The initial strategy targets ordinary
 * operating companies; excluded sectors and inactive listings are out.
 */
export function isEligibleForStrategy(
  snapshot: StockSnapshot,
  strategy: StrategyDefinition
): boolean {
  if (!snapshot.instrument.isActive) return false;
  const sector = snapshot.instrument.sector;
  if (sector !== undefined && strategy.excludedSectors.includes(sector)) {
    return false;
  }
  return true;
}

/**
 * A metric is usable only when present and finite. Negative P/E is treated
 * as unavailable for scoring (SPEC §11.4) — fixtures already store missing
 * P/E as null for loss-makers, but guard here too.
 */
function usableValue(rule: StrategyRule, metric: MetricValue): number | null {
  const { value } = metric;
  if (value === null || !Number.isFinite(value)) return null;
  if (rule.metricId === "peRatio" && value <= 0) return null;
  return value;
}

function scoreRule(rule: StrategyRule, metric: MetricValue): RuleScore {
  const value = usableValue(rule, metric);

  if (value === null) {
    return {
      ruleId: rule.id,
      metricId: rule.metricId,
      label: rule.label,
      weight: rule.weight,
      points: null,
      value: null,
      unavailableReason:
        metric.unavailableReason ??
        (metric.value !== null && rule.metricId === "peRatio"
          ? "Negative P/E is treated as unavailable for scoring."
          : "Not available"),
    };
  }

  const points =
    rule.direction === "higher"
      ? scoreHigherIsBetter(value, rule.zeroScoreAt, rule.fullScoreAt, rule.weight)
      : scoreLowerIsBetter(value, rule.fullScoreAt, rule.zeroScoreAt, rule.weight);

  return {
    ruleId: rule.id,
    metricId: rule.metricId,
    label: rule.label,
    weight: rule.weight,
    points,
    value,
  };
}

export function matchLabelForScore(total: number | null): MatchLabel | null {
  if (total === null) return null;
  if (total >= 80) return "Strong Match";
  if (total >= 65) return "Match";
  if (total >= 50) return "Partial Match";
  return "Low Match";
}

/**
 * Evaluate a stock against a strategy (SPEC §11.6). Missing metrics earn no
 * points and add no available weight. Below the minimum available weight the
 * score is null with status insufficient-data. Rounding happens only in the
 * UI — totals here keep full precision.
 */
export function evaluateStrategy(
  snapshot: StockSnapshot,
  strategy: StrategyDefinition
): StrategyScore {
  const categories: CategoryScore[] = strategy.categories.map((category) => {
    const rules = category.rules.map((rule) =>
      scoreRule(rule, snapshot.metrics[rule.metricId])
    );

    let earnedPoints = 0;
    let availableWeight = 0;
    for (const rule of rules) {
      if (rule.points !== null) {
        earnedPoints += rule.points;
        availableWeight += rule.weight;
      }
    }

    return {
      categoryId: category.id,
      label: category.label,
      maximumPoints: category.maximumPoints,
      earnedPoints,
      availableWeight,
      rules,
    };
  });

  const earnedPoints = categories.reduce((sum, c) => sum + c.earnedPoints, 0);
  const availableWeight = categories.reduce(
    (sum, c) => sum + c.availableWeight,
    0
  );

  const sufficient = availableWeight >= strategy.minimumAvailableWeight;
  const total = sufficient ? (earnedPoints / availableWeight) * 100 : null;

  return {
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    total,
    label: matchLabelForScore(total),
    scoreStatus: sufficient ? "scored" : "insufficient-data",
    availableWeight,
    earnedPoints,
    categories,
  };
}
