# Finnhub — Provider Evaluation

- **Source:** Finnhub official OpenAPI/Swagger specification and official
  generated client documentation
- **Official URL:** https://finnhub.io/docs/api (assigned page — **body does not
  render for a plain HTTP fetch; it is a client-side JS application, so the fetch
  returns only the `<title>`**). Facts below come from the machine-readable spec
  and Finnhub's own generated SDK docs, which are authoritative equivalents:
  - https://finnhub.io/static/swagger.json (OpenAPI 2.0 spec, `info.version` 1.0.0)
  - https://github.com/Finnhub-Stock-API/finnhub-python — `finnhub/client.py`, `README.md`
  - https://github.com/Finnhub-Stock-API/finnhub-ruby — `docs/*.md` generated models
- **Retrieved:** 2026-08-09
- **API or document version:** `info.version: "1.0.0"`, `title: "Finnhub API"`,
  `license: Apache-2.0` (the *spec* is Apache-licensed; that says nothing about the
  data). Base path `/api/v1`.
- **Purpose:** Evaluate as a candidate live provider for D5 (US + Japan stocks,
  ETFs, indices) and harmonise demo fixture shapes with a realistic provider
  envelope. No code is written against this provider.

---

## Relevant endpoints

Base URL: `https://finnhub.io/api/v1` (the Python client uses
`https://api.finnhub.io/api/v1`).

| Purpose | Path | Params | Tier |
|---|---|---|---|
| Instrument search | `GET /search` | `q` ("symbol, name, isin, or cusip"), `exchange` ("Exchange limit.") | free |
| Exchange symbol list | `GET /stock/symbol` | `exchange` (**required**), `mic`, `securityType` (OpenFIGI), `currency` | free |
| Company profile (full) | `GET /stock/profile` | `symbol`/`isin`/`cusip` | **"Premium Access Required"** |
| Company profile (lite) | `GET /stock/profile2` | `symbol`, `isin`, `cusip` | free ("the free version of Company Profile") |
| Basic financials | `GET /stock/metric` | `symbol` (req), `metric=all` (req) | free, flagged `highUsage` |
| Financials as reported | `GET /stock/financials-reported` | `symbol`, `freq` | tier not stated in spec |
| Statements | `GET /stock/financials` | `symbol`, `statement` (`bs`/`ic`/`cf`), `freq` | tier not stated |
| Quote | `GET /quote` | `symbol` | free |
| ETF profile | `GET /etf/profile` | `symbol`, `isin` | no premium marker; "This endpoint has global coverage" |
| ETF holdings | `GET /etf/holdings` | `symbol`, `isin`, `skip`, `date` | no premium marker; "global coverage. Widget only shows top 10 holdings" |
| ETF sector exposure | `GET /etf/sector` | `symbol`, `isin` | no premium marker |
| ETF country exposure | `GET /etf/country` | `symbol`, `isin` | no premium marker |
| ETF universe | `GET /etf/list` | — | referenced as "A list of supported ETFs can be found" |
| Index constituents | `GET /index/constituents` | `symbol` (e.g. `^GSPC`) | tier not stated |
| Index historical constituents | `GET /index/historical-constituents` | `symbol` | tier not stated |
| Historical market cap | `GET /stock/historical-market-cap` | — | "Accessible with Fundamental 2 or All in One subscription." |
| Price metrics | `GET /stock/price-metric` | — | **Premium Access Required** |

**No stock screener endpoint exists.** The only `/scan/*` endpoints are technical:
`/scan/pattern`, `/scan/support-resistance`, `/scan/technical-indicator`.
Screening would be entirely our own, over a symbol universe we fetch and cache.

### Response envelope style

Bare JSON — either a top-level object with domain fields or a bare array. Only
`/search` has a light envelope (`{ count, result[] }`); `/stock/metric` has
`{ symbol, metricType, series, metric }`. Fields are **camelCase**. Values are
real JSON numbers/booleans (not strings). Pagination exists only as `skip` on
`/etf/holdings` (documented as also serving historical queries).

