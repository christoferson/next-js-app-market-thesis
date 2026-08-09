# Market Thesis Progress

## Current milestone

D1 — Foundation and Demo Discovery

## Status

Complete. All required checks pass. Awaiting user review and explicit
authorization before D2.

## Completed milestones

- D1 — Foundation and Demo Discovery (2026-08-09)

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

## Verification

Run on 2026-08-09 (Node 22.14.0, npm 11.11.0, Windows):

- `npm run lint` — pass (no warnings or errors).
- `npm run typecheck` — pass (strict mode, zero errors).
- `npm run test` — pass: 5 files, 103 tests, 0 failures.
- `npm run build` — pass: `/`, `/about`, `/discover` prerendered; both API
  routes dynamic.
- Production smoke test (`npm run start`):
  - `/` → 307 redirect to `/discover`.
  - `/api/health` → `{"status":"ok","app":"Market Thesis","provider":"demo",…}`.
  - `/api/discovery/instruments?assetType=etf&market=JP&pageSize=2` →
    normalized JP ETF snapshots with envelope, pagination, and demo provenance.
  - `assetType=bond` → structured 400 `INVALID_REQUEST` with field details.
  - Stocks with `pageSize=5&page=3` → final page of 2 items,
    `hasNextPage: false`, no duplicates across pages (also unit-tested).
  - `/discover` HTML contains the demo-data notice, financial disclaimer, and
    Discovery purpose text.

## Known limitations

- Demo data only (26 fictional instruments, fixed as-of date 2026-08-07).
- No search.
- No watchlist.
- No instrument detail page.
- No stock scoring or strategies.
- No filters beyond asset type and market.
- No URL state (refresh returns to the default view by design until D2).
- No sorting controls.
- No live prices.
- No portfolio tracking.
- No runtime AI integration.
- Browser-based manual verification (keyboard tab navigation, mobile layout)
  was smoke-tested via rendered HTML only; visual confirmation steps are
  listed in the D1 report for the user to run.

## Next proposed milestone

D2 — Search, URL State, Detail Page, and Watchlist

D2 is proposed only. It is not authorized until the user explicitly approves it.
