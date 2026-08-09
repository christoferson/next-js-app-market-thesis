import "server-only";

import type { StockSnapshot } from "@/lib/domain";
import { getMarketDataProvider } from "@/lib/market-data/get-provider";
import { paginate } from "@/lib/market-data/providers/demo/filters";
import type { PaginatedResult } from "@/lib/market-data/types";
import type { DiscoveryMeta } from "@/lib/discovery/service";
import { MarketDataError } from "@/lib/market-data/errors";
import type { ScreenRequest } from "@/lib/validation/screen-request";
import { getStrategy } from "./strategies/registry";
import { evaluateStrategy, isEligibleForStrategy } from "./evaluate";
import { evaluateStockFilters } from "./filter";
import { explainMatch } from "./explain";
import type { MatchExplanation, StrategyScore } from "./types";

export interface ScreenResultItem {
  snapshot: StockSnapshot;
  score: StrategyScore;
  explanation: MatchExplanation;
}

export interface ScreenSummary {
  /** Stocks excluded because the strategy does not cover their sector. */
  ineligibleCount: number;
  /** Stocks excluded because required filter data was unavailable. */
  excludedForMissingDataCount: number;
  /** Stocks excluded because they failed an active filter. */
  filteredOutCount: number;
  eligibilityExplanation: string;
}

export interface ScreenResult {
  result: PaginatedResult<ScreenResultItem>;
  summary: ScreenSummary;
  meta: DiscoveryMeta;
}

/**
 * Server-side screening: eligibility → filters → deterministic scoring →
 * sort → paginate. Scores are always computed here — client-supplied score
 * values are never accepted (the request schema has no score field at all).
 */
export async function screenStocks(
  request: ScreenRequest
): Promise<ScreenResult> {
  const provider = getMarketDataProvider();
  const strategy = getStrategy(request.strategyId);
  if (strategy === null) {
    throw new MarketDataError("INVALID_REQUEST", "Unknown strategy ID.");
  }

  // Load the stock universe through the provider boundary — the screener
  // never touches fixture modules. The demo universe is small; a D5 live
  // provider replaces this with provider screening or a bounded cached
  // universe behind the same interface.
  const universePage = await provider.listInstruments({
    assetType: "stock",
    market: request.market,
    query: request.query,
    page: 1,
    pageSize: 100,
  });
  const searched = universePage.items.filter(
    (snapshot): snapshot is StockSnapshot => snapshot.assetType === "stock"
  );

  const summary: ScreenSummary = {
    ineligibleCount: 0,
    excludedForMissingDataCount: 0,
    filteredOutCount: 0,
    eligibilityExplanation:
      "Financial companies and REITs are excluded because their balance " +
      "sheets and valuation metrics require different scoring models.",
  };

  const items: ScreenResultItem[] = [];
  for (const snapshot of searched) {
    if (!isEligibleForStrategy(snapshot, strategy)) {
      summary.ineligibleCount += 1;
      continue;
    }

    const filterOutcome = evaluateStockFilters(snapshot, request.filters);
    if (!filterOutcome.passed) {
      if (filterOutcome.unavailableFilters.length > 0) {
        summary.excludedForMissingDataCount += 1;
      } else {
        summary.filteredOutCount += 1;
      }
      continue;
    }

    const score = evaluateStrategy(snapshot, strategy);
    items.push({
      snapshot,
      score,
      explanation: explainMatch(score, filterOutcome),
    });
  }

  sortItems(items, request.sort);
  const result = paginate(items, request.page, request.pageSize);

  const first = result.items[0]?.snapshot ?? searched[0];
  return {
    result,
    summary,
    meta: {
      provider: provider.id,
      providerDisplayName: provider.displayName,
      isDemo: first?.provenance.isDemo ?? provider.id === "demo",
      fetchedAt: first?.provenance.fetchedAt ?? new Date().toISOString(),
      asOf: first?.provenance.asOf ?? null,
      warnings: first?.provenance.warnings ?? [],
    },
  };
}

/** Null scores/values sort last in both directions (SPEC §6.9). */
function sortItems(
  items: ScreenResultItem[],
  sort: ScreenRequest["sort"]
): void {
  const direction = sort.direction === "asc" ? 1 : -1;

  items.sort((a, b) => {
    const aValue =
      sort.field === "strategyScore"
        ? a.score.total
        : (a.snapshot.quote?.marketCap ?? null);
    const bValue =
      sort.field === "strategyScore"
        ? b.score.total
        : (b.snapshot.quote?.marketCap ?? null);

    if (aValue === null && bValue === null) {
      return a.snapshot.instrument.symbol.localeCompare(
        b.snapshot.instrument.symbol
      );
    }
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    if (aValue !== bValue) return (aValue - bValue) * direction;
    return a.snapshot.instrument.symbol.localeCompare(
      b.snapshot.instrument.symbol
    );
  });
}
