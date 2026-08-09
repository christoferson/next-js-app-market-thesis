# EODHD (EOD Historical Data) — Provider Evaluation

- **Source:** EODHD official financial-APIs documentation site
- **Official URL:** https://eodhd.com/financial-apis/stock-market-screener-api
  (assigned page). Additional pages fetched:
  - https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds/ (Fundamentals)
  - https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours/ (Exchanges / symbol list)
  - https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds-and-indices (Search)
  - https://eodhd.com/financial-apis/api-for-historical-data-and-volumes/ (EOD)
  - https://eodhd.com/financial-apis/live-realtime-stocks-api (Delayed quote)
- **Retrieved:** 2026-08-09
- **API or document version:** Fundamentals documented at `/api/v1.1/fundamentals/`
  (legacy `/api/fundamentals/` still functional). Other endpoints are unversioned
  `/api/<endpoint>`. No global API version string is published.
- **Purpose:** Evaluate as a candidate live provider for D5 (US + Japan stocks, ETFs,
  indices) and, more immediately, to harmonise demo/mock fixture shapes with a
  realistic provider response envelope. No code is written against this provider.

---

## Relevant endpoints

| Purpose | Endpoint | Notes |
|---|---|---|
| Screener | `GET https://eodhd.com/api/screener` | Server-side screening, 5 API calls/request |
| Fundamentals (stock/ETF/fund/index) | `GET https://eodhd.com/api/v1.1/fundamentals/{TICKER}` | 10 API calls/request |
| Exchange list | `GET https://eodhd.com/api/exchanges-list/` | 1 API call |
| Symbol list per exchange | `GET https://eodhd.com/api/exchange-symbol-list/{EXCHANGE_CODE}` | 1 API call; `type`, `delisted` params |
| Search | `GET https://eodhd.com/api/search/{query}` | 1 API call; `type`, `exchange`, `limit` |
| End-of-day OHLCV | `GET https://eodhd.com/api/eod/{TICKER}` | `from`/`to` `YYYY-MM-DD` |
| Delayed quote | `GET https://eodhd.com/api/real-time/{TICKER}` | 15–20 min delay for stocks |
| Bulk EOD / splits / dividends | `GET https://eodhd.com/api/eod-bulk-last-day/{EXCHANGE}` | 100 API calls per whole-exchange request |

**Ticker format:** `CODE.EXCHANGE` (e.g. `AAPL.US`, `VOD.LSE`, `GSPC.INDX`,
`BMW.XETRA`, `BTC-USD.CC`, `EURUSD.FOREX`). Indices use the virtual exchange
suffix `.INDX`. `US` is a unified code spanning NYSE / NASDAQ / NYSE ARCA / OTC;
`NYSE` and `NASDAQ` also exist as separate codes.

### Screener

- `filters=[["field","op",value],...]`
- Filterable string fields: `code`, `name`, `exchange`, `sector`, `industry`
  (string ops `=`, `match`; multi-word sector/industry values require `match`).
- Filterable numeric fields: `market_capitalization` (input in **USD**),
  `earnings_share` (EPS), `dividend_yield`, `refund_1d_p`, `refund_5d_p`,
  `avgvol_1d`, `avgvol_200d`, `adjusted_close` (numeric ops `=`, `>`, `<`, `>=`, `<=`).
- `signals=` accepts pre-computed server-side signals:
  `200d_new_lo`, `200d_new_hi`, `bookvalue_neg`, `bookvalue_pos`,
  `wallstreet_lo`, `wallstreet_hi`.
- `sort=field.asc|desc` (numeric fields only).
- Pagination: `limit` (default 50, min 1, **max 100**), `offset` (default 0, **max 999**)
  — i.e. a hard ceiling of roughly 1,099 reachable rows per filter set.

### Fundamentals response shape (stocks)

Top-level sections (PascalCase / mixed casing, no envelope wrapper — the object *is*
the response):

`General`, `Highlights`, `Valuation`, `SharesStats`, `Technicals`,
`SplitsDividends`, `Holders`, `InsiderTransactions`, `outstandingShares`,
`Earnings`, `Financials`.

