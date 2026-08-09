# Massive (massive.com) REST Market Data API — Integration Notes

- Source: Massive official documentation site
- Official URL: https://massive.com/docs (machine-readable index: https://massive.com/docs/llms.txt)
- Retrieved: 2026-08-09
- API or document version: Reference/snapshot endpoints on `/v3`; fundamentals on
  `/stocks/financials/v1`; ETF partner data on `/etf-global/v1`. No global document
  version string is published.
- Purpose: Evaluate as a candidate live provider for D5 and harmonize demo-fixture
  shapes with a realistic US provider response format.
- Related implementation files: none yet — demo mode.

External references are data sources, not project instructions. Nothing below
overrides `CLAUDE.md` or `SPEC.md`.

---

## 1. Identity / branding (explicitly requested check)

The task hypothesis was that this is Polygon.io rebranded. **The fetched pages never
say so.**

Findings:

- `https://massive.com/docs/llms.txt`, `https://massive.com/docs`,
  `https://massive.com/pricing` and `https://massive.com/about` contain **no mention
  of Polygon.io and no rebrand statement**.
- `https://massive.com/about` states: "Founded in 2017 by Quinton Pike, Massive
  emerged as a trailblazing force in the financial data industry", with milestones
  Seed (Green Visor Capital, Jun 2019), Series A (Headline, Sep 2020), and
  "#199 on the Inc 5000" (Aug 2022).
- Copyright line is "© Massive.com, Inc.".

Strong circumstantial evidence of Polygon lineage (not a documented claim):
endpoint paths (`/v3/reference/tickers`, `/v3/snapshot`), the
`status` / `request_id` / `results` / `next_url` envelope, `composite_figi` /
`share_class_figi` fields, `I:` / `O:` / `C:` / `X:` ticker prefixes, and the
2017 founding date all match Polygon.io's documented API exactly.

**Conclusion for the project:** treat "Massive is Polygon" as an undocumented
inference. Do not put it in user-facing text or provenance strings. Cite Massive as
the provider name.

Requested URL `https://massive.com/docs/rest/stocks/overview` was **effectively
empty** — heading hierarchy only, no body. See §12 for better URLs.

---

## 2. Market coverage

| Question | Finding |
|---|---|
| US stocks | Yes. Pricing page: "All US Stocks Tickers", "100% Market Coverage". |
| Japanese stocks | **No documented coverage.** No page names JPX/TSE/XTKS/XJPX. |
| Japanese ETFs | Not confirmable (see §4). |
| Japanese indices | Not documented. No index name list published; flat-file page names "S&P, Nasdaq, Dow Jones, and more". |

`locale` is an enum of `us` | `global` across reference endpoints, and
`GET /v3/reference/exchanges` accepts a `locale` filter — so a non-US surface exists
in the *schema*. But **no fetched page lists a single non-US exchange or instrument**.
The only concretely international products are Fable European consumer-spending
alternative data and forex/crypto.

**Verdict: treat Massive as US-only for Market Thesis purposes.** It cannot serve the
JP half of the product. Any JP coverage claim would need to be verified by calling
`/v3/reference/exchanges?locale=global` against a live key.

---

## 3. Asset-type coverage

- **Stocks**: full REST surface (aggregates, snapshots, reference, fundamentals).
- **Indices**: separate documented product line — `/v3/reference/tickers`
  (`market=indices`), indices snapshot, aggregates, market status/holidays.
  Index tickers use an `I:` prefix (documented in the unified-snapshot `ticker`
  param alongside `O:` options, `C:` forex, `X:` crypto).
  Index history "Records date back to February 14, 2023" — short.
  **No index-constituents endpoint exists.**
- **ETFs**: there is **no first-class ETF surface**. ETFs appear only as a `type` code
  in the ticker reference (the type-code list itself is not published in the docs; the
  `/v3/reference/tickers/types` page documents only the schema). Real ETF metadata is
  a **paid third-party partner add-on** (ETF Global) — see §4.
- Also present but out of scope: options, futures, forex, crypto, economy,
  alternative data.

---

