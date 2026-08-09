# D2 Implementation Guide

Extends `d1-implementation-guide.md` — all D1 invariants still apply (missing
data → `—`, decimals for percentages, native currency, asset-specific
semantics, index "Level", demo labeling, accessibility, calm language).

## D2 core (already built — do not restructure)

- `lib/market-data/providers/demo/search.ts` — `normalizeSearchText` (NFKC +
  lowercase + trim), `rankMatch` (0 exact symbol → 5 native-name substring),
  `searchSnapshots` (deterministic, tie-broken by symbol; empty query = no
  filter).
- Provider now supports `query` in `listInstruments` and has
  `getInstrument(id): Promise<InstrumentSnapshot | null>`.
- `lib/validation/discovery-query.ts` — API accepts optional `query` param
  (trimmed, max 100 chars).
- `lib/discovery/url-state.ts` — `DiscoveryUrlState` {assetType, market,
  query, page}, `parseDiscoveryUrlState` (invalid values fall back to
  defaults), `serializeDiscoveryUrlState` (defaults omitted from URL).
  URL params: `asset`, `market`, `q`, `page`.
- `lib/discovery/service.ts` — `getDiscoveryInstrument(id)` validates ID shape
  (slug regex), returns null for unknown.
- `app/api/discovery/instruments/[instrumentId]/route.ts` — 200 `{data}`,
  404 NOT_FOUND, 400 INVALID_REQUEST envelope.
- `lib/watchlist/storage.ts` — pure parse/serialize/add/remove/has;
  key `market-thesis.watchlist.v1`; entries = {instrumentId, symbol, name,
  assetType, addedAt}; malformed data → empty list, never a crash.
- `lib/watchlist/use-watchlist.ts` — `useWatchlist()` hook
  (useSyncExternalStore; server snapshot is empty → hydration-safe).
- `components/watchlist/watchlist-button.tsx` — `WatchlistButton` toggle
  (props: instrumentId, symbol, name, assetType, size?: "row"|"detail").
- `components/discovery/discovery-controls.tsx` — URL-driven controls with
  debounced search input; results are server-rendered children.
- `/discover` page is now URL-driven via searchParams.

## Remaining D2 work

1. **Detail pages** `/discover/[instrumentId]` — server component calling
   `getDiscoveryInstrument`; `notFound()` for null; asset-specific sections
   (SPEC §14.10): common header (symbol, names, asset type, market, exchange,
   currency, price/level with correct labeling, as-of, WatchlistButton
   size="detail"); stock → Overview + Key Metrics grid; ETF → Overview + Fund
   Details + Cost and Size + Exposure + Risk Characteristics
   (leveraged/inverse); index → Overview + Performance + Index Details; ALL →
   Data Availability section listing unavailable metrics with their
   `unavailableReason`, and a Provenance block (provider display name, demo
   status, as-of, warnings). No charts. No strategy/score sections (D3).
2. **Result rows/cards link to detail pages** and gain a WatchlistButton.
   Keep the row itself non-interactive; link on the symbol/name cell.
3. **`/watchlist` page** — client page using `useWatchlist()`; renders saved
   entries (symbol, name, asset type, link to detail page, remove button);
   explains storage is browser-local ("stored in this browser, not synced to
   an account"); empty state; unavailable instruments (ID no longer resolvable)
   render from the entry's fallback fields with an "no longer available" note
   and can still be removed. Add "Watchlist" to the nav in the dashboard
   layout.
4. **Tests** — see the D2 test list in the delegation prompt.

## D2 exclusions

No scoring, no strategies, no filters beyond asset/market/search, no facets,
no screen endpoint, no charts, no sorting controls, no live data, no auth,
no database. Do not begin D3.