A `filter` query param selects nested sections with `::` separators, e.g.
`filter=Financials::Balance_Sheet::yearly`.

Sanitized excerpt (field names verbatim from docs; values illustrative, not real
market data):

```json
{
  "General": {
    "Code": "DEMO", "Type": "Common Stock", "Exchange": "US",
    "CurrencyCode": "USD", "CurrencyName": "US Dollar", "CurrencySymbol": "$",
    "CountryName": "USA", "CountryISO": "US", "ISIN": null,
    "FiscalYearEnd": "September", "Sector": "Technology",
    "Industry": "Consumer Electronics", "IsDelisted": false, "UpdatedAt": "2026-08-08"
  },
  "Highlights": {
    "MarketCapitalization": 0, "EBITDA": 0, "PERatio": 21.05, "PEGRatio": 2.1,
    "DividendYield": 0.0288, "ReturnOnEquityTTM": 0.345,
    "OperatingMarginTTM": 0.166, "ProfitMargin": 0.14,
    "QuarterlyRevenueGrowthYOY": 0.011, "QuarterlyEarningsGrowthYOY": -0.018,
    "MostRecentQuarter": "2026-06-30"
  },
  "Valuation": {
    "TrailingPE": 21.05, "ForwardPE": 18.2, "PriceSalesTTM": 3.1,
    "PriceBookMRQ": 6.49, "EnterpriseValue": 0, "EnterpriseValueEbitda": 14.2
  },
  "SharesStats": { "SharesOutstanding": 942134000, "SharesFloat": 940000000 },
  "outstandingShares": {
    "annual": { "0": { "date": "2026", "dateFormatted": "2026-06-30",
                       "sharesMln": "942.134", "shares": 942134000 } }
  },
  "Financials": {
    "Cash_Flow": {
      "currency_symbol": "USD",
      "yearly": { "2025-09-30": { "date": "2025-09-30",
                                  "filing_date": "2025-10-30",
                                  "freeCashFlow": "0.00" } }
    }
  }
}
```

Note the **numeric-string** convention inside `Financials.*` blocks
(e.g. `"totalRevenue": "416161000000.00"`), while `Highlights` / `Valuation`
values are JSON numbers. This inconsistency must be normalised at the provider
boundary.

### Mapping to our 12 stock metrics (`lib/domain/metrics.ts`)

| Our metric | EODHD availability | Field / derivation |
|---|---|---|
| `peRatio` | Direct | `Highlights.PERatio` (or `Valuation.TrailingPE`) |
| `priceToBook` | Direct | `Valuation.PriceBookMRQ` |
| `revenueGrowth` | Direct (quarterly YoY only) | `Highlights.QuarterlyRevenueGrowthYOY` — not an annual/multi-year rate; annual CAGR must be computed from `Financials.Income_Statement.yearly` |
| `epsGrowth` | Direct (quarterly YoY only) | `Highlights.QuarterlyEarningsGrowthYOY` |
| `returnOnEquity` | Direct | `Highlights.ReturnOnEquityTTM` |
| `operatingMargin` | Direct | `Highlights.OperatingMarginTTM` |
| `freeCashFlowMargin` | Calculable | `Financials.Cash_Flow.*.freeCashFlow` ÷ `Highlights.RevenueTTM` |
| `freeCashFlowYield` | Calculable | `freeCashFlow` ÷ `Highlights.MarketCapitalization` |
| `debtToEquity` | Calculable | `Financials.Balance_Sheet` (`longTermDebt` / `netDebt` vs `totalStockholderEquity`) — no ready-made ratio field |
| `currentRatio` | Calculable (unconfirmed components) | Balance-sheet current asset/liability line items are implied by "and more" in the docs but not enumerated on the fetched page — **not determinable from fetched docs** |
| `dividendYield` | Direct | `Highlights.DividendYield`, or `SplitsDividends.ForwardAnnualDividendYield` |
| `shareCountCagr3Y` | Calculable | `outstandingShares.annual[]` (`shares` / `sharesMln`) — best 3Y share-count history of the three providers evaluated |

Verdict: **10 of 12 directly available or cleanly calculable**; `currentRatio`
component availability is unverified from the fetched pages.

