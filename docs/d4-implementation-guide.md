# D4 Implementation Guide

Extends the D1–D3 guides — all prior invariants apply. D4 completes
asset-specific Discovery for ETFs and indices.

## D4 core (already built — do not restructure)

- `lib/screener/etf-filter.ts` — `EtfFilters` (category, exposureRegion,
  maximumExpenseRatio, minimumAssetsUnderManagement, minimumAverageVolume,
  minimumDividendYield, excludeLeveraged, excludeInverse),
  `evaluateEtfFilters`, `filterEtfSnapshots`. Missing values never pass;
  unknown (null) leveraged/inverse status fails an active exclusion.
- `lib/discovery/index-sort.ts` — `INDEX_SORT_FIELDS` (oneMonthReturn,
  yearToDateReturn, oneYearReturn), `sortIndexSnapshots` (nulls last both
  directions, symbol tie-break).
- `lib/discovery/url-state.ts` — asset-scoped URL params. ETF: `etfCategory`,
  `etfRegion`, `maxExpense` (decimal), `minAum`, `minVolume`, `minYield`
  (decimal), `exLeveraged=1`, `exInverse=1` — parsed ONLY when asset=etf.
  Index: `sortField`, `sortDir` — parsed ONLY when asset=index.
  `changeAssetType(state, assetType)` drops incompatible state (already wired
  into DiscoveryControls). Serialization omits incompatible params.
- `lib/discovery/service.ts` — `listDiscoveryInstruments(query, refinements)`
  applies ETF filters / index sort server-side before pagination and returns
  `summary` {filteredOutCount, excludedForMissingDataCount}.
- `GET /api/discovery/instruments` — accepts `sortField`/`sortDirection`
  (index only; rejected with 400 for other asset types); response now
  includes `summary`.
- `/discover` page passes `state.etfFilters` and `state.indexSort` through.

## Remaining D4 work

1. **ETF filter panel** (client, URL-driven like all D2+ controls): shown only
   on the ETFs tab. Controls: Category (select populated from the 7 distinct
   fixture categories — hardcode the list or accept as prop from server;
   prefer prop derived server-side from the universe), Exposure region
   (select: United States, Japan, Europe, Emerging Markets), Max expense
   ratio (% input → decimal), Min AUM (billions → absolute), Min avg volume,
   Min dividend yield (% → decimal), Exclude leveraged (checkbox), Exclude
   inverse (checkbox). Apply → navigate() to a new URL with the etf params;
   Clear → navigate with none. Page resets to 1 on apply. Show the exclusion
   summary when counts are non-zero ("N did not match the filters; M lacked
   required filter data.").
2. **Index sort control**: shown only on the Indices tab. Select (1-month /
   YTD / 1-year return) + direction toggle; navigates to sortField/sortDir
   URL params. Default: no sort (natural fixture order).
3. **Detail page checks** (mostly built in D2 — verify + top up): ETF detail
   already shows issuer/category/tracking index/expense/AUM/volume/holdings/
   exposure/leverage. ADD leverage factor display when non-null (exists),
   and ensure a missing expense ratio shows "—" with its unavailable reason
   in Data Availability (exists). Index detail: methodology + constituents
   (exists). Nothing new needed unless verification finds gaps.
4. **Tests** — see delegation prompt.

## Hard rules

- ETF filters never applied to stocks/indices; stock strategy never on ETF
  tab; indices never scored (all structurally enforced — keep it that way).
- Missing expense ratio ≠ 0%. Missing AUM ≠ 0. Unknown leverage ≠ "not
  leveraged" under an active exclusion.
- Listing market ≠ exposure region (separate controls, separate columns).
- URL state must not preserve incompatible filters across tab changes
  (changeAssetType guarantees this — do not bypass it).

## D4 exclusions

No ETF quality scores, no "find ETFs tracking this index" action, no facets
endpoint, no charts, no live data. Do not begin D5.
