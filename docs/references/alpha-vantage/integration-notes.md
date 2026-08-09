# Alpha Vantage — Provider Evaluation

- **Source:** Alpha Vantage official API documentation
- **Official URL:** https://www.alphavantage.co/documentation/ (assigned page).
  Additional pages / live probes:
  - https://www.alphavantage.co/premium/ (pricing, rate limits)
  - https://www.alphavantage.co/support/ (free-key rate limit, terms language)
  - `GET /query?function=OVERVIEW&symbol=IBM&apikey=demo` (live shape capture)
  - `GET /query?function=ETF_PROFILE&symbol=QQQ&apikey=demo` (live shape capture)
- **Retrieved:** 2026-08-09
- **API or document version:** Unversioned. Single `/query` gateway with a
  `function=` selector. No version string published.
- **Purpose:** Evaluate as a candidate live provider for D5 (US + Japan stocks,
  ETFs, indices) and harmonise demo fixture shapes with a realistic provider
  envelope. No code is written against this provider.

---

## Relevant endpoints

All endpoints are `GET https://www.alphavantage.co/query?function=<NAME>&...&apikey=<KEY>`.

| Purpose | `function=` | Notes |
|---|---|---|
| Instrument search | `SYMBOL_SEARCH` | `keywords=`; covers "any supported global stock, ETF, or mutual fund" |
| Exchange symbol universe | `LISTING_STATUS` | Listed in TOC as a "🔧 Utility"; params/format not shown before page truncation |
| Company fundamentals | `OVERVIEW` | Confirmed live; see shape below |
| Financial statements | Income Statement / Balance Sheet / Cash Flow / Earnings History | TOC-listed; exact `function=` values not shown before truncation (conventionally `INCOME_STATEMENT`, `BALANCE_SHEET`, `CASH_FLOW`, `EARNINGS` — **not confirmed from fetched docs**) |
| Shares outstanding | "Shares Outstanding" | TOC-listed only |
| ETF profile + holdings | `ETF_PROFILE` | Confirmed live; see shape below |
| Quote | `GLOBAL_QUOTE` | EOD free; realtime / 15-min-delayed require premium via `entitlement=realtime|delayed` |
| Index OHLC | `INDEX_DATA` | **Premium-only.** "200+ major indices", `interval=daily|weekly|monthly` |
| Screener | — | **No screener endpoint exists.** Closest analogues are "Top Gainers & Losers" and the Analytics endpoints |

There is **no pagination anywhere**. Series size is controlled by
`outputsize=compact` (latest 100 points) vs `full`, plus a `month=YYYY-MM`
parameter for intraday.

### `OVERVIEW` response shape (captured live, IBM)

Flat single-level object, **PascalCase keys**, no envelope. **Every value is a
JSON string, including numbers.** Key order verbatim:

`Symbol, AssetType, Name, Description, CIK, Exchange, Currency, Country, Sector,
Industry, Address, OfficialSite, FiscalYearEnd, LatestQuarter,
MarketCapitalization, EBITDA, PERatio, PEGRatio, BookValue, DividendPerShare,
DividendYield, EPS, RevenuePerShareTTM, ProfitMargin, OperatingMarginTTM,
ReturnOnAssetsTTM, ReturnOnEquityTTM, RevenueTTM, GrossProfitTTM, DilutedEPSTTM,
QuarterlyEarningsGrowthYOY, QuarterlyRevenueGrowthYOY, AnalystTargetPrice,
AnalystRatingStrongBuy, AnalystRatingBuy, AnalystRatingHold, AnalystRatingSell,
AnalystRatingStrongSell, TrailingPE, ForwardPE, PriceToSalesRatioTTM,
PriceToBookRatio, EVToRevenue, EVToEBITDA, Beta, 52WeekHigh, 52WeekLow,
50DayMovingAverage, 200DayMovingAverage, SharesOutstanding, SharesFloat,
PercentInsiders, PercentInstitutions, DividendDate, ExDividendDate`

Sanitized excerpt (real IBM values, EOD/derived — retained because they are
factual public fundamentals and illustrate the string-typing convention):

```json
{
  "Symbol": "IBM",
  "AssetType": "Common Stock",
  "Exchange": "NYSE",
  "Currency": "USD",
  "Country": "USA",
  "FiscalYearEnd": "December",
  "LatestQuarter": "2026-06-30",
  "PERatio": "21.05",
  "PriceToBookRatio": "6.49",
  "ReturnOnEquityTTM": "0.345",
  "OperatingMarginTTM": "0.166",
  "DividendYield": "0.0288",
  "QuarterlyRevenueGrowthYOY": "0.011",
  "QuarterlyEarningsGrowthYOY": "-0.018",
  "SharesOutstanding": "942134000"
}
```

Useful confirmations for our domain model:

- Percentages are already **decimals** (`"0.0288"` = 2.88%), matching our invariant.
- Currency is an explicit field (`Currency`), and `AssetType` distinguishes
  `Common Stock` vs (presumably) `ETF`.
