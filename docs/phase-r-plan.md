# Phase R Plan — Research and "What Changed?"

Status: **draft for user approval — not authorized**. Drafted 2026-08-10
after evaluating SEC EDGAR and EDINET official documentation (see
`docs/references/sec-edgar/` and `docs/references/edinet/`).

## Product goal (SPEC §25 Phase R)

Answer, for a company the user is researching:

> What has materially changed about this company since the previous period?

with evidence-grounded, source-cited output that separates REPORTED FACT /
MANAGEMENT CLAIM / CALCULATED VALUE / AI INTERPRETATION (SPEC §24.3).

## What the source evaluation established

| | SEC EDGAR (US) | EDINET (Japan) |
|---|---|---|
| Auth | None (User-Agent header required) | Free API key (registration + MFA) |
| Rate limit | 10 req/s documented | Unpublished; assume strict |
| Query model | Per-company (`companyfacts`, `submissions`) | **Per-day only** — must ingest + index |
| Structured numbers | 8/12 our metrics derivable from XBRL | Harder (24 industry tables, 2 namespaces) |
| Narrative sections | Heuristic extraction from 10-K HTML | **Cleanly tagged text blocks** (risks, MD&A) |
| Period cadence | Quarterly (10-Q) + annual (10-K) | Annual + semiannual only (quarterlies abolished) |
| History | Full archive | 10-year rolling deletion window |
| Licensing | US public domain | PDL 1.0 — redistribution + archiving allowed |
| Language | English | Filing text Japanese; taxonomy/plumbing ASCII |
| Errors | Mostly proper HTTP codes | Everything HTTP 200; check Content-Type |

Both are viable. EDGAR is dramatically cheaper to start with (keyless,
per-company queries, no storage requirement). EDINET requires persistence
by design (date-axis ingestion + 10-year deletion window).

## Proposed milestones

### R1 — US filing timeline and deterministic change detection (no LLM)

The smallest vertical slice proving the Research architecture:

- EDGAR client (server-side, declared User-Agent, 10 req/s budget,
  timeouts, runtime schema validation, in-memory TTL cache).
- CIK↔instrument mapping for a small bounded universe of REAL US companies
  (Research operates on real filings — the demo-fixture rule applies to
  fabricated values, not to quoted public filings; UI labels the difference).
- Filing timeline on a research page: 10-K/10-Q/8-K list with dates, form
  types, direct links to the SEC documents (citations).
- Deterministic financial-change table: latest vs prior comparable period
  from `companyfacts` XBRL (revenue, operating income, net income, EPS,
  shares, cash flow), each value carrying concept tag + accession number +
  period as provenance. Pure TypeScript deltas; nulls per house rules.
- No LLM, no database (per-company fetch + cache is sufficient), no EDINET.
- Tests: XBRL fact selection (fy/fp pitfalls, duplicate facts, non-calendar
  fiscal years), delta calculation, schema validation, error mapping,
  sanitized fixtures.

### R2 — Claude-powered "What Changed?" narrative comparison (US)

- Anthropic SDK (server-side), model + prompt versioning, cost caps.
- Extract narrative sections (risk factors, MD&A) from two consecutive
  10-Ks; deterministic pre-processing; Claude compares and classifies
  changes with citations; output schema-validated; every claim labeled
  REPORTED FACT / MANAGEMENT CLAIM / AI INTERPRETATION.
- Fact-classification UI per SPEC §24.3; no scores, no predictions.
- Evaluation fixtures with recorded expected outputs.

### R3 — Japan via EDINET (requires persistence)

- EDINET API key config (server-side; key is a query param — redact logs).
- Date-axis ingestion job + document index (this is where a database
  becomes necessary — SQLite or Postgres decision at R3 kickoff).
- 有価証券報告書/半期報告書 timeline; tagged text-block extraction
  (BusinessRisksTextBlock etc.); annual/semiannual comparison semantics
  (no quarterly vocabulary); cross-lingual Claude comparison (JP filing →
  EN research output, clearly labeled as translation-assisted).

## Decisions required before R1 (CLAUDE.md §18)

1. Authorize R1 as scoped above (real US companies, no LLM yet)?
2. R2 introduces the Anthropic SDK + runtime API costs — approve at R2
   start, with a model/cost budget.
3. R3 introduces a database — approve at R3 start.

## Explicitly out of scope for Phase R

Thesis journal (Phase T), contradiction engine (Phase C), portfolio (Phase
P), price forecasting, buy/sell signals, news analysis, earnings-call
transcripts (not in EDGAR/EDINET), live market prices (still demo / D5).
