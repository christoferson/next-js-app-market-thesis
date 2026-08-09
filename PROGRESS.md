# Market Thesis Progress

## Current milestone

D4 — ETF and Index Discovery

## Status

Complete. All required checks pass. Awaiting user review and explicit
authorization before D5.

## Completed milestones

- D1 — Foundation and Demo Discovery (2026-08-09)
- D2 — Search, URL State, Detail Page, and Watchlist (2026-08-09)
- D3 — Stock Screener and QARP Strategy (2026-08-09)
- D4 — ETF and Index Discovery (2026-08-09)

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
- D3: QARP v1 formulas implemented exactly per SPEC §11 in
  `lib/screener/strategies/quality-reasonable-price-v1.ts`; scoring flows
  through two pure interpolation functions in `lib/screener/score.ts`.
- Screening runs entirely server-side. The screen request schema is strict:
  unknown filters, unknown fields, and score-injection attempts are rejected
  with 400. Scores are recalculated on every request.
- The screener obtains its stock universe through the provider boundary
  (`provider.listInstruments`), not by importing fixtures — a D5 live
  provider slots in behind the same interface.
- Zero P/E is treated as unavailable for scoring (same as negative) — a
  deliberate extension of SPEC §11.4's "negative or unavailable".
- A present-but-negative P/E under an active `maximumPeRatio` filter is
  classified as failed (known value that fails the bound), while a null P/E
  is classified as unavailable; both are non-passing per SPEC §10.5.
- Strategy/filter/sort state on the Stocks tab is client-side state in D3,
  not URL state (recorded limitation; extending URL state is D4+ work if
  desired). The default (strategy off) Stocks view remains the D2 URL-driven
  list.
- Screener UI wraps the existing DiscoveryControls (one `childOwnsResults`
  prop added) rather than duplicating tab/search/market controls.
- D4: ETF filters and index sorting live in the URL (unlike D3's client-only
  stock strategy state) because SPEC D4 requires URL state to drop
  incompatible filters across tab changes. Params are asset-scoped: ETF
  params parse/serialize only when asset=etf, index sort only when
  asset=index; `changeAssetType` drops incompatible state while preserving
  market and search.
- Unknown (null) leveraged/inverse status fails an active exclusion filter —
  "exclude leveraged" cannot be satisfied by "unknown", per missing-data
  semantics.
- `GET /api/discovery/instruments` accepts sortField/sortDirection for
  indices only; a sort on another asset type is rejected with 400 rather
  than silently ignored.
- ETF filter facets (categories, exposure regions) are derived server-side
  from the provider universe, not hardcoded in the UI.
- Subagent review fix applied: a valueless numeric URL param (?maxExpense=)
  is treated as not-set instead of an active zero-threshold filter
  (Number("") is 0, which would have excluded every fund with a published
  expense ratio).

## Verification

D4, run on 2026-08-09 (Node 22.14.0, npm 11.11.0, Windows):

- `npm run lint` — pass. `npm run typecheck` — pass. `npm run build` — pass.
- `npm run test` — pass: 16 files, 594 tests, 0 failures (161 new D4 tests:
  every ETF filter across pass/fail/missing/boundary, the
  unknown-leverage-fails-exclusion invariant, index sorting with nulls last
  in both directions, asset-scoped URL param scoping and round-trips,
  changeAssetType behavior, index-only sort validation).
- Runtime verification (production server): expense-ratio filter excludes the
  missing-expense fund as "missing data" not "failed"; exclude-leveraged
  removes TQ2X.DEMO; YTD sort orders indices correctly with the
  missing-return index last; exposure-region "Japan" includes the US-listed
  Japan-exposure ETF (listing ≠ exposure); tab switch drops ETF params from
  the URL; sort param on a non-index tab is rejected by the API and ignored
  by the page parser.
- Detail pages verified: leverage factor shown only when known; missing
  expense ratio shows — with its reason; index methodology, constituent
  count, and non-tradable labeling present.

D3 verification history:

