# Market Thesis Progress

## Current milestone

Phase C, milestone C1 — Contradiction Engine (evidence checks against
thesis claims).

## Status

C1 complete; all required checks pass (1,102 unit tests, full e2e suite)
and the engine was verified end to end with a live Bedrock evaluation over
real EDINET evidence. Discovery remains complete as a demo release;
Phase R (R1–R3) and Phase T (T1) complete. The full product workflow —
Discover → Investigate → Decide → Review — now exists.

## Completed milestones

- D1 — Foundation and Demo Discovery (2026-08-09)
- D2 — Search, URL State, Detail Page, and Watchlist (2026-08-09)
- D3 — Stock Screener and QARP Strategy (2026-08-09)
- D4 — ETF and Index Discovery (2026-08-09)
- D5 — resolved as demo mode + provider evaluation (2026-08-09; no live
  provider selected or implemented, per user decision)
- D6 — Discovery Quality and Release Polish (2026-08-09, demo release)
- R1 — US filing timeline + deterministic change detection (2026-08-10)
- R2 — AI narrative comparison of 10-K risk factors via Bedrock (2026-08-10)
- R3 — Japanese filings via EDINET + cross-lingual comparison (2026-08-10)
- T1 — Investment Thesis Journal: create/revise/journal (2026-08-14)
- C1 — Contradiction Engine: evidence checks with overrides (2026-08-14)

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

## Comparison persistence (post-C1 improvement, 2026-08-14)

- AI narrative comparisons (R2 US / R3 JP) moved from in-memory caches to a
  persistent history store (`data/user/comparisons.sqlite`) — a server
  restart no longer re-bills a comparison already paid for.
- Designed as HISTORY, not cache (user request): every generated result is
  kept; `?regenerate=1` (UI "Regenerate" button) runs a fresh model call —
  e.g. after switching models — and appends, never overwrites. The latest
  result for the current filing pair is served by default; a new filing
  naturally produces a fresh generation (pair mismatch), while model/prompt
  changes only take effect through explicit regeneration.
- UI shows "Result generated {date}", earlier-result counts, and the
  regenerate control. Live-verified end to end: generate (~13s, billed) →
  instant re-serve (0.02s) → instant after server restart (0.4s) →
  regenerate (new result, old preserved, priorResults=1).
- EDGAR data stays runtime-fetched (free, keyless, 15-min in-memory TTL) —
  persisting it would add staleness for no cost saving. Market-data caching
  proper is deferred to D5 (Finnhub free tier has real rate limits).
- 39 new store tests (1,141 total): history semantics, pair matching,
  model-independence of reads, shape-agnostic refs, persistence.

## C1 decisions

- Evidence gathering reuses the R1–R3 pipelines: US subjects get
  deterministic XBRL annual changes plus the latest 10-K risk narrative;
  Japanese subjects get the stored EDINET risk text. Demo subjects are
  honestly unsupported (fictional instruments have no filings). Zero
  evidence yields an "insufficient evidence" outcome — never a guess.
- Classification uses the SPEC §25 six-value scale (Strongly Supports →
  Strongly Contradicts, Insufficient Evidence). The prompt hard-codes:
  judge only from provided evidence, INSUFFICIENT_EVIDENCE over guessing,
  contradictions mean REVIEW, never suggest buying or selling.
- Every evaluation preserves the full SPEC-required record: claim,
  evidence summary + as-of date + sources, classification, rationale,
  verbatim excerpts, model ID, prompt version (claim-evaluation-v1,
  pinned by test), timestamp.
- User overrides annotate — never replace — the AI classification (both
  are always shown; deep-equality tested). Claims the model fails to
  address become explicit INSUFFICIENT_EVIDENCE rows, never silently
  absent.
- Each check appends a journal note to the thesis (the decision record
  stays complete); verdicts live in the evaluation history table
  (data/user/evaluations.sqlite, append-only with the same
  export-surface-pinning test pattern as T1).
- Checks are on-demand only (paid model call). Schema-mismatch failures
  log issue paths (not filing content) for diagnosability; run ordering
  uses a rowid tiebreak so same-millisecond runs stay deterministic
  (subagent review finding).
- Live verification (Nintendo thesis over real EDINET evidence): the
  engine STRONGLY_SUPPORTS the platform-strategy claim with verbatim
  Japanese excerpts, and MODERATELY_CONTRADICTS an FX-risk claim —
  correctly reading that the filing flags FX as a risk against the
  claim's "manageable" framing. Override flow verified: AI classification
  preserved alongside the user's NEUTRAL override and note.

## C1 verification

Run on 2026-08-14 (Node 22.14.0, Windows):

