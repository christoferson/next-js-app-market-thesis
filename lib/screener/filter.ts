import type { StockSnapshot } from "@/lib/domain";

/**
 * D3 stock filters (SPEC §D3 minimum set). All numeric bounds follow
 * missing-data semantics: a stock whose metric is null never passes an
 * active filter (SPEC §10.5) — null is never treated as zero.
 */
export interface StockFilters {
  minimumMarketCap?: number;
  minimumRevenueGrowth?: number;
  maximumPeRatio?: number;
  minimumFreeCashFlowYield?: number;
  maximumDebtToEquity?: number;
  positiveFreeCashFlowOnly?: boolean;
}

export interface StockFilterOutcome {
  passed: boolean;
  /** Labels of active filters this stock failed on a known value. */
  failedFilters: string[];
  /** Labels of active filters that could not be evaluated (missing data). */
  unavailableFilters: string[];
}

function checkBound(
  value: number | null,
  passes: (v: number) => boolean,
  label: string,
  outcome: { failedFilters: string[]; unavailableFilters: string[] }
): boolean {
  if (value === null || !Number.isFinite(value)) {
    outcome.unavailableFilters.push(label);
    return false;
  }
  if (!passes(value)) {
    outcome.failedFilters.push(label);
    return false;
  }
  return true;
}

/** Evaluate all active filters; inactive (undefined) filters always pass. */
export function evaluateStockFilters(
  snapshot: StockSnapshot,
  filters: StockFilters
): StockFilterOutcome {
  const outcome: StockFilterOutcome = {
    passed: true,
    failedFilters: [],
    unavailableFilters: [],
  };
  const { metrics, quote } = snapshot;

  if (filters.minimumMarketCap !== undefined) {
    if (
      !checkBound(
        quote?.marketCap ?? null,
        (v) => v >= filters.minimumMarketCap!,
        "Minimum market capitalization",
        outcome
      )
    ) {
      outcome.passed = false;
    }
  }

  if (filters.minimumRevenueGrowth !== undefined) {
    if (
      !checkBound(
        metrics.revenueGrowth.value,
        (v) => v >= filters.minimumRevenueGrowth!,
        "Minimum revenue growth",
        outcome
      )
    ) {
      outcome.passed = false;
    }
  }

  if (filters.maximumPeRatio !== undefined) {
    // A present-but-negative P/E is a known value that fails the bound
    // (classified as failed, not unavailable); a null P/E is unavailable.
    // Either way it never passes — SPEC §10.5.
    if (
      !checkBound(
        metrics.peRatio.value,
        (v) => v > 0 && v <= filters.maximumPeRatio!,
        "Maximum P/E ratio",
        outcome
      )
    ) {
      outcome.passed = false;
    }
  }

  if (filters.minimumFreeCashFlowYield !== undefined) {
    if (
      !checkBound(
        metrics.freeCashFlowYield.value,
        (v) => v >= filters.minimumFreeCashFlowYield!,
        "Minimum free-cash-flow yield",
        outcome
      )
    ) {
      outcome.passed = false;
    }
  }

  if (filters.maximumDebtToEquity !== undefined) {
    if (
      !checkBound(
        metrics.debtToEquity.value,
        (v) => v <= filters.maximumDebtToEquity!,
        "Maximum debt-to-equity",
        outcome
      )
    ) {
      outcome.passed = false;
    }
  }

  if (filters.positiveFreeCashFlowOnly === true) {
    if (
      !checkBound(
        metrics.freeCashFlowMargin.value,
        (v) => v > 0,
        "Positive free cash flow only",
        outcome
      )
    ) {
      outcome.passed = false;
    }
  }

  return outcome;
}