- `npm run lint` — pass (no warnings or errors).
- `npm run typecheck` — pass (strict mode, zero errors).
- `npm run test` — pass: 14 files, 433 tests, 0 failures. Includes 185 D3
  tests: interpolation boundary values, clamping, missing-metric weights,
  the 70% insufficient-data threshold, label bands (80/65/50), eligibility,
  all six filters against passing/failing/missing values, explanation
  determinism, and strict request validation.
- `npm run build` — pass: `/api/discovery/screen` route present.
- Production smoke test (`npm run start`):
  - Default screen: 10 eligible stocks (2 Financials excluded), top result
    6702.DEMO at 77.8 "Match" with correct category breakdown
    (Quality 22.1/30, Growth 16.6/20, Valuation 14.1/25, Health 15/15,
    Alignment 10/10).
  - Unknown filter (`minimumMomentum`) → 400 with field detail.
  - Score-injection attempt (`score: 100` in body) → 400 (strict schema).
  - `maximumPeRatio: 25` + `positiveFreeCashFlowOnly` → 6 results,
    1 excluded for missing data, 3 filtered out — missing data never passes.
  - Stock detail pages show Strategy Match with version line, category/rule
    breakdown, Why It Matched, Potential Concerns; Financials-sector stocks
    show the exclusion explanation instead; ETF/index pages have no strategy
    sections.
- Verified against SPEC §11 by hand: P/E 20 → 8.0 points, ROE 10% → 5.0,
  revenue growth at −5% → 0, D/E 1.15 → 5.0, declining share count → 10 max.
- D1/D2 verification results are preserved in git history; those suites are
  subsets of the current suite.

## Known limitations

- Demo data only (26 fictional instruments, fixed as-of date 2026-08-07).
- Stock strategy toggle/filters/sort remain client-only state (D3 decision);
  ETF filters and index sorting are URL-backed. Unifying stock screener
  state into the URL is candidate D6 polish work.
- Screener supports the D3 minimum stock filter set (six filters).
- Only one strategy; no user-editable weights or thresholds by design.
- The refinement path loads the full matching universe (≤100 demo
  instruments) before paginating — fine for demo; D5 must revisit for live
  providers per SPEC §8.6/§22.
- No live prices, portfolio tracking, or runtime AI integration.
- Keyboard navigation and mobile layout smoke-tested via rendered HTML;
  visual confirmation steps listed in the D4 report for the user to run.

## D5 provider decision (2026-08-09)

The user chose SPEC §D5 option C — **stay in demo mode and postpone live
market data** — preceded by an evaluation of five named providers (EODHD,
Alpha Vantage, Finnhub, Massive, J-Quants). Evaluation notes and sanitized
samples are under `docs/references/` (see `_manifest.md`). No live-provider
code was written; no provider was selected.

Key evaluation findings recorded for future D5 work:

- No single evaluated provider verifiably covers both US and Japanese
  markets from public docs alone; a US provider + J-Quants pairing is the
  most plausible two-provider architecture, pending licensing review.
- J-Quants prohibits redistributing retrieved data in viewable form — a
  material constraint on any public deployment using it.
- Japanese symbol formats differ per provider (J-Quants: 5-digit codes;
  suffix styles like CODE.EXCHANGE elsewhere are undocumented for Tokyo) —
  our stable internal instrument IDs (never provider symbols) remain the
  right design.
- Real providers return numeric values as strings (EODHD Financials, all of
  Alpha Vantage, J-Quants /fins), use multiple missing-value sentinels
  (null, "", "n/a", "None", "-", absent key), disagree on percent
  conventions (Finnhub day-change percent is 1.23 = 1.23%), and can return
  errors as HTTP 200 (Alpha Vantage) — all validating the D1 decision to
  runtime-validate and normalize at the provider boundary.

## Next proposed milestone

D6 — Discovery Quality and Release Polish (as a demo release; SPEC §26
requires explicit user approval to define Discovery as complete without a
live provider).

D6 is proposed only. It is not authorized until the user explicitly
approves it.