### ETF fundamentals

Sections: `General`, `Technicals`, `ETF_Data`. Relevant `ETF_Data` fields:

- Cost: `NetExpenseRatio`, `Ongoing_Charge`, `Date_Ongoing_Charge`,
  `Max_Annual_Mgmt_Charge`, `AnnualHoldingsTurnover`
- Size: `TotalAssets`
- Holdings: `Holdings_Count`, `Top_10_Holdings`, `Holdings` (keyed by ticker, each
  with `Code`, `Name`, `Sector`, `Assets_%`)
- Exposure: `Sector_Weights`, `World_Regions`, `Asset_Allocation`
  (`Long_%`, `Short_%`, `Net_Assets_%`), `Market_Capitalisation`, `Fixed_Income`
- Identity/other: `ISIN`, `Company_Name`, `Index_Name`, `Yield`,
  `Dividend_Paying_Frequency`, `Inception_Date`, MorningStar ratings,
  `Performance` (volatility, Sharpe, YTD/1Y/3Y/5Y/10Y returns)

Maps cleanly onto `EtfMetrics.expenseRatio`, `assetsUnderManagement`,
`dividendYield`, `holdingsCount`, `category`/`trackingIndex` (`Index_Name`),
`issuer` (`Company_Name`), `exposureRegions` (`World_Regions`),
`exposureSectors` (`Sector_Weights`).

**Gap:** no `isLeveraged` / `isInverse` / `leverageFactor` field is documented.
`Asset_Allocation.Short_%` is a weak proxy at best. Our
`EtfMetrics.isLeveraged`/`isInverse` would have to stay `null` or be sourced
elsewhere.

### Indices

Query `{INDEX}.INDX` (e.g. `GSPC.INDX`). Sections: `General`, `Components`
(`Code`, `Exchange`, `Name`, `Sector`, `Industry`, `Weight` as a fraction),
`HistoricalTickerComponents` (`Code`, `Name`, `StartDate`, `EndDate`,
`IsActiveNow`, `IsDelisted`). `historical=1&from=&to=` yields point-in-time
`HistoricalComponents`. Docs claim "Index constituents (components) for all major
indices worldwide."

`IndexMetrics.constituentCount` is derivable from `Components`. Our
`oneMonthReturn` / `yearToDateReturn` / `oneYearReturn` are **not** provided as
index fields and would have to be computed from the `/api/eod/{INDEX}.INDX`
series (deterministic, acceptable — must be tagged `origin: "calculated"`).
`methodologySummary` has no provider source.

### Symbol / exchange listing

- `exchanges-list` response fields: `Name`, `Code`, `OperatingMIC`, `Country`,
  `Currency`, `CountryISO2`, `CountryISO3`.
- `exchange-symbol-list/{CODE}` response fields: `Code`, `Name`, `Country`,
  `Exchange`, `Currency`, `Type`, `Isin`. Verbatim excerpt:

  ```json
  { "Code": "CDR", "Name": "CD PROJEKT SA", "Country": "Poland",
    "Exchange": "WAR", "Currency": "PLN", "Type": "Common Stock", "Isin": "..." }
  ```

- `type` filter values: `common_stock`, `preferred_stock`, `stock`, `etf`, `fund`.
  Response `Type` values seen: `Common Stock`, `ETF`, `Fund`. `INDEX` is not
  documented as a `Type` on the exchanges page (indices live under `.INDX`).
- `delisted=1` returns delisted tickers **only**; default returns tickers active
  in the past month.
- Search response fields: `Code`, `Exchange`, `Name`, `Type`, `Country`,
  `Currency`, `ISIN`, `previousClose`, `previousCloseDate`, `isPrimary`.
  `type` param accepts `all`, `stock`, `etf`, `fund`, `bond`, `index`, `crypto`.
  Search covers **active tickers only**; the `demo` token does not work here.

### Japan coverage — UNRESOLVED

**Not determinable from fetched docs.** Every EODHD documentation page fetched
(screener, fundamentals, exchanges/tickers, search, EOD, live, bulk, marketplace,
trading hours) contains **no** Japan/Tokyo exchange code, no `.TSE`/`.T` suffix,
and no numeric Japanese ticker example. Circumstantial evidence only:

