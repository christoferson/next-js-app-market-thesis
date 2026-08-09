# D1 Implementation Guide

Design contract for Market Thesis D1. The core architecture (domain models,
provider boundary, discovery service, validation, formatting, API routes) is
already implemented. This guide tells contributors — human or delegated model
sessions — how to build the remaining D1 parts **without violating invariants**.

Read `CLAUDE.md` and the D1 sections of `SPEC.md` first. This guide summarizes;
those documents govern.

## Architecture (already built — do not restructure)

```
data/demo/*            fixtures (typed as domain snapshots)
        ↓
lib/market-data/providers/demo/   demo provider (pure filter + paginate)
        ↓
lib/discovery/service.ts          single service used by page AND api route
        ↓
app/api/discovery/instruments     GET route (Zod-validated, envelope response)
app/(dashboard)/discover          server-rendered page + client explorer
```

Key modules:

- `lib/domain` — `InstrumentSnapshot` discriminated union (`assetType`:
  `"stock" | "etf" | "index"`), `MetricValue`, `DataProvenance`. Import domain
  types from `@/lib/domain`.
- `lib/market-data/types.ts` — `MarketDataProvider`, `InstrumentQuery`,
  `PaginatedResult<T>`.
- `lib/market-data/get-provider.ts` — server-only provider selection
  (`MARKET_DATA_PROVIDER`, default `demo`; unsupported value throws).
- `lib/discovery/service.ts` — `listDiscoveryInstruments(query)` returns
  `{ result, meta }`. Server components call this directly; the browser calls
  `GET /api/discovery/instruments`.
- `lib/format` — ALL display formatting. Components must not hand-roll number
  formatting.
- `lib/validation/discovery-query.ts` — the API query contract.
- `data/demo/shared.ts` — `DEMO_AS_OF_DATE`, `DEMO_PROVENANCE`, `demoMetric()`,
  `missingMetric()` helpers for fixtures.
- `data/demo/index.ts` — `getDemoSnapshots()`, the only fixture entry point.

## Non-negotiable invariants

1. **Missing data is `null`**, displays as `—`. Never 0, `undefined`, `NaN`,
   `Infinity`, `$0`, or `0%`. Use `missingMetric(reason)` in fixtures and the
   `lib/format` functions in UI.
2. **Percentages are decimals** internally: `0.15` = 15%. `formatPercent`
   multiplies by 100 exactly once.
3. **Native currency**: USD → `$1,234.56` / `$1.25B`; JPY → `¥1,235` / `¥1.25T`
   (no decimal places for JPY). Never mix or convert.
4. **Asset-specific semantics**: index `price` is a **Level** (label it
   "Level", format with `formatIndexLevel`, never as currency); indices show
   "Reference index — not directly tradable" and have `isTradable: false`;
   ETFs use ETF metrics (expense ratio, AUM), never stock P/E.
5. **Demo labeling**: the UI must show
   `Demo data — not current market information.` while the demo provider is
   active, plus the footer disclaimer:
   `Market Thesis is a research tool, not financial advice. Market data may be
   delayed or incomplete. Verify information before making investment decisions.`
6. **Boundary discipline**: UI components never import from `data/demo` — data
   flows through the service/API. Client components never import
   `lib/discovery/service` or `lib/market-data/get-provider` (server-only).
7. **Exhaustive unions**: switch on `snapshot.assetType` and use
   `assertNever` from `@/lib/domain` in the default branch.
8. **Language**: "research candidate", "matches criteria" — never "buy",
   "guaranteed", or predictions. Calm styling: minimal red/green, no
   animations, no urgency.
9. **Accessibility**: semantic HTML, real `<table>` with `<th scope="col">`,
   keyboard-accessible tabs (roving tabindex or radio-group semantics), text
   labels for the market selector (no flag-only labels), visible focus states,
   status conveyed by text not color alone.

## D1 exclusions — do NOT build

Search, URL state/searchParams sync, watchlist, localStorage, detail pages/links
to them, scoring, filters beyond asset+market, sort controls, facets/screen
endpoints, charts, live providers, AI, database, auth. No disabled placeholder
controls for future features.

## Fixture requirements (`data/demo/stocks.ts`, `etfs.ts`, `indices.ts`)

Export `demoStocks: readonly StockSnapshot[]`, `demoEtfs: readonly
EtfSnapshot[]`, `demoIndices: readonly IndexSnapshot[]`.