## 4. ETF metadata (ETF Global partner endpoints)

`GET /etf-global/v1/profiles` is a strong match for our `EtfMetrics` shape:

| Our field | Massive/ETF Global field | Note |
|---|---|---|
| `expenseRatio` | `total_expenses` | "total annual expense ratio ... including all fees". Also `management_fee`, `net_expenses`, `other_expenses`, `fee_waivers`. Sample `0.0945` — **appears to be percent-points (9.45%?) for SPY, which is implausible; unit is ambiguous and must be verified live.** |
| `assetsUnderManagement` | `aum` | number, e.g. `624531939442.66` |
| `averageVolume` | `avg_daily_trading_volume` | |
| `holdingsCount` | `num_holdings` | e.g. `504` |
| `issuer` | `issuer` | e.g. `"SSgA"` |
| `trackingIndex` | `primary_benchmark` | e.g. `"S&P 500 Index"` |
| `category` | `category`, `focus`, `asset_class`, `product_type` | |
| `exposureRegions` | `geographic_exposure`, `region` | decimal weights keyed by lowercase ISO country (`us: 0.967`) |
| `exposureSectors` | `sector_exposure` (+ industry / industry_group / subindustry) | decimal weights |
| `isLeveraged` | `leverage_style` (`leveraged` \| `unleveraged`) | |
| `isInverse` / `leverageFactor` | `levered_amount` | "negative numbers indicate inverse exposure" |
| `dividendYield` | **absent** | only `distribution_frequency` |

Other fields: `administrator`, `advisor`, `subadvisor`, `bid_ask_spread`,
`creation_fee`, `creation_unit_size`, `custodian`, `description`, `discount_premium`,
`distributor`, `effective_date`, `fiscal_year_end` (odd format `"31-Aug"`),
`inception_date`, `lead_market_maker`, `listing_exchange`,
`management_classification` (active/passive), `options_available`, `options_volume`,
`put_call_ratio`, `call_volume`, `put_volume`, `short_interest`, `tax_classification`,
`transfer_agent`, `trustee`, `portfolio_manager`, `development_class`,
`maturity_exposure`, `coupon_exposure`, `currency_exposure`, `processed_date`.

Sibling endpoints: `/etf-global/v1/constituents` (holdings), `/analytics`,
`/fundflows`, `/taxonomies`.

Caveats:

- Gated: "Included in select ETF Global expansion plans" — a separate paid
  expansion, not in any base Stocks plan. Price not published on the pages fetched.
- Docs say "global ETFs" but list **no exchange coverage**; the only example is SPY on
  NYSE Arca. **Tokyo-listed ETF coverage is unverified.**
- Exposure fields are typed `array[object]` in the attribute table but rendered as
  key/value maps in the sample — a real schema inconsistency; validate defensively.
- `lead_market_maker` sample value is the **string** `"None"`, not JSON null.

---

## 5. Fundamentals vs our 12 stock metrics

Two relevant surfaces: `GET /stocks/financials/v1/ratios` (TTM, precomputed) and the
three statement endpoints (`income-statements`, `balance-sheets`,
`cash-flow-statements`).

| Our metric | Status | Source |
|---|---|---|
| `peRatio` | **Available** | `ratios.price_to_earnings`. Docs: "Only calculated when earnings per share is positive" — matches our rule never to synthesize a P/E from negative earnings. |
| `priceToBook` | **Available** | `ratios.price_to_book` |
| `revenueGrowth` | **Calculable** | `income-statements.revenue` across two periods (`timeframe=annual` or `trailing_twelve_months`) |
| `epsGrowth` | **Calculable** | `income-statements.diluted_earnings_per_share` across periods |
| `returnOnEquity` | **Available** | `ratios.return_on_equity` (decimal, e.g. `1.5284`) |
| `operatingMargin` | **Calculable** | `operating_income / revenue` |
| `freeCashFlowMargin` | **Calculable** | `(net_cash_from_operating_activities - purchase_of_property_plant_and_equipment) / revenue`; capex "typically reported as negative values" so the sign convention must be handled explicitly |
| `freeCashFlowYield` | **Calculable** | `1 / ratios.price_to_free_cash_flow`, or `ratios.free_cash_flow / ratios.market_cap`. No direct yield field. |
| `debtToEquity` | **Available** | `ratios.debt_to_equity` |
| `currentRatio` | **Available** | `ratios.current` — **note the field is named `current`, not `current_ratio`** |
| `dividendYield` | **Available** | `ratios.dividend_yield` (decimal, e.g. `0.0044`) |
| `shareCountCagr3Y` | **Calculable** | `income-statements.diluted_shares_outstanding` (or `basic_shares_outstanding`) across 3 annual periods. Balance sheets do **not** carry shares outstanding. `/v3/reference/tickers/{ticker}` carries current `share_class_shares_outstanding` and `weighted_shares_outstanding` only. |