- `npm run lint` / `npm run typecheck` / `npm run build` — pass.
- `npm run test` — pass: 32 files, 1,102 unit tests (102 new: prompt
  pinning and language rules, output schema clipping, wire/Zod
  cross-checks, evaluation store round-trips, override annotate-not-
  replace contract, export-surface pinning, persistence).
- `npx playwright test` — 55 passed (desktop + mobile).
- Live end-to-end: thesis creation → evidence gathering from the local
  EDINET store → Bedrock evaluation → stored run with provenance →
  user override → journal note (results above). One transient
  model-output schema mismatch was observed before the successful run;
  diagnostic logging was added for future occurrences.

## T1 decisions

- Theses live in a second gitignored SQLite file
  (`data/user/theses.sqlite`), same better-sqlite3 dependency as the R3
  filing store. This is the first persistent USER data — local-only,
  no account, which the UI states plainly.
- Immutability is structural: the store module has no UPDATE/DELETE for
  versions or journal entries (a test pins the exact export list, so any
  new destructive export fails CI and forces a deliberate decision).
  Revising creates version N+1; every prior version is preserved
  byte-identical (deep-equal asserted in tests before/after revision).
- Claims are measurable by design: kind, falsifiable statement, optional
  baseline/target/invalidation values (decimals per house rules), deadline,
  importance 1–3 — the shape Phase C's Contradiction Engine will test
  evidence against. Claim IDs carry across revisions for continuity, but
  only IDs from the same thesis's history are accepted (foreign IDs are
  replaced); create-time IDs are rejected outright.
- Revisions require a "what changed and why" note; status changes require
  a note; both land in the append-only journal alongside free-form notes.
- Deadlines are validated as real calendar dates (2027-02-30 rejected) —
  Phase C will compare them to evidence dates.
- Deterministic only: no AI drafting or scoring of theses in T1; subject
  linking is by typed reference (demo:/research:/research-jp:) with links
  to the corresponding pages, no lookup UI yet.
- Subagent review contributed three hardening fixes (calendar dates,
  create/revise claim-ID split, foreign-ID guard) and one HTML-validity
  fix in the claim fieldset.

## T1 verification

Run on 2026-08-14 (Node 22.14.0, Windows):

- `npm run lint` / `npm run typecheck` / `npm run build` — pass.
- `npm run test` — pass: 30 files, 1,000 unit tests (177 new: store
  integrity incl. version immutability and export-surface pinning,
  validation contracts incl. strictness and injection attempts).
- `npx playwright test` — 54 passed across desktop + mobile projects.
- Runtime round-trips verified: create (201) → list → detail → revise
  (v2 created, v1 intact, claim ID continuity) → note → status change →
  journal chronology; invalid input → 400 with per-field details;
  unknown/malformed IDs → 404.

## R3 decisions

- Storage: SQLite via better-sqlite3, one gitignored file
  (`data/edinet/filings.sqlite`), WAL mode. Chosen over a
  file-download/pandas approach: pandas would add a Python runtime to a
  TypeScript app, and SQLite already is a single local file — with indexes
  and SQL (user approved 2026-08-10).
- EDINET is date-indexed only, so filings are ingested by a resumable sync
  script (`npm run sync:edinet -- <from> <to>` / `--resume`) that walks
  calendar dates, keeps annual (120) and semiannual (160) reports for a
  curated 6-company Japanese universe (Toyota, Sony, Keyence, Nintendo,
  Fast Retailing, Shin-Etsu), downloads XBRL archives, and extracts risk
  text at ingest time — page loads never re-download or re-parse.
- EDINET quirks handled per the evaluation notes: the API key rides in the
  query string (all URLs redacted before logging — unit-tested), errors
  arrive as HTTP 200 JSON (status checked in-body; 210 "no data" treated as
  success), document fetches validated by Content-Type, unpublished rate
  limit → conservative ~1.4 req/s throttle.
