# Market Thesis

Know why you invested—and when the facts change.

Market Thesis is a long-term investment discovery, research, thesis, and
portfolio monitoring application for US and Japanese stocks, ETFs, and market
indices. The current phase is **Discovery**.

> Market Thesis is a research tool, not financial advice. Market data may be
> delayed or incomplete. Verify information before making investment decisions.

**Demo release — no live market-data provider configured.**

## Current state (Discovery: D1–D6 complete, demo release)

- Discovery page with Stocks / ETFs / Indices tabs and market selection
  (All Markets, United States, Japan)
- Search by symbol, English name, and Japanese native name
- Shareable URL state: tab, market, search, page, ETF filters, index sorting
- Deterministic stock screening — Quality at a Reasonable Price v1, with
  transparent category/rule score breakdowns, match explanations, and
  data-completeness handling
- ETF filters (expense ratio, AUM, volume, yield, category, exposure region,
  exclude leveraged/inverse) and index return sorting
- Instrument detail pages with asset-specific sections, data availability,
  and provenance
- Browser-local watchlist (no account required)
- Deterministic **demo data only** — 26 fictional instruments with a fixed
  as-of date (2026-08-07). No live market data, no credentials, no market
  network calls.
- API: `GET /api/discovery/instruments`, `GET
  /api/discovery/instruments/[id]`, `POST /api/discovery/screen`,
  `GET /api/health`

Demo data — not current market information.

### Not supported in this release

- Live or delayed market prices (no provider configured; evaluation notes
  for five candidate providers live in `docs/references/`)
- Financial-sector scoring: banks, insurers, and REITs are excluded from the
  stock strategy because their balance sheets need different models
- Options, futures, cryptocurrency, bonds, mutual funds
- Portfolio tracking, thesis journal, AI analysis (future phases)

## Requirements

- Node.js 20+ (developed on Node 22)
- npm

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the root route redirects to `/discover`.

No environment configuration is required. Optionally copy the example file:

```bash
cp .env.local.example .env.local
```

`MARKET_DATA_PROVIDER` defaults to `demo`, the only supported provider in
this demo release. Any other value fails with a configuration error by
design — the app never silently falls back to demo data when a live provider
was requested.

## Scripts

```bash
npm run dev        # start the dev server
npm run lint       # ESLint
npm run typecheck  # TypeScript (strict)
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright smoke tests (builds + boots the app itself)
npm run build      # production build
```

End-to-end tests run in demo mode and require no API keys or network access
beyond localhost. First run: `npx playwright install chromium`.

## API

`GET /api/discovery/instruments`

| Parameter | Values | Default |
|---|---|---|
| `assetType` | `stock`, `etf`, `index` | `stock` |
| `market` | `US`, `JP` | all markets |
| `page` | positive integer | `1` |
| `pageSize` | 1–100 | `25` |

Invalid values return a structured `400` error. Unknown parameters are
ignored. Responses use a `{ data, pagination, meta }` envelope; `meta`
identifies the demo provider and data as-of date.

`GET /api/health` returns `{ status: "ok", app, provider, timestamp }`.

## Project structure

- `lib/domain` — provider-independent domain models (discriminated unions per
  asset type; missing data is always `null`)
- `lib/market-data` — provider boundary and the deterministic demo provider
- `lib/discovery` — service shared by the page and API route
- `lib/format` — centralized USD/JPY/percent/ratio formatting (missing → `—`)
- `lib/screener` — deterministic scoring, strategies, stock/ETF filters
- `data/demo` — fictional demo fixtures (fixed as-of date 2026-08-07)
- `docs/d1..d6-implementation-guide.md` — per-milestone design contracts
- `docs/references/` — market-data provider evaluation notes (D5 postponed)

See `SPEC.md` for product requirements, `CLAUDE.md` for development rules, and
`PROGRESS.md` for implementation state.