Score: 6 of 12 direct, 6 of 12 deterministically calculable from statements. Good fit
for a US-only screener.

Ratios extras we don't use: `price_to_sales`, `price_to_cash_flow`,
`return_on_assets`, `quick`, `cash`, `ev_to_sales`, `ev_to_ebitda`,
`enterprise_value`, `average_volume`, `market_cap`, `price`, `earnings_per_share`.

Financials are **Stocks Advanced or the $29/mo "Financials & Ratios" expansion** —
not in the free tier. History from 2009-03-29.

---

## 6. Screening support

`GET /stocks/financials/v1/ratios` is the closest thing to a screener and is genuinely
usable: every numeric field supports `.gt` / `.gte` / `.lt` / `.lte` filter modifiers,
plus `ticker.any_of`, `sort`, and `limit` up to **50000**. That covers server-side
threshold screening on P/E, P/B, ROE, D/E, current ratio, dividend yield, market cap,
price, and average volume in one request.

Not supported server-side: growth metrics, margins, FCF yield, sector filters, ETF
filters. Those require client-side deterministic computation over fetched statements.
There is **no dedicated screener endpoint**; `top-market-movers` is momentum-only and
not relevant to us.

---

## 7. Response format specifics

**Envelope** (uniform, snake_case, all lowercase):

```json
{
  "count": 1,
  "next_url": "https://api.massive.com/v3/reference/tickers?cursor=YWN0aXZlPXRydWUm...",
  "request_id": "e70013d92930de90e089dc8fa098888e",
  "results": [],
  "status": "OK"
}
```

- `status` is an enum whose documented value is `OK`.
- `count` appears in samples but is **not always in the attribute tables** (e.g.
  ratios, ETF profiles) — treat it as optional.
- `results` is an array on list endpoints and a **single object** on
  `/v3/reference/tickers/{ticker}` — the envelope is not uniformly array-shaped.
- `request_id` is documented as a string but the ETF-profiles sample shows the integer
  `1`. Validate as `unknown` then coerce.

**Pagination**: cursor-based via an opaque, fully-qualified `next_url` containing a
base64 `cursor=` parameter. Follow it verbatim; do not reconstruct. `cursor` is not
documented as a direct input param on `/v3/reference/tickers`. Limits: reference
endpoints default 100 / max 1000; snapshot default 10 / max 250; financials default
100 / max 50000.

**Null representation**: **not documented anywhere.** Samples consistently *omit*
absent fields rather than emitting `null` (income statements omit
`depreciation_depletion_amortization`, `interest_expense`, `discontinued_operations`;
ETF profiles omit `subadvisor`). Conditional ratios (`price_to_earnings`,
`price_to_cash_flow`, `price_to_free_cash_flow`) are "only calculated when" the
denominator is positive — representation on failure unspecified.
**This is the single most important thing to get right at our boundary:** absent key,
`null`, and the string `"None"` must all normalize to our `value: null` with an
`unavailableReason`, and must never become `0`.

**Date / timestamp formats**:

- Dates: ISO `YYYY-MM-DD` (`"2024-09-19"`, `"1980-12-12"`, `period_end`,
  `filing_date`, `processed_date`, `effective_date`).