Coverage: ≥6 US + ≥6 JP stocks, ≥4 US + ≥4 JP ETFs, ≥3 US + ≥3 JP indices.
All fictional identities (e.g. "Northstar Software", "Sakura Automation",
"US Broad Market Demo ETF"), symbols like `NST.DEMO`, `7201.DEMO`. JP
instruments get `nativeName` in Japanese, four-digit-style string codes,
exchange "Tokyo Demo Exchange" (`XTKD`), currency `JPY`. US: "US Demo
Exchange" (`XUSD` is confusable — use `XDMO`), currency `USD`.

Required edge cases across the set: a company with missing P/E (negative
earnings — include `unavailableReason`), one with negative FCF margin, one
with high debt-to-equity (>2), one with missing `shareCountCagr3Y`, a
dividend payer, a high-growth richly-valued company, a low-cost broad ETF, a
high-expense thematic ETF, a leveraged ETF (`isLeveraged: true`,
`leverageFactor: 2`), an inverse ETF or the same one, an ETF with missing
`expenseRatio`, an ETF with missing `holdingsCount`, an index with missing
`oneYearReturn`.

Consistency rules: `dayChange ≈ price − previousClose` and
`dayChangePercent = dayChange / previousClose` (rounded is fine); quote
`instrumentId` matches `instrument.id`; instrument ids are stable slugs like
`stock-us-northstar-software`; every snapshot uses `DEMO_PROVENANCE` and
quote `asOf: DEMO_AS_OF_DATE`; indices: `isTradable: false`, `quote.marketCap:
null`, `averageVolume: null`. Use `satisfies`/typed arrays so `tsc` enforces
shapes. No `Date.now()` anywhere.

## UI requirements (`app/`, `components/`)

- `app/(dashboard)/layout.tsx` — shell: header ("Market Thesis" + "Demo Data"
  badge when meta.isDemo), nav (Discover, About), footer disclaimer + demo
  notice. Server component.
- `/discover` page (server): parse nothing from URL (D1), call
  `listDiscoveryInstruments` with defaults (stock / all markets / page 1 /
  pageSize 25), render heading "Discover" + "Find research candidates across
  US and Japanese markets." and pass initial data to the client explorer.
- `components/discovery/discovery-explorer.tsx` (`"use client"`): owns
  `assetType`, `market`, `page` state; on change fetches
  `/api/discovery/instruments?...`; tab or market change resets page to 1;
  market selection survives tab switches. Renders tabs, market selector,
  result count, as-of label (`As of Aug 7, 2026` via `formatDate`), table
  (desktop, `hidden md:block`) and cards (mobile), pagination
  (Previous/Next + "Page X of Y"), loading state, empty state, and an error
  state with a retry button. Keep client fetch logic simple; handle non-OK
  responses by showing the error state (message from the envelope if present).
- Tables per asset type (columns from SPEC §14.6–14.8):
  - Stocks: Company (symbol, name, nativeName), Market, Price, Market Cap,
    Revenue Growth, P/E, FCF Yield, ROE.
  - ETFs: ETF, Market, Price, Category, Expense Ratio, AUM, Dividend Yield,
    Exposure (+ Leveraged/Inverse badges).
  - Indices: Index, Market, Level, Day Change, YTD Return, 1Y Return, As Of
    (+ "Reference index — not directly tradable" note).
- Mobile cards: symbol+name, asset badge, market+currency, 2–4 key metrics,
  data date.
- `/about` page: product scope, demo-data explanation, full disclaimer,
  what Discovery is/isn't (no advice, no predictions).
- Market selector options: "All Markets", "United States", "Japan".

## Test requirements (`tests/unit/*.test.ts`)

Vitest, node environment, no network, no current-date dependence.

- `pagination.test.ts` — first/middle/final page, page beyond range (empty
  items, valid metadata), pageSize behavior, total, hasNextPage, no duplicate
  ids across adjacent pages.
- `filters.test.ts` — asset-type filter returns only that type; market filter
  US/JP/undefined-means-all.
- `discovery-query.test.ts` — defaults applied; invalid assetType/market/
  page/pageSize rejected; unknown params ignored; boundary values (page 0,
  pageSize 0, pageSize 101 rejected; pageSize 100 accepted).
- `format.test.ts` — USD price, JPY price (no decimals), compact market cap
  both currencies, positive/negative/zero/missing percent, signed percent
  (true minus sign `−`), ratio, null → `—`, NaN/Infinity → `—`.
- `demo-provider.test.ts` — provider returns ≥26 instruments across types,
  all `isDemo: true`, indices non-tradable, filtering + pagination composed.

Import pure functions directly (`filterByAssetType`, `paginate`,
`parseDiscoveryQuery`, format fns). Do not test component internals in D1.