- The trading-hours page lists a v2 market-code array containing `"XTKS"`
  (the Tokyo MIC) alongside `ASEX, BMEX, BVMF, LSE, NEO, NILX, ROCO, TO, US,
  XAMS, XASX, XHKG, XKRX, XNSE, XPAR` — but never labels it with name, country,
  currency, or ticker suffix.
- Prose mentions midday halts at "Hong Kong, Tokyo, Shanghai, and others".
- Fundamentals coverage is described as "major US, UK, EU, and Asian exchanges".

Resolving this requires an authenticated call to
`https://eodhd.com/api/exchanges-list/?api_token=...&fmt=json` and then
`exchange-symbol-list/{JP_CODE}` — the public exchange-list page only shows two
example rows (`US`, `LSE`). Unauthenticated attempts returned HTTP 403/404.
Whether Japanese *fundamentals* (as opposed to EOD prices) are populated is
likewise unverified.

---

## Authentication

`api_token` query parameter on every request. Server-side only.
A literal `demo` token works for a fixed allow-list only —
`AAPL.US`, `TSLA.US`, `VTI.US`, `AMZN.US`, `BTC-USD.CC`, `EURUSD.FOREX` — and does
**not** work for the Search API.

## Rate limits

- Quota is expressed in **weighted "API calls"**, not requests: screener = 5,
  fundamentals = 10, exchange/symbol/search/EOD/real-time = 1 per ticker,
  whole-exchange bulk = 100 (+1 per extra symbol).
- Free registered plan: **20 API calls/day** — i.e. two fundamentals requests.
- Daily cap on bulk requests: 100,000.
- A separate "API Limits" page exists (not fetched); per-minute limits are
  **not determinable from fetched docs**.

## Required subscription

- Screener: "All-In-One" and "EOD+Intraday — All World Extended" plans.
- Fundamentals: "All-In-One" or "Fundamentals Data Feed"; bulk fundamentals needs
  the "Extended Fundamentals Plan".
- Exchanges / symbol list / Search: included in Free plan and above.
- Paid plans start at $19.99/month (personal). Commercial/B2B pricing separate.

## Fields used

None yet — evaluation only. Candidate mapping is the table above.

## Known limitations

1. **Japan coverage is unconfirmed** (biggest risk for this project). No documented
   Tokyo exchange code or ticker suffix on any public page.
2. Screener filter set is shallow — no P/E, ROE, margin, debt/equity, or FCF filters.
   Only market cap, EPS, dividend yield, price, volume, short-window returns. Any
   quality/value screening we want must be done client/server-side after fetching
   fundamentals per instrument (10 calls each), which is quota-expensive.
3. Screener `market_capitalization` is USD-normalised, which conflicts with our
   "keep values in native currency" invariant — a JP screener result would need
   explicit currency handling.
4. Screener pagination is capped at `offset` 999.
5. No ETF leveraged/inverse flags.
6. Mixed value typing: numeric strings inside `Financials`, JSON numbers in
   `Highlights`/`Valuation`. Percentages appear already as decimals
   (`"DividendYield": 0.0288`), which matches our invariant.
7. Missing values: docs say fields "may be empty"; examples show explicit JSON
   `null` (e.g. `"Short_%": null`, `"EndDate": null`). No `"NA"` convention
   documented, but empty strings are plausible and must be treated as `null`.
8. Free tier (20 calls/day) is effectively unusable for development; a paid plan
   is required even to build against it.
9. Quotes are 15–20 minutes delayed; some indices and OTC update only next morning.
10. Site disclaimer states pricing is aggregated/VWAP from 100+ sources and is
    "indicative", not exchange-sourced — relevant to our provenance requirements.

## Licensing or redistribution notes

Personal vs commercial licences are separately priced; a "Commercial vs Personal
license use" document and Terms & Conditions exist but were not fetched. No
explicit redistribution grant or prohibition text was captured.
**Redistribution terms: not determinable from fetched docs.**

## Related implementation files

none yet — demo mode