- Timestamps: ISO 8601 UTC with `Z` (`"2021-04-25T00:00:00Z"` in
  `last_updated_utc`, `delisted_utc`).
- Exception: ETF `fiscal_year_end` is `"31-Aug"`.

**Symbol format**: bare uppercase US tickers (`AAPL`, `A`, `SPY`). Documented as
case-sensitive. Prefixes namespace non-equity classes: `I:` indices, `O:` options,
`C:` forex, `X:` crypto (e.g. `X:BTCUSD`). ETF Global uses a distinct key name,
`composite_ticker`. **No suffix/exchange-qualified symbol scheme is documented**, which
is further evidence of US-only scope. Identifiers available for joins:
`composite_figi`, `share_class_figi`, `cik`; `cusip` is queryable but "never returned
... due to legal reasons".

**Currency handling**: `currency_name` is **lowercase** (`"usd"`), with
`currency_symbol`, `base_currency_name`, `base_currency_symbol` also present. No
FX-normalization or reporting-currency-conversion feature is documented. Values are
in the instrument's native currency. Our `SupportedCurrency` union is uppercase, so
normalization must uppercase and validate.

**Units**: ratios/percentages are **decimals** (`dividend_yield: 0.0044`,
`return_on_equity: 1.5284`, exposure `us: 0.967`) — this matches our
"percentages as decimals" invariant directly. The ETF `total_expenses: 0.0945`
sample is the one unit ambiguity flagged in §4.

**Errors**: per-result soft errors in the unified snapshot, e.g.
`{"error": "NOT_FOUND", "message": "Ticker not found."}` inside `results` with
`"status": "OK"` at the top level. A partial success can therefore look like a
success — our mapper must inspect each result, and must not turn a not-found into an
empty successful response.

**Selected verbatim sanitized excerpts**

`GET /v3/reference/tickers` result object:

```json
{
  "active": true,
  "cik": "0001090872",
  "composite_figi": "BBG000BWQYZ5",
  "currency_name": "usd",
  "last_updated_utc": "2021-04-25T00:00:00Z",
  "locale": "us",
  "market": "stocks",
  "name": "Agilent Technologies Inc.",
  "primary_exchange": "XNYS",
  "share_class_figi": "BBG001SCTQY4",
  "ticker": "A",
  "type": "CS"
}
```

`GET /stocks/financials/v1/ratios` result object:

```json
{
  "average_volume": 47500000,
  "cash": 0.19,
  "cik": "320193",
  "current": 0.68,
  "date": "2024-09-19",
  "debt_to_equity": 1.52,
  "dividend_yield": 0.0044,
  "earnings_per_share": 6.57,
  "market_cap": 3479770835190,
  "price": 228.87,
  "price_to_book": 52.16,
  "price_to_earnings": 34.84,
  "price_to_free_cash_flow": 33.35,
  "return_on_equity": 1.5284,
  "ticker": "AAPL"
}
```

Note `cik` is zero-padded (`"0000320193"`) on reference endpoints but not on ratios
(`"320193"`) — do not assume a canonical form.

---

## 8. Authentication

- Requires an API key, issued from the dashboard (`/dashboard/signup`,
  `/dashboard/keys`).
- **The exact transport (header vs query param) is not stated on any page fetched** —
  neither `/docs`, the llms.txt index, nor the individual endpoint reference pages
  document an auth header name or `apiKey=` parameter. Must be confirmed before
  implementation.
- Regardless: server-side only, never a `NEXT_PUBLIC_*` variable.
- Base URL observed in samples and `next_url` values: `https://api.massive.com`.

---

## 9. Rate limits, plan tiers, freshness

From `https://massive.com/pricing` (Stocks tab):

| Plan | Price/mo | API calls | Freshness | History |
|---|---|---|---|---|
| Stocks Basic | $0 | 5 / minute | End-of-day only | 2 years |
| Stocks Starter | $29 | Unlimited | 15-minute delayed | All |
| Stocks Developer | $79 | Unlimited | 15-minute delayed | All |
| Stocks Advanced | $199 | Unlimited | Real-time | All |
| Financials & Ratios (standalone) | $29 | — | End-of-day | From 2009-03-29 |