### `/quote` (verbatim property names and descriptions)

| Prop | Type | Description |
|---|---|---|
| `o` | Float | "Open price of the day" |
| `h` | Float | "High price of the day" |
| `l` | Float | "Low price of the day" |
| `c` | Float | "Current price" |
| `pc` | Float | "Previous close price" |
| `d` | Float | "Change" |
| `dp` | Float | "Percent change" |
| `t` | (timestamp) | UNIX seconds (Finnhub uses UNIX seconds broadly; websocket trades use ms) |

Note `dp` is a **percent number** (e.g. `1.23` for 1.23%), not a decimal — must be
divided by 100 to satisfy our decimal-percentage invariant. All props are
"optional" in the schema, so absent/zero handling needs care: a missing quote
field must become `null`, not `0`.

### `/stock/profile2` (verbatim property names)

`country`, `currency` ("Currency used in company filings"), `exchange`
("Listed exchange"), `name`, `ticker` ("Company symbol/ticker as used on the
listed exchange"), `ipo` (Date), `marketCapitalization` (Float),
`shareOutstanding` (Float), `logo`, `phone`, `weburl`, `finnhubIndustry`
("Finnhub industry classification"). All optional.

The premium `/stock/profile` adds `gsector`, `ggroup`, `gind`, `gsubind`,
`naics*`, `isin`, `sedol`, `lei`, `cusip`, `employeeTotal`, `description`,
`estimateCurrency`, and notably **`marketCapCurrency`** ("Currency used in market
capitalization") separate from `currency` ("Currency used in company filings and
financials") — a distinction directly relevant to our USD/JPY correctness rule.
`profile2` has only one `currency` field, so for a Japanese listing it is
ambiguous whether `marketCapitalization` is JPY or USD-normalised.
**Not determinable from fetched docs.**

Note `finnhubIndustry` is a proprietary taxonomy, not GICS; `profile2` has **no
sector field at all**, only industry. Our `Instrument.sector` would be empty on
the free profile endpoint.

### `/stock/symbol` (verbatim property names)

`description` ("Symbol description"), `displaySymbol` ("Display symbol name."),
`symbol` ("Unique symbol used to identify this symbol used in `/stock/candle`
endpoint."), `type` ("Security type."), `mic` ("Primary exchange's MIC."),
`figi`, `shareClassFIGI`, `currency` ("Price's currency. **This might be
different from the reporting currency of fundamental data.**"), `symbol2`
("Alternative ticker for exchanges with multiple tickers for 1 stock such as
BSE."), `isin` ("ISIN. This field is only available for EU stocks and selected
Asian markets." — additionally requires entitlement from Finnhub).

The `currency` caveat is a real trap for a US+JP app: price currency and
fundamentals reporting currency can differ per symbol.

**Symbology, verbatim from the spec:** `"Exchange_Ticker.Exchange_Code"`.
Supported `exchange` codes are published in an external Google Sheet linked from
the spec rather than inline.

### `/stock/metric` (Basic Financials)

Envelope: `{ symbol, metricType, series: { annual: {...}, quarterly: {...} }, metric: {...} }`.
The Ruby model `BasicFinancials` types `series` and `metric` as untyped `Object`,
so **the full metric key list is not published in any machine-readable schema.**
The spec's truncated example exposes only:

```json
{
  "symbol": "DEMO",
  "metricType": "all",
  "series": {
    "annual": {
      "currentRatio": [ { "period": "2025-09-30", "v": 1.5 } ],
      "salesPerShare": [ { "period": "2025-09-30", "v": 0.0 } ],
      "netMargin":    [ { "period": "2025-09-30", "v": 0.14 } ]
    }
  },
  "metric": {
    "10DayAverageTradingVolume": 0,
    "52WeekHigh": 0,
    "52WeekLow": 0,
    "52WeekLowDate": "2025-01-01",
    "52WeekPriceReturnDaily": 0,
    "beta": 0
  }
}
```

Two important structural facts:

1. `series.annual.<metric>` is an **array of `{ period, v }`** time series —
   this is the one provider of the three that gives multi-year metric history in a
   single free call, which is exactly what `shareCountCagr3Y` and multi-year
   growth rates need.
2. Keys beginning with digits (`10DayAverageTradingVolume`, `52WeekHigh`) again
   preclude bare TS identifiers.

The endpoint description is: "Get company basic financials such as margin, P/E
ratio, 52-week high/low etc." Metrics conventionally present include
`peBasicExclExtraTTM`, `pbAnnual`, `roeTTM`, `operatingMarginTTM`,
`totalDebt/totalEquityAnnual`, `currentRatioAnnual`, `dividendYieldIndicatedAnnual`,
`netMargin`, `revenueGrowth*`, `epsGrowth*` — **but none of these names are
confirmed by the fetched documentation** and must be verified against a live
response before mapping.

### Mapping to our 12 stock metrics

| Our metric | Availability |
|---|---|
| `peRatio` | Expected in `/stock/metric` `metric` (description says "P/E ratio"); exact key **not determinable from fetched docs** |
| `priceToBook` | Expected; exact key not confirmed |
| `revenueGrowth` | `series.annual` history makes this calculable even if no direct key |
| `epsGrowth` | Same — calculable from series |
| `returnOnEquity` | Description says "margin, P/E ratio…"; ROE presence expected but not confirmed |
| `operatingMargin` | `netMargin` confirmed present in series; operating margin expected but not confirmed |
| `freeCashFlowMargin` | Calculable via `/stock/financials` (`cf`) — extra request |
| `freeCashFlowYield` | Calculable via `/stock/financials` + `marketCapitalization` |
| `debtToEquity` | Expected in metric set; else calculable from `/stock/financials` (`bs`) |
| `currentRatio` | **Confirmed** — `series.annual.currentRatio` |
| `dividendYield` | Expected; exact key not confirmed |
| `shareCountCagr3Y` | `profile2.shareOutstanding` is point-in-time only; the `series.annual` machinery is the likely source, or premium `/stock/historical-*`. Not confirmed |

Verdict: **only `currentRatio` is definitively confirmed** from the fetched
documentation. The endpoint is clearly *intended* to cover most of our 12, and the
annual series structure is the best fit of the three providers for multi-year
metrics, but the field inventory is undocumented in any fetched artefact. A live
`GET /stock/metric?symbol=...&metric=all` call with a real key is the only way to
enumerate it. This is the single largest documentation gap in this evaluation.

### ETF metadata — `ETFProfileData` (verbatim, from the official Ruby model doc)

| Property | Type | Description |
|---|---|---|
| `name` | String | "Name" |
| `assetClass` | String | "Asset Class." |
| `investmentSegment` | String | "Investment Segment." |
| `aum` | Float | "AUM." |
| `nav` | Float | "NAV." |
| `navCurrency` | String | "NAV currency." |
| `expenseRatio` | Float | "Expense ratio." (for non-US funds this is the KID ongoing charges figure, per ESMA methodology) |
| `trackingIndex` | String | "Tracking Index." |
| `etfCompany` | String | "ETF issuer." |
| `domicile` | String | "ETF domicile." |
| `inceptionDate` | Date | "Inception date." |
| `website`, `logo` | String | |
| `isin`, `cusip` | String | |
| `priceToEarnings` | Float | "P/E." |
| `priceToBook` | Float | "P/B." |
| `avgVolume` | Float | "30-day average volume." |
| `description` | String | "ETF's description." |
| `isInverse` | Boolean | "Whether the ETF is inverse" |
| `isLeveraged` | Boolean | "Whether the ETF is leveraged" |
| `leverageFactor` | Float | "Leverage factor." |

(Property names shown in the Ruby doc are snake_case; the wire format is
camelCase as listed above.) All properties are optional.

**This is the best ETF metadata fit of the three providers** — it is the only one
with `isInverse`, `isLeveraged`, and `leverageFactor` as real booleans/number,
plus `trackingIndex`, `etfCompany` (issuer), `navCurrency`, and `avgVolume`.
It maps almost 1:1 onto our `EtfMetrics`, including the leveraged/inverse triple
that we deliberately typed as `boolean | null`.

Gaps vs `EtfMetrics`: no `dividendYield` and no `holdingsCount` on the profile
(holdings count requires `/etf/holdings`); `exposureRegions` / `exposureSectors`
require the separate `/etf/country` and `/etf/sector` calls. Note the profile also
carries the ETF's **portfolio** `priceToEarnings` / `priceToBook`, which is exactly
the "portfolio P/E" concept our asset-semantics invariant permits for ETFs.

Also relevant: `assetClass` / `investmentSegment` / `domicile` are separate
fields, which supports our "listing market is not investment exposure" rule.

### Index constituents — `IndicesConstituents` (verbatim)

- `symbol` (String) — "Index's symbol."
- `constituents` (Array<String>) — "Array of constituents."
- `constituentsBreakdown` (Array<IndicesConstituentsBreakdown>) — "Array of
  constituents' details."

Index symbol format uses a caret prefix: `^GSPC` (from the official client
example). Which indices are covered is **not determinable from fetched docs** —
the endpoint description was truncated in every fetch of the spec, and the only
example is `^GSPC` (S&P 500). No Nikkei 225 / TOPIX example appears anywhere.

`IndexMetrics.constituentCount` is derivable from `constituents.length`. There is
**no index level/quote or index return endpoint** documented for indices — our
`oneMonthReturn` / `yearToDateReturn` / `oneYearReturn` have no obvious source
(`/quote` with `^GSPC` is undocumented). This is a significant gap for our index
asset type.

### Japan coverage — UNRESOLVED, weak evidence

- Symbology is `"Exchange_Ticker.Exchange_Code"`, so a Japanese symbol would look
  like `7203.T` or similar, but **no Japanese example appears in any fetched
  artefact.** The only non-US equity example in the entire official client README
  is `'RY.TO'` (Toronto), used for `international_filings`.
- The list of supported exchange codes lives in an **external Google Sheet**
  linked from the spec. Fetching it followed a cross-host redirect that then
  returned HTTP 400, so the Japan row could not be read.
  **Tokyo exchange code: not determinable from fetched docs.**
- `/stock/symbol` documents an `isin` field "only available for EU stocks and
  **selected Asian markets**" — indirect evidence of some Asian equity coverage.
- ETF profile/holdings are explicitly stated to have "global coverage", which is
  the strongest positive coverage statement of any provider evaluated, and the
  `expenseRatio` description explicitly handles non-US (KID/ESMA) funds — strong
  circumstantial evidence that **non-US, and plausibly Japanese, ETFs are
  covered**.
- Whether *Japanese fundamentals* (`/stock/metric`) are populated on the free tier
  is **not determinable from fetched docs**. Finnhub's pricing page also does not
  render for a plain fetch, so the widely-reported "free tier is US-only for
  fundamentals" gate could not be confirmed or refuted from official sources.
  **This must be verified before selecting Finnhub.**

---

## Authentication

Two documented mechanisms:

- `token=<apiKey>` query parameter (`securityDefinitions.api_key`: type `apiKey`,
  name `token`, in `query`). This is what the official Python client uses
  (`session.params["token"] = api_key`).
- `X-Finnhub-Token: <apiKey>` request header.

Prefer the header for our server-side integration so the key never appears in
URLs or logs.

## Rate limits

- Spec `extraDocs`: "there is a **30 API calls/second** limit" on top of the
  plan's own limit.
- Exceeding the plan limit returns **HTTP 429** (a real error status, unlike Alpha
  Vantage).
- Free-tier calls/minute and calls/month: **not determinable from fetched docs**
  (the pricing page does not render server-side).
- The official Python client has **no retry or backoff logic** and a
  `DEFAULT_TIMEOUT = 10` seconds — any integration must add its own bounded retry.

## Required subscription

Confirmed premium markers in the spec:

- **"Premium Access Required":** `/stock/profile`, `/stock/executive`,
  `/press-releases`, `/news-sentiment`, `/stock/price-metric`, `/ca/symbol-change`,
  `/ca/isin-change`, `/institutional/profile`, `/institutional/portfolio`,
  websocket News & Press Releases.
- **"Accessible with Fundamental 2 or All in One subscription":**
  `/stock/historical-market-cap`, `/stock/historical-employee-count`.
- **No premium marker (free):** `/search`, `/stock/symbol`, `/stock/profile2`,
  `/stock/metric`, `/quote`, `/stock/market-status`, `/stock/market-holiday`,
  `/stock/peers`, `/news`, `/company-news` (free tier limited to 1 year history).
- `/etf/profile`, `/etf/holdings`, `/etf/sector`, `/etf/country`,
  `/index/constituents`: no premium marker visible, but their spec sections were
  truncated in every fetch, so **their tier is not fully determinable**.
- Plan tier names glimpsed: "Fundamental 2", "All in One", "Enterprise" (the last
  gates raw airline ticket prices and historical economic surprises).
- Prices: **not determinable from fetched docs.**

## Fields used

None yet — evaluation only.

## Known limitations

1. **The assigned URL is unusable for automated extraction.** `finnhub.io/docs/api`
   and `finnhub.io/pricing` are JS-rendered; a plain fetch returns only the
   `<title>`. Use `https://finnhub.io/static/swagger.json` and the generated SDK
   docs instead.
2. **`/stock/metric`'s field inventory is undocumented** in the spec (typed as a
   bare `Object`) and truncated in the example. We cannot map 11 of our 12 stock
   metrics with confidence without a live call.
3. **Japanese exchange code and symbol suffix unknown** — the supported-exchange
   list is an external Google Sheet that could not be fetched.
4. **Whether non-US fundamentals are free-tier is unknown**, and this is the
   decisive question for a US+JP product.
5. **No screener endpoint.**
6. **No index level or index return endpoint** — only constituents. Our
   `IndexMetrics` returns have no documented source.
7. `/stock/profile2` (the free profile) has **no sector field** — only
   `finnhubIndustry`, a proprietary taxonomy. Sector requires premium
   `/stock/profile`.
8. Free `profile2` has a single `currency` field, so JPY vs USD attribution of
   `marketCapitalization` is ambiguous; the premium profile disambiguates via
   `marketCapCurrency`.
9. `/stock/symbol` warns that price currency "might be different from the
   reporting currency of fundamental data" — cross-currency mixing risk.
10. `/quote.dp` is a percent number, not a decimal — conversion required.
11. Every schema property is optional, and numeric fields default to `0` in
    examples; distinguishing "genuinely zero" from "absent" requires checking key
    presence rather than falsiness. Direct threat to our missing-data invariant.
12. Missing-value representation: **not determinable from fetched docs** (no
    explicit null convention is stated). Assume key omission.
13. `/etf/holdings` "Widget only shows top 10 holdings" — API vs widget behaviour
    difference to watch.
14. Mixed timestamp conventions: query dates `YYYY-MM-DD`, news/quote timestamps
    UNIX seconds, websocket UNIX milliseconds, press releases
    `"YYYY-MM-DD HH:MM:SS"` strings.
15. Official client has no retry/backoff; 30 calls/second hard ceiling.

## Licensing or redistribution notes

The OpenAPI *specification* is Apache-2.0 (`info.license`); this covers the schema
document, not the data. `info` contains no `termsOfService` URL. No data
redistribution, display, or attribution terms were found in any fetched artefact.
**Data licensing and redistribution terms: not determinable from fetched docs** —
must be read from Finnhub's Terms of Service before selection.

## Related implementation files

none yet — demo mode