- Risk-section extraction targets the inline-XBRL element
  `jpcrp_cor:BusinessRisksTextBlock` with a depth-counting parser (the
  ix:nonNumeric wrapper nests; discovered live — the naive regex from the
  first draft failed on all five real filings and was rewritten against
  Nintendo's FY2025 report). Extracted Japanese text is clean prose
  (verified: no tag litter, headings and paragraph breaks preserved).
- Cross-lingual comparison reuses the R2 analysis facade unchanged:
  Japanese source text in, English findings out, with a prominent
  translation-assisted note (CROSS_LINGUAL_NOTE) and links to the original
  EDINET documents. Verified live (Nintendo FY2024→FY2025): 4 findings
  (2 REPORTED FACT, 1 MANAGEMENT CLAIM, 1 AI INTERPRETATION), correctly
  identifying the section as substantially unchanged, with verbatim
  Japanese evidence quotes; ~9K input / 1.1K output tokens.
- PDL 1.0 attribution (出典：EDINET閲覧（提出）サイト、PDL1.0) renders on
  every Japanese research page, satisfying EDINET's reuse license.
- The R2 What Changed client component was generalized (endpoint/label
  props with US defaults) rather than duplicated; US behavior unchanged.
- Semiannual reports are ingested and listed but comparison is
  annual-vs-annual in R3 (Japan abolished quarterly reports; semiannual
  narrative comparison is future work).

## R3 verification

Run on 2026-08-10 (Node 22.14.0, Windows):

- `npm run lint` / `npm run typecheck` / `npm run build` — pass.
- `npm run test` — pass: 28 files, 823 unit tests (74 new R3 tests: URL
  redaction, EDINET schemas, SQLite store round-trips/upsert/cursor with
  temp databases, inline-XBRL depth parsing incl. nesting and self-closing
  tags, ZIP extraction with Japanese text, universe integrity).
- `npx playwright test --project=chromium` — 25 passed (no regressions).
- Live: synced 12 real filings across three date windows (~53 EDINET
  requests); extracted risk text for all six companies both years
  (1.9K–22K chars each); one live cross-lingual Bedrock comparison
  (result above).

## R2 decisions

- Runtime AI transport is AWS Bedrock (user decision 2026-08-10), accessed
  through the `AnthropicBedrockMantle` client with the standard AWS
  credential chain (AWS_PROFILE locally; ECS task role later). No API keys
  in app config.
- A provider-agnostic facade (`lib/research/analysis/types.ts` +
  `get-client.ts`) isolates the transport: `RESEARCH_ANALYSIS_PROVIDER`
  selects the implementation ("bedrock" default, "off" disables); swapping
  to the first-party Anthropic API later is one new factory branch.
- Default model `anthropic.claude-sonnet-5` (override:
  `RESEARCH_ANALYSIS_MODEL_ID`); adaptive thinking; structured output via a
  forced tool call validated by Zod. Bedrock rejects `strict: true` on
  tools (verified live) — forced tool_choice + server-side Zod validation
  provides the schema guarantee instead.
- Every analysis carries provenance: model ID, prompt version
  (`narrative-comparison-v2` — versioned; any prompt/schema change requires
  a bump enforced by a pinning test), generation time, token counts.
- Findings are classified REPORTED FACT / MANAGEMENT CLAIM /
  AI INTERPRETATION per SPEC §24.3, with verbatim evidence quotes and links
  to both source filings.
- Comparisons are ON-DEMAND (button), never on page load — each is a paid
  Bedrock call (~43K input tokens for a large 10-K pair). Successful results
  are cached in-memory per company.
- Length-vs-structure validation split: structural problems (wrong enums,
  missing fields) reject the response; over-long strings and extra findings
  are clipped after validation — a valid-but-verbose response is a paid
  call and is not discarded.
- Section extraction is deterministic and heuristic (10-K HTML → text →
  Item 1A slice, TOC-vs-body disambiguated by last heading match). When a
  section cannot be located the UI says so — it never approximates. Two
  real-world fixes verified against live filings: inline tags (span/font)
  strip to nothing because filings split words across spans ("RIS|K
  FACTORS"), and single-quote entities decode to apostrophes (both found by
  live testing / subagent review).
- Live end-to-end verification (MSFT FY2025→FY2026 10-Ks): 15 findings
  (3 REPORTED FACT, 5 MANAGEMENT CLAIM, 7 AI INTERPRETATION), all with
  evidence quotes, correct period labels, neutral language.

## Verification

R2, run on 2026-08-10 (Node 22.14.0, npm 11.11.0, Windows):

- `npm run lint` — pass. `npm run typecheck` — pass. `npm run build` — pass.
- `npm run test` — pass: 24 files, 749 unit tests (72 new R2 tests:
  HTML-to-text conversion, section extraction incl. TOC-vs-body and
  boundary cases, prompt determinism and clipping, schema validation and
  wire-schema/Zod cross-checks, error types).
- `npx playwright test --project=chromium` — 25 passed (no regressions).
- Live verification (opt-in, real requests): `scripts/verify-bedrock.mjs`
  (structured output round-trip), `scripts/debug-sections.mjs` (extraction
  regexes against MSFT/AAPL/PG 10-Ks), and one full end-to-end comparison
  through the API route (result above).

R1 verification history:

- `npm run lint` — pass. `npm run typecheck` — pass. `npm run build` — pass
  (`/research` static, `/research/[companyId]` force-dynamic — EDGAR is
  never called at build time).
- `npm run test` — pass: 21 files, 677 unit tests (74 new R1 tests over a
  sanitized companyfacts fixture: fy/fp duplicate-fact dedupe, 10-K/A
  restatement precedence, concept drift tag fallback, 10-Q/Q4 exclusion
  from annual series, instant vs duration, missing concepts as null,
  zero-prior-base relative change, schema validation).
- `npm run test:e2e` — pass: 55 passed, 7 intentionally skipped.
- Live verification against real EDGAR data (opt-in, not in default tests;
  `scripts/verify-edgar.mjs`): Apple submissions + companyfacts fetch,
  annual revenue dedupe (raw facts → unique periods), restatement handling.
  The research pages rendered real cited data for AAPL/KO/PG/DIS/INTC/MSFT,
  including non-calendar fiscal years; the EDGAR-failure branch renders a
  readable inline error, verified with a shimmed 503.

## R1 decisions

- Research shows REAL companies' actual SEC filings, cited to source
  documents — distinct from Discovery's fictional demo market data; the UI
  labels the difference prominently. SPEC §9.1's fictional-identity rule
  governs fabricated values, not quoted public filings.
- Curated 10-company starter universe (user decision 2026-08-10); free-text
  CIK lookup deferred.
- EDGAR access: keyless with a declared User-Agent (`EDGAR_USER_AGENT` env
  var, non-secret), serialized requests with 150ms spacing (far below the
  documented 10 req/s), 15-minute in-memory TTL cache, 15s timeouts,
  runtime Zod validation of all responses.
- XBRL fact selection: facts are grouped by their own (start, end) period —
  never by EDGAR's `fy`/`fp`, which describe the filing — and deduped
  keeping the latest `filed`, so amendments and later comparatives restate
  earlier values. Revenue uses an ordered tag-fallback list (ASC 606 tag
  first) with the winning tag recorded as provenance.
- Change semantics: relative change is null when the prior base is zero;
  missing concepts render as lines with "not reported", never omitted or
  zeroed. Neutral language throughout ("changed", never "improved").
- No LLM, no database in R1 (per approved plan); the Anthropic SDK and
  persistence remain gated on R2/R3 approval.

## Discovery status

**Discovery is complete as a demo release** (D1, D2, D3, D4, D6 implemented;
D5 resolved as "stay in demo mode" by explicit user decision — see the D5
provider decision below; SPEC §26 demo-release definition approved by the
user on 2026-08-09 when authorizing D6).

D6 (final Discovery verification), run on 2026-08-09 (Node 22.14.0,
npm 11.11.0, Windows):

- `npm run lint` — pass. `npm run typecheck` — pass. `npm run build` — pass.
- `npm run test` — pass: 17 files, 603 unit tests (9 new filter-chips tests).
- `npm run test:e2e` — pass: 55 passed, 7 intentionally skipped (mobile-only
  specs skipped on desktop and vice versa), 0 failed, across chromium and
  Pixel 7 projects. Covers the SPEC §20.7 13-step smoke flow, keyboard
  navigation (skip link, arrow-key tabs, watchlist toggle, pagination, filter
  form), mobile behavior (cards not table, no horizontal scroll, filter
  disclosure, count badge), and accessibility basics (single h1, labeled
  controls, aria-current nav, chips, clear-all).
- D6 changes: filter-summary chips with per-chip remove and clear-all
  (URL-driven); mobile ETF filter disclosure (fields unmounted when
  collapsed); skip-to-content link; aria-current nav; motion-reduce
  transition suppression (16 sites); contrast bump stone-500→stone-600 for
  informational text (31 sites); error state promises preserved filters and
  watchlist; watchlist unavailable-instrument note; Playwright added as the
  D6-authorized e2e dependency.
- A11y bug found by the e2e suite and fixed: arrow-keying across the Stocks
  tab boundary dropped keyboard focus because the tab subtree remounted
  (element type changed between StockScreener and DiscoveryControls per
  tab). Fixed by rendering StockScreener for every tab with an internal
  non-stock passthrough, keeping the element identity stable. The regression
  is locked by an active e2e test.

D4 verification history:

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

The core workflow (Discover → Investigate → Decide → Review) is complete.
Candidate next steps, each requiring explicit approval:

- C2/T2 — workflow polish: "Write a thesis" links on research pages,
  subject lookup instead of free text, evidence checks that include
  numeric XBRL deltas for JP subjects, scheduled checks, e2e coverage
  for thesis/check flows, Claude-assisted claim structuring.
- D5 live market data: user preferences already recorded (personal, free
  tier, delayed OK, US-first, indices via ETF proxies) — needs only a
  Finnhub API key to begin.
- Phase P — Portfolio tracking (SPEC §25): manual transactions, cost
  basis, USD/JPY positions; the largest remaining phase.

None is authorized until the user explicitly approves one.