- Indices plans exist as a separate tab (Basic / Starter / Advanced / Business) but the
  pricing section rendered as "Loading..." — **Indices prices not captured.**
  Indices reference data is "Included in all Indices plans", updated hourly, history
  from 2023-02-14.
- ETF Global profiles: separate "ETF Global Profiles & Exposure" expansion, price not
  captured. Updated daily, history from 2017-04-03.
- Ticker reference and overview: "Included in all Stocks plans", updated daily,
  records from 2003-09-10 (Basic capped at 2 years).
- `fmv` (fair market value) is Business-plan only.

**Free-tier viability for Market Thesis:** poor. The $0 tier gives US tickers +
end-of-day prices at 5 calls/min, but **excludes all fundamentals**, so 11 of our 12
stock metrics are unreachable. A realistic live configuration is $199 Advanced (or $29
Starter + $29 Financials & Ratios) plus a separate ETF Global expansion plus a
separate Indices plan — and still zero Japan coverage.

---

## 10. Licensing / redistribution

- Every consumer plan on the pricing page is badged **"Individual use only"**, with a
  footer note "Non-pros only" linking to a professional-status page. Business use is
  routed to separate business pricing.
- **No redistribution terms, licensing text, or market-data agreement is present on
  any documentation page fetched.** The llms.txt index has no pricing/licensing/terms
  entries at all.
- Named upstream sources create downstream obligations we have not reviewed: FINRA,
  SEC EDGAR, CTA, UTP, OPRA, plus partners Benzinga, ETF Global, TMX/Wall Street
  Horizon, Fable Data.

**Open risk:** displaying Massive-derived quotes in a web app that other people can
reach is plausibly outside "individual use only". This needs the actual Terms of
Service reviewed and, most likely, a business plan — a decision for the user, not an
implementation detail.

---

## 11. Known limitations (summary)

1. No documented Japanese market coverage — cannot serve half of Market Thesis.
2. Auth transport undocumented on all fetched pages.
3. Null/missing-value representation undocumented; samples omit keys.
4. ETF metadata is a separate paid partner product with unverified JP coverage and an
   ambiguous expense-ratio unit.
5. Index history only from 2023-02-14; no index constituents; no index name list.
6. Ticker `type` code list (CS / ETF / INDEX / ...) not published in the docs.
7. `/v3/reference/exchanges` and `/v3/reference/tickers/types` document schema only —
   no actual coverage lists.
8. Requested overview URL was empty; docs discovery depends on `llms.txt`.
9. "Individual use only" licensing badge is a real blocker for a shared web app.
10. Envelope inconsistencies: `count` sometimes undocumented, `results` sometimes an
    object, `request_id` type varies.

---

## 12. Better URLs than the one supplied

The supplied `https://massive.com/docs/rest/stocks/overview` was empty. Use:

- Machine-readable doc index (best entry point): `https://massive.com/docs/llms.txt`
- Docs home: `https://massive.com/docs`
- Any reference page + `.md` suffix returns clean markdown, e.g.
  `https://massive.com/docs/rest/stocks/fundamentals/ratios.md`
- Ticker reference: `https://massive.com/docs/rest/stocks/tickers/all-tickers.md`,
  `.../ticker-overview.md`, `.../ticker-types.md`
- Fundamentals: `.../fundamentals/ratios.md`, `income-statements.md`,
  `balance-sheets.md`, `cash-flow-statements.md`
- ETF metadata: `https://massive.com/docs/rest/partners/etf-global/profiles.md`,
  `.../constituents.md`
- Indices: `https://massive.com/docs/rest/indices/tickers/all-tickers.md`
- Pricing / tiers / limits: `https://massive.com/pricing`
- Company identity: `https://massive.com/about`

Still needed from the user or a live key: authentication transport, Terms of Service /
redistribution rights, Indices plan pricing, ETF Global expansion pricing, and the
actual output of `/v3/reference/exchanges?locale=global` to settle non-US coverage.
