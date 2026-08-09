# Market Thesis Progress

## Current milestone

D2 — Search, URL State, Detail Page, and Watchlist

## Status

Complete. All required checks pass. Awaiting user review and explicit
authorization before D3.

## Completed milestones

- D1 — Foundation and Demo Discovery (2026-08-09)
- D2 — Search, URL State, Detail Page, and Watchlist (2026-08-09)

## In progress

- None

## Decisions

- Discovery begins with a deterministic local demo provider.
- No live market-data provider has been selected.
- Live-provider selection is deferred until D5.
- Architecture examples in `SPEC.md` are reference approaches unless explicitly
  marked mandatory.
- Fabricated demo financial values use fictional or unmistakably demo instruments.
- Package manager: npm (no lockfile existed; SPEC commands use `npm run`).
- Stack: Next.js 16 (App Router), React 19, TypeScript strict
  (`noUncheckedIndexedAccess` enabled), Tailwind CSS v4, Zod 4, Vitest 4.
- UI primitives: hand-rolled Tailwind components instead of shadcn/ui. D1's UI
  surface is small (tabs, table, card, badge, select); shadcn can be adopted
  later if the UI grows.
- D1 interactivity: initial view (Stocks / All Markets / page 1) is
  server-rendered through `lib/discovery/service.ts`; tab/market/pagination
  changes are handled by a client component calling
  `GET /api/discovery/instruments`. React state only — URL state is deferred
  to D2 as specified. Page and API share one service, so filtering and
  pagination are not duplicated.
- API validation policy: invalid parameter values are rejected with a
  structured 400 error (not clamped). Unknown query parameters are ignored.
  Repeated known parameters take the first value. Documented and tested.
- Provider boundary is a minimal interface (`id`, `displayName`,
  `listInstruments`) rather than the full SPEC reference interface — extended
  when later milestones need search/detail/screen methods.
- `MetricValue` snapshots use a top-level `assetType` discriminant on each
  snapshot variant in addition to `instrument.assetType`, giving TypeScript a
  direct discriminated union.
- Snapshot metrics helpers `demoMetric()` / `missingMetric()` centralize
  fixture provenance; every missing value carries an `unavailableReason`.
- `docs/d1-implementation-guide.md` records the design contract (invariants,
  boundaries, exclusions) used to delegate fixture/UI/test implementation to
  subagent model sessions; core architecture was implemented directly.
- Compact-number formatting trims trailing zeros (2.4M, not 2.40M) per SPEC
  §19.5 examples; tiers use 0/1/2 fraction digits at ≥100/≥10/<10.
- D2 Discovery state moved from client React state to URL-driven server
  rendering (`?asset=&market=&q=&page=`). The D1 client-fetch explorer
  (`discovery-explorer.tsx`) was removed as superseded: with URL state
  mandated by D2, `router.push` + server re-render gives back/forward,
  refresh persistence, and shareable URLs with one data path instead of two.
  The list API remains for external consumers and future needs.
- Search normalization uses NFKC folding so full-width Latin and half-width
  katakana match their normal-width forms; ranking is exact symbol > symbol
  prefix > exact name > name prefix > name substring > native-name substring,
  tie-broken by symbol for determinism.
- Watchlist storage functions are pure (parse/serialize/add/remove) and
  unit-tested without a DOM; the `useWatchlist` hook wraps them with
  `useSyncExternalStore` (empty server snapshot → hydration-safe) and a
  `storage` event listener for cross-tab sync.
- Watchlist entries store only stable ID + symbol/name/assetType/addedAt as
  display fallback, per SPEC §14.11.
- Instrument IDs are validated against a slug pattern before lookup; the
  detail API returns 400 for malformed IDs and 404 for unknown ones.
- Subagent review fixes applied to core: API query trim now happens before
  the 100-char limit (matching URL-state behavior), and the URL-state clamp
  is code-point-aware so it cannot split a surrogate pair.

## Verification

D2, run on 2026-08-09 (Node 22.14.0, npm 11.11.0, Windows):

- `npm run lint` — pass (no warnings or errors).
- `npm run typecheck` — pass (strict mode, zero errors).
- `npm run test` — pass: 9 files, 248 tests, 0 failures.
- `npm run build` — pass: `/discover` now dynamic (searchParams);
  `/discover/[instrumentId]`, `/watchlist`, and the detail API route present.
- Production smoke test (`npm run start`):
  - `/api/discovery/instruments?query=sakura` → Sakura Automation first.
  - Detail API: known ID → 200 with snapshot; unknown ID → 404 `NOT_FOUND`;
    malformed ID → 400 `INVALID_REQUEST`.
  - `/discover?asset=etf&market=JP` server-renders only JP ETFs.
  - `/discover?q=サクラ` (native-name search) finds Sakura Automation.
  - ETF detail page renders Fund Details, Cost and Size, Risk
    Characteristics, and Data Availability sections.
  - `/watchlist` renders with the browser-local storage explanation.
- D1 verification results (103 tests, all checks passing) are preserved in
  git history; the D1 suite is a subset of the current suite.

## Known limitations

- Demo data only (26 fictional instruments, fixed as-of date 2026-08-07).
- No stock scoring or strategies (D3).
- No filters beyond asset type, market, and search (D3/D4).
- No sorting controls (D3/D4).
- Page size is fixed at 25 in the UI; the URL does not carry pageSize or
  sort state (no sort exists yet).
- Watchlist stores display fallbacks only; the watchlist page does not fetch
  live snapshots (deliberate D2 minimalism — detail links resolve live data).
- No live prices, portfolio tracking, or runtime AI integration.
- Keyboard navigation and mobile layout smoke-tested via rendered HTML;
  visual confirmation steps listed in the D2 report for the user to run.

## Next proposed milestone

D3 — Stock Screener and QARP Strategy

D3 is proposed only. It is not authorized until the user explicitly approves it.
