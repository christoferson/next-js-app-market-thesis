import type { EtfSnapshot } from "@/lib/domain";

/**
 * D4 ETF filters (SPEC §10.3). Fund-specific metrics only — never stock
 * metrics. Missing-data semantics per SPEC §10.5: an ETF whose metric is
 * null never passes an active numeric filter; leveraged/inverse exclusions
 * with unknown (null) status treat the fund as not excluded only when the
 * status is known-false — unknown status fails an active exclusion, because
 * "exclude leveraged" cannot be satisfied by "we don't know".
 */
export interface EtfFilters {
  category?: string;
  exposureRegion?: string;
  maximumExpenseRatio?: number;
  minimumAssetsUnderManagement?: number;
  minimumAverageVolume?: number;
  minimumDividendYield?: number;
  excludeLeveraged?: boolean;
  excludeInverse?: boolean;
}

export interface EtfFilterOutcome {
  passed: boolean;
  failedFilters: string[];
  unavailableFilters: string[];
}

export function evaluateEtfFilters(
  snapshot: EtfSnapshot,
  filters: EtfFilters
): EtfFilterOutcome {
  const outcome: EtfFilterOutcome = {
    passed: true,
    failedFilters: [],
    unavailableFilters: [],
  };
  const { metrics } = snapshot;

  const fail = (label: string) => {
    outcome.failedFilters.push(label);
    outcome.passed = false;
  };
  const unavailable = (label: string) => {
    outcome.unavailableFilters.push(label);
    outcome.passed = false;
  };

  if (filters.category !== undefined) {
    if (metrics.category === undefined) {
      unavailable("Category");
    } else if (metrics.category !== filters.category) {
      fail("Category");
    }
  }

  if (filters.exposureRegion !== undefined) {
    if (metrics.exposureRegions.length === 0) {
      unavailable("Exposure region");
    } else if (!metrics.exposureRegions.includes(filters.exposureRegion)) {
      fail("Exposure region");
    }
  }

  if (filters.maximumExpenseRatio !== undefined) {
    const value = metrics.expenseRatio.value;
    if (value === null || !Number.isFinite(value)) {
      unavailable("Maximum expense ratio");
    } else if (value > filters.maximumExpenseRatio) {
      fail("Maximum expense ratio");
    }
  }

  if (filters.minimumAssetsUnderManagement !== undefined) {
    const value = metrics.assetsUnderManagement.value;
    if (value === null || !Number.isFinite(value)) {
      unavailable("Minimum assets under management");
    } else if (value < filters.minimumAssetsUnderManagement) {
      fail("Minimum assets under management");
    }
  }

  if (filters.minimumAverageVolume !== undefined) {
    const value = metrics.averageVolume.value;
    if (value === null || !Number.isFinite(value)) {
      unavailable("Minimum average volume");
    } else if (value < filters.minimumAverageVolume) {
      fail("Minimum average volume");
    }
  }

  if (filters.minimumDividendYield !== undefined) {
    const value = metrics.dividendYield.value;
    if (value === null || !Number.isFinite(value)) {
      unavailable("Minimum dividend yield");
    } else if (value < filters.minimumDividendYield) {
      fail("Minimum dividend yield");
    }
  }

  if (filters.excludeLeveraged === true) {
    if (metrics.isLeveraged === null) {
      unavailable("Exclude leveraged ETFs");
    } else if (metrics.isLeveraged) {
      fail("Exclude leveraged ETFs");
    }
  }

  if (filters.excludeInverse === true) {
    if (metrics.isInverse === null) {
      unavailable("Exclude inverse ETFs");
    } else if (metrics.isInverse) {
      fail("Exclude inverse ETFs");
    }
  }

  return outcome;
}

/** Apply filters, keeping only passing ETFs; count exclusions by kind. */
export function filterEtfSnapshots(
  snapshots: readonly EtfSnapshot[],
  filters: EtfFilters
): {
  items: EtfSnapshot[];
  filteredOutCount: number;
  excludedForMissingDataCount: number;
} {
  const items: EtfSnapshot[] = [];
  let filteredOutCount = 0;
  let excludedForMissingDataCount = 0;

  for (const snapshot of snapshots) {
    const outcome = evaluateEtfFilters(snapshot, filters);
    if (outcome.passed) {
      items.push(snapshot);
    } else if (outcome.unavailableFilters.length > 0) {
      excludedForMissingDataCount += 1;
    } else {
      filteredOutCount += 1;
    }
  }

  return { items, filteredOutCount, excludedForMissingDataCount };
}
