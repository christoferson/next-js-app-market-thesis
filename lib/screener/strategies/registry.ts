import type { StrategyDefinition } from "@/lib/screener/types";
import { qualityReasonablePriceV1 } from "./quality-reasonable-price-v1";

/** Versioned strategy ID: `${id}-v${version}` (e.g. quality-reasonable-price-v1). */
export function versionedStrategyId(strategy: StrategyDefinition): string {
  return `${strategy.id}-v${strategy.version}`;
}

const strategies: readonly StrategyDefinition[] = [qualityReasonablePriceV1];

export function listStrategies(): readonly StrategyDefinition[] {
  return strategies;
}

/** Resolve a versioned strategy ID; unknown IDs return null. */
export function getStrategy(versionedId: string): StrategyDefinition | null {
  return (
    strategies.find((s) => versionedStrategyId(s) === versionedId) ?? null
  );
}
