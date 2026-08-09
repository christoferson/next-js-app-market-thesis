# Market Thesis

Know why you invested—and when the facts change.

Market Thesis is a long-term investment discovery, research, thesis, and
portfolio monitoring application for US and Japanese stocks, ETFs, and market
indices. The current phase is **Discovery**, milestone **D1 — Foundation and
Demo Discovery**.

> Market Thesis is a research tool, not financial advice. Market data may be
> delayed or incomplete. Verify information before making investment decisions.

## Current state (D1)

- Discovery page with Stocks / ETFs / Indices tabs
- Market selection: All Markets, United States, Japan
- Deterministic **demo data only** — fictional instruments with a fixed as-of
  date. No live market data, no credentials required, no network calls.
- `GET /api/discovery/instruments` and `GET /api/health`

Demo data — not current market information.

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

`MARKET_DATA_PROVIDER` defaults to `demo`, the only supported provider during
D1–D4. Any other value fails with a configuration error by design.

## Scripts

```bash
npm run dev        # start the dev server
npm run lint       # ESLint
npm run typecheck  # TypeScript (strict)
npm run test       # Vitest unit tests
npm run build      # production build
```

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
- `data/demo` — fictional demo fixtures (fixed as-of date 2026-08-07)
- `docs/d1-implementation-guide.md` — design contract for contributors

See `SPEC.md` for product requirements, `CLAUDE.md` for development rules, and
`PROGRESS.md` for implementation state.
