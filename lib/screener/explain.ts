import type { MatchExplanation, StrategyScore, RuleScore } from "./types";
import type { StockFilterOutcome } from "./filter";

/**
 * Deterministic match explanations (SPEC §12) — template text from score
 * contributions and filter outcomes, never LLM output, never predictions.
 */

const POSITIVE_TEMPLATES: Record<string, string> = {
  "return-on-equity": "Strong return on equity",
  "operating-margin": "Healthy operating margin",
  "free-cash-flow-margin": "Healthy free-cash-flow margin",
  "revenue-growth": "Solid revenue growth",
  "eps-growth": "Solid EPS growth",
  "pe-ratio": "Valuation is within the strategy's P/E range",
  "free-cash-flow-yield": "Attractive free-cash-flow yield relative to criteria",
  "price-to-book": "Price-to-book is within the strategy's range",
  "debt-to-equity": "Low debt relative to equity",
  "current-ratio": "Comfortable current ratio",
  "share-count-cagr-3y": "Share count has remained stable or declined",
};

const CONCERN_TEMPLATES: Record<string, string> = {
  "return-on-equity": "Return on equity is below the strategy's target",
  "operating-margin": "Operating margin is below the strategy's target",
  "free-cash-flow-margin": "Free cash flow is weak or negative",
  "revenue-growth": "Revenue growth is below the strategy's target",
  "eps-growth": "EPS growth is below the strategy's target",
  "pe-ratio": "P/E is elevated relative to the strategy's range",
  "free-cash-flow-yield": "Free-cash-flow yield is low relative to criteria",
  "price-to-book": "Price-to-book is elevated relative to the strategy's range",
  "debt-to-equity": "Debt-to-equity is elevated",
  "current-ratio": "Current ratio is low",
  "share-count-cagr-3y": "Share count has increased over the last three years",
};

function allRules(score: StrategyScore): RuleScore[] {
  return score.categories.flatMap((category) => category.rules);
}

/** Rules earning ≥80% of their weight, best first, top three. */
function positiveReasons(score: StrategyScore): string[] {
  return allRules(score)
    .filter((rule) => rule.points !== null && rule.points >= rule.weight * 0.8)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3)
    .map((rule) => POSITIVE_TEMPLATES[rule.ruleId] ?? rule.label);
}

/**
 * Concerns: failed active filters first, then the lowest-scoring rules
 * (<40% of weight), then missing high-weight metrics. Top three.
 */
function concerns(
  score: StrategyScore,
  filterOutcome: StockFilterOutcome | null
): string[] {
  const items: string[] = [];

  if (filterOutcome !== null) {
    for (const label of filterOutcome.failedFilters) {
      items.push(`Did not meet the active filter: ${label.toLowerCase()}`);
    }
  }

  const lowRules = allRules(score)
    .filter((rule) => rule.points !== null && rule.points < rule.weight * 0.4)
    .sort((a, b) => (a.points ?? 0) / a.weight - (b.points ?? 0) / b.weight);
  for (const rule of lowRules) {
    items.push(CONCERN_TEMPLATES[rule.ruleId] ?? `${rule.label} scored low`);
  }

  const missingHighWeight = allRules(score).filter(
    (rule) => rule.points === null && rule.weight >= 10
  );
  for (const rule of missingHighWeight) {
    items.push(`${rule.label} is unavailable`);
  }

  return [...new Set(items)].slice(0, 3);
}

export function explainMatch(
  score: StrategyScore,
  filterOutcome: StockFilterOutcome | null
): MatchExplanation {
  return {
    strategyId: score.strategyId,
    strategyVersion: score.strategyVersion,
    label: score.label,
    positiveReasons: positiveReasons(score),
    concerns: concerns(score, filterOutcome),
    unavailableMetrics: allRules(score)
      .filter((rule) => rule.points === null)
      .map((rule) => rule.label),
  };
}