- Dates are ISO `YYYY-MM-DD`; `FiscalYearEnd` is a month name.
- Note the key `52WeekHigh` starts with a digit — cannot be a bare TS identifier.

### `ETF_PROFILE` response shape (captured live, QQQ)

Different casing convention from `OVERVIEW`: **snake_case**, still all-string values.

```json
{
  "net_assets": "452800000000",
  "net_expense_ratio": "0.0018",
  "portfolio_turnover": "n/a",
  "dividend_yield": "0.0044",
  "inception_date": "1999-03-10",
  "leveraged": "NO",
  "sectors": [ { "sector": "INFORMATION TECHNOLOGY", "weight": "0.577" } ],
  "holdings": [ { "symbol": "NVDA", "description": "NVIDIA CORP", "weight": "0.0828" } ]
}
```

- `sectors`: 11 objects, keys `sector` / `weight`.
- `holdings`: ~107 objects, keys `symbol` / `description` / `weight`. Some entries
  carry `"n/a"` for `symbol` or `description` (cash, futures, certain foreign lines).
- `leveraged` is a `"YES"`/`"NO"` **string**, not a boolean.

### Missing-value conventions (important for our `null` invariant)

Three distinct sentinels observed / documented:

1. `"n/a"` — seen in `ETF_PROFILE` (`portfolio_turnover`, holding symbols).
2. `"None"` / `"-"` — the classic Alpha Vantage sentinels for unavailable
   `OVERVIEW` fields. The IBM sample happened to be fully populated so neither
   appeared; their use is widely observed but **not documented on the fetched
   pages**. Treat any non-numeric string as `null`.
3. An `"Information"` envelope replaces the whole payload for key/quota problems:
   `{"Information": "The **demo** API key is for demo purposes only. Please claim
   your free API key at https://www.alphavantage.co/support/#api-key ..."}` —
   returned with **HTTP 200**. Rate-limit and error conditions therefore arrive as
   a successful HTTP response with an `Information`/`Note`/`Error Message` key,
   which any validation layer must detect explicitly.

### Mapping to our 12 stock metrics

| Our metric | Availability | Field / derivation |
|---|---|---|
| `peRatio` | Direct | `PERatio` (also `TrailingPE`, `ForwardPE`) |
| `priceToBook` | Direct | `PriceToBookRatio` |
| `revenueGrowth` | Direct (quarterly YoY only) | `QuarterlyRevenueGrowthYOY` |
| `epsGrowth` | Direct (quarterly YoY only) | `QuarterlyEarningsGrowthYOY` |
| `returnOnEquity` | Direct | `ReturnOnEquityTTM` |
| `operatingMargin` | Direct | `OperatingMarginTTM` |
| `freeCashFlowMargin` | Calculable | requires `CASH_FLOW` statement ÷ `RevenueTTM` — extra request |
| `freeCashFlowYield` | Calculable | cash-flow FCF ÷ `MarketCapitalization` — extra request |
| `debtToEquity` | Calculable | requires `BALANCE_SHEET` — extra request; no ratio in `OVERVIEW` |
| `currentRatio` | Calculable | requires `BALANCE_SHEET` — extra request |
| `dividendYield` | Direct | `DividendYield` |
| `shareCountCagr3Y` | Calculable, awkward | `OVERVIEW.SharesOutstanding` is a single point-in-time value; a 3Y history needs the "Shares Outstanding" endpoint or per-year balance sheets — **coverage not determinable from fetched docs** |

Verdict: **6 of 12 direct from one request**, 4 more calculable at the cost of
1–2 additional statement requests per instrument, `shareCountCagr3Y` uncertain.
Against a 25-request/day free key this is roughly **two to three instruments per
day**.

### ETF metadata vs `EtfMetrics`

| Our field | Availability |
|---|---|
| `expenseRatio` | Direct — `net_expense_ratio` |
| `assetsUnderManagement` | Direct — `net_assets` |
| `dividendYield` | Direct — `dividend_yield` |
| `holdingsCount` | Calculable — `holdings.length` |
| `averageVolume` | Absent from `ETF_PROFILE`; needs a quote/series request |
| `exposureSectors` | Direct — `sectors[]` |
| `exposureRegions` | **Absent** — no country/region breakdown |
| `trackingIndex` | **Absent** |
| `issuer` | **Absent** |
| `category` | **Absent** |
| `isLeveraged` | Direct — `leveraged` (`"YES"`/`"NO"`) |
| `isInverse` | **Absent** |
| `leverageFactor` | **Absent** |

`ETF_PROFILE` is the only one of the three providers evaluated that ships an
explicit leveraged flag *and* full holdings in one free call, but it lacks issuer,
tracking index, region exposure, and inverse flag.

### Japan coverage — NEGATIVE / UNRESOLVED

