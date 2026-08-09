# D3 Implementation Guide

Extends the D1/D2 guides — all prior invariants apply. D3 adds transparent,
deterministic stock screening with `quality-reasonable-price-v1`.

## D3 core (already built — do not restructure)

- `lib/screener/score.ts` — `clamp`, `scoreHigherIsBetter`,
  `scoreLowerIsBetter` (pure linear interpolation with clamping).
- `lib/screener/types.ts` — `StrategyDefinition/Category/Rule`,
  `StrategyScore` (with per-category and per-rule breakdowns), `MatchLabel`,
  `MatchExplanation`.
- `lib/screener/strategies/quality-reasonable-price-v1.ts` — the mandatory
  SPEC §11 formulas. Categories: Quality 30 / Growth 20 / Valuation 25 /
  Financial Health 15 / Shareholder Alignment 10. DO NOT alter thresholds.
- `lib/screener/strategies/registry.ts` — `getStrategy("quality-reasonable-price-v1")`,
  `listStrategies()`, `versionedStrategyId()`.
- `lib/screener/evaluate.ts` — `evaluateStrategy(stockSnapshot, strategy)`,
  `isEligibleForStrategy` (excludes Financials/Real Estate sectors +
  inactive), `matchLabelForScore` (80/65/50 label bands),
  `FINANCIAL_EXCLUSION_EXPLANATION`. Missing metrics: no points, no available
  weight; availableWeight < 70 → total null + "insufficient-data". Negative
  P/E → unavailable for scoring.
- `lib/screener/filter.ts` — `StockFilters` (minimumMarketCap,
  minimumRevenueGrowth, maximumPeRatio, minimumFreeCashFlowYield,
  maximumDebtToEquity, positiveFreeCashFlowOnly), `evaluateStockFilters` →
  {passed, failedFilters, unavailableFilters}. Null never passes an active
  filter.
- `lib/screener/explain.ts` — `explainMatch(score, filterOutcome)` →
  deterministic positiveReasons (top contributions), concerns (failed
  filters, low rules, missing high-weight), unavailableMetrics.
- `lib/screener/screen.ts` — server-only `screenStocks(request)`: provider
  universe → eligibility → filters → score → sort (null scores last both
  directions) → paginate. Returns {result, summary, meta}; summary counts
  ineligible / excluded-for-missing-data / filtered-out.
- `lib/validation/screen-request.ts` — strict Zod schema; unknown filters and
  unknown fields rejected; strategyId literal "quality-reasonable-price-v1";
  sort field "strategyScore" | "marketCap".
- `POST /api/discovery/screen` — envelope {data:[{snapshot, score,
  explanation}], pagination, summary, meta}; 400 for invalid body.

## Remaining D3 work

1. **Screener UI on the Stocks tab** — client component(s): a strategy
   section (checkbox/toggle "Quality at a Reasonable Price v1" + description
   + the financial-exclusion explanation) and, when enabled, a filter panel
   (numeric inputs for the six filters; percent inputs accept whole percents
   in the UI but SEND decimals, e.g. user types 10 → 0.10) with an Apply
   button (no auto-fire per keystroke) and Clear. When the strategy is
   active, results come from POST /api/discovery/screen (client fetch) and
   the stock table shows a Strategy Match column: score rounded to 1 decimal
   + label, or "Insufficient Data" + data-completeness ("Data completeness:
   NN/100") when null. Show the summary line when exclusions are non-zero
   (e.g. "N excluded: sector not covered; M lacked required filter data").
   Sort control: Strategy Match / Market Cap, asc/desc. When strategy is OFF,
   the existing URL-driven list view remains exactly as in D2. Strategy and
   filter state are client state (NOT URL) in D3 — record as limitation.
   ETF/Index tabs are untouched — never show strategy UI there.
2. **Detail page (stocks only)** — add sections when the instrument is an
   eligible stock: "Strategy Match" (score, label, version "Strategy version
   1 — quality-reasonable-price-v1", data completeness, category breakdown
   table: category label, earned/max points; expandable or plain rule rows
   with per-rule points/weight and value), "Why It Matched" (positiveReasons
   list), "Potential Concerns" (concerns list). For ineligible stocks show
   the exclusion explanation instead. Compute server-side via
   evaluateStrategy + explainMatch(score, null) — no fetch. Label text must
   say the score measures alignment with criteria, not future returns.
3. **Tests** — see delegation prompt.

## Language rules (strict)

"Strong Match/Match/Partial Match/Low Match/Insufficient Data", "research
candidate", "matches the selected criteria". NEVER "buy", "strong buy",
"guaranteed", "opportunity", "will rise". A score is alignment with criteria.

## D3 exclusions

No ETF filters (D4), no index sorting (D4), no facets endpoint, no charts,
no URL state for strategy/filters, no sector-specific scoring models, no
user-editable weights/thresholds, no live data. Do not begin D4.