The documentation enumerates exchange-suffix examples for international symbols:
`TSCO.LON` (London), `SHOP.TRT` (Toronto), `GPV.TRV` (TSX Venture), `MBG.DEX`
(XETRA), `RELIANCE.BSE` (India), `600104.SHH` (Shanghai), `000002.SHZ`
(Shenzhen). **No Tokyo/Japan suffix is documented anywhere on the fetched pages.**
`SYMBOL_SEARCH` is offered as the discovery mechanism for the claimed
"100,000+ symbols", but the `demo` key rejects `SYMBOL_SEARCH` and rejected
`OVERVIEW&symbol=7203.TYO`, so the Japanese suffix could not be verified live.

Separately, the docs make **no statement that fundamentals cover non-US
companies**; all `OVERVIEW`-adjacent examples are US. Alpha Vantage's fundamentals
are widely understood to be US-centric, and the international suffix list is
confined to the time-series endpoints.

**Japanese stock coverage: not determinable from fetched docs; documentation
evidence is negative. Japanese ETF coverage: no evidence. Japanese index
coverage: no evidence — `INDEX_DATA`'s documented symbols are `DJI`, `SPX`,
`COMP`, `NDX` (US only, and premium).**

---

## Authentication

`apikey` query parameter on every request. No header option documented. Free keys
are claimed via the support page. Server-side only.

The literal `apikey=demo` works only for a small hard-coded set of examples
(`OVERVIEW&symbol=IBM` worked; `ETF_PROFILE&symbol=QQQ` worked;
`SYMBOL_SEARCH&keywords=toyota` did not).

## Rate limits

Conflicting figures across the two official pages — record both:

- Support page: "free stock API service covering the majority of our datasets for
  **25 API requests per minute**"; also "unlimited API requests for verified
  open-source or educational projects".
- Premium page: "standard API usage limit (**25 API requests per day**)".

The per-day reading is the commonly enforced one. Treat the free tier as
**25 requests/day** for planning and verify against a real key before relying on it.

Premium tiers (monthly): 75 req/min $49.99, 150 $99.99, 300 $149.99, 600 $199.99,
1200 $249.99. Annual plans listed at $499–$2499 (page labels these "/month",
apparently a formatting artefact). Unlimited available on request.

Limit/quota breaches return **HTTP 200** with an `Information` or `Note` key
instead of an error status.

## Required subscription

Documented premium markers:

- `TIME_SERIES_INTRADAY` (all variants), `TIME_SERIES_DAILY_ADJUSTED`,
  `REALTIME_BULK_QUOTES`, `REALTIME_BULK_BID_ASK_PRICES`, **all `INDEX_DATA`**,
  FX Intraday, Crypto Intraday, VWAP, MACD.
- `TIME_SERIES_DAILY`: `outputsize=compact` free, `full` premium.
- `GLOBAL_QUOTE`: EOD free; realtime / 15-min delayed premium via `entitlement`.
- Fundamentals (Company Overview, ETF Profile, statements, Listing Status) carry
  **no premium tag** in the table of contents and `OVERVIEW`/`ETF_PROFILE`
  answered on the demo key — so fundamentals appear to be free-tier, subject to
  the request quota.

Index data being premium-only is a direct problem for our index asset type.

## Fields used

None yet — evaluation only.

## Known limitations

1. **No screener endpoint at all.** All screening would be client-side over a
   pre-fetched universe — incompatible with a 25/day quota.
2. **Japanese market support unverified and probably absent for fundamentals.**
   No documented Tokyo suffix.
3. **Index data is premium-only** and documented only for US indices.
4. Free quota (25/day, or 25/min per the support page) makes even development
   awkward; each stock needs 1–3 requests for our 12 metrics.
5. All values are strings — every numeric field needs parsing plus explicit
   sentinel handling (`"None"`, `"-"`, `"n/a"`).
6. Errors and quota exhaustion return HTTP 200 with a text key; a naive client
   would silently treat this as an empty successful response (explicitly
   forbidden by our error-handling rules).
7. Inconsistent casing between endpoints (`PascalCase` in `OVERVIEW`,
   `snake_case` in `ETF_PROFILE`) and keys beginning with digits (`52WeekHigh`).
8. No pagination; no bulk fundamentals.
9. ETF metadata lacks issuer, tracking index, region exposure, inverse flag.
10. The documentation page is very long and truncates when fetched, so several
    fundamentals sections (exact `function=` names, `LISTING_STATUS` params,
    documented missing-value convention) are **not determinable from fetched
    docs** and were only partly recovered via live probes.

## Licensing or redistribution notes

- "premium is for your personal use. For commercial use, please contact sales."
- Entitled realtime / 15-min-delayed US data, realtime US options, and historical
  index data are described as "for personal use" via the Alpha X Terminal.
- "Realtime and 15-minute delayed US market data is regulated by the stock
  exchanges, FINRA, and the SEC."
- Alpha Vantage describes itself as "a NASDAQ-licensed data provider".
- Using an API key constitutes acceptance of the Terms of Service (not fetched).
- Open-source wrappers are permitted provided they preserve "the content of our
  JSON/CSV responses in both success and error cases".
- **Explicit redistribution rights: not determinable from fetched docs.**

## Related implementation files

none yet — demo mode
