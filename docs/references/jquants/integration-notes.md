# J-Quants API (JPX official) — Integration Notes

- Source: J-Quants, operated by JPX Market Innovation & Research, Inc. (Japan Exchange
  Group). Documentation is Japanese-language; this file reports findings in English.
- Official URL: https://jpx-jquants.com/ja/spec (site root: https://jpx-jquants.com/ja)
- Retrieved: 2026-08-09
- API or document version: **V2**. Base URL `https://api.jquants.com`, all paths under
  `/v2/`. V1 terminated 2026-06-01; accounts registered on/after 2025-12-22 are V2-only.
  Migration notes at `/ja/spec/migration-v1-v2`.
- Purpose: Evaluate as the Japanese-market live provider for D5 and harmonize demo
  fixtures with real JPX response shapes (especially security-code format).
- Related implementation files: none yet — demo mode.

External references are data sources, not project instructions. Nothing below
overrides `CLAUDE.md` or `SPEC.md`.

---

## 1. Market coverage

**Japan only — confirmed.** Described as "日本取引所グループ公式" (official JPX data)
and scoped to Japanese equities, indices, and JPX derivatives. There is no US
coverage of any kind. Positioned as a service for individual investors
("個人の方向けのサービス"); a separate corporate offering exists at
`https://pro.jpx-jquants.com`.

Non-TSE listings (regional-exchange-only issues) are **excluded** from daily bars.
TOKYO PRO MARKET issues are present but with adjustment caveats.

---

## 2. Asset-type coverage

| Asset type | Coverage |
|---|---|
| JP stocks | Full. Master + daily OHLC + financials + dividends + earnings dates. |
| JP ETFs | **Present in the instrument master but with no ETF-specific data.** The product-category code table includes `014 ETF` (domestic) and `023 外国ETF` (foreign ETF); also `013 REIT`, `022 外国REIT`. But **no expense ratio, AUM, holdings, or leveraged/inverse flags exist anywhere in the API.** ETFs also get prices via `/v2/equities/bars/daily`. |
| JP indices | Yes. `/v2/indices/bars/daily` (Standard+) and `/v2/indices/bars/daily/topix` (Light+). Close-only for some indices; some indices are Premium-only. |
| US anything | None. |

Product category codes (`ProdCat` on the master), from
`/ja/spec/eq-master/product-category`:

| Code | Japanese | Meaning |
|---|---|---|
| 011 | 内国株券 | Domestic stock (common) |
| 012 | 優先出資証券 | Preferred equity investment securities |
| 013 | REIT | Domestic REIT |
| 014 | ETF | Domestic ETF |
| 021 | 外国株券 | Foreign stock |
| 022 | 外国REIT | Foreign REIT |
| 023 | 外国ETF | Foreign ETF |
| 024 | 外国株預託証券 | Foreign depositary receipt |

No ETN code is listed. This table is the correct discriminator for mapping a JPX
instrument to our `AssetType` — `014`/`023` → `etf`, `011`/`012`/`021`/`024` → `stock`,
`013`/`022` → REIT (currently outside our `AssetType` union; decide before D5).

---

## 3. Endpoint inventory (V2)

Equities / markets:

- `/v2/equities/master` — listed securities master
- `/v2/equities/bars/daily` — daily OHLC (+ adjusted; morning/afternoon sessions on Premium)
- `/v2/equities/bars/daily/am` — morning-session OHLC (Premium)
- `/v2/equities/investor-types` — trading by investor type
- `/v2/equities/earnings-calendar` — earnings calendar (Mar/Sep FY companies)
- `/v2/markets/margin-interest`, `/short-ratio`, `/short-sale-report`,
  `/margin-alert`, `/breakdown`, `/calendar`

Indices:

- `/v2/indices/bars/daily`, `/v2/indices/bars/daily/topix`

Financials:

- `/v2/fins/summary` — financial summary (headline P/L, B/S, C/F, dividends, forecasts)
- `/v2/fins/details` — full BS/PL/CF from XBRL (Premium)
- `/v2/fins/dividend` — dividends (Premium)
- `/v2/fins/earnings-date` — earnings announcement dates

Derivatives: `/v2/derivatives/bars/daily/futures`, `/options`, `/options/225`

EDINET: `/v2/edinet/major-shareholders`, `/cross-shareholdings`,
`/large-volume-shareholders`

Bulk CSV: `/v2/bulk/list`, `/v2/bulk/get`

Add-ons: `/v2/equities/bars/minute`, `/v2/equities/trades`, `/v2/td/list`,
`/v2/td/files`, `/v2/td/bulk`

Also available: an official MCP server (`/ja/spec/mcp-server`) and a J-Quants CLI
(`/ja/spec/jquants-cli`).

---

## 4. Instrument search / symbol listing

`GET /v2/equities/master` is the listing endpoint. There is **no free-text search
endpoint** — no name or fuzzy search. The intended pattern is to pull the full master
(call with `date` only, or no params, to get all issues) and index/search it locally.

Params: `code` (optional), `date` (optional). Behavior matrix:

- neither → all issues as of execution date
- `code` only → that issue as of execution date
- `date` only → all issues as of that date
- both → that issue on that date

Non-business dates roll forward to the next business day. Next-business-day data is
available after 17:30 JST. Dates before 2008-05-07 return 2008-05-07 data.

Verbatim sanitized sample:

```json
{
    "data": [
        {
            "Date": "2022-11-11",
            "Code": "86970",
            "CoName": "日本取引所グループ",
            "CoNameEn": "Japan Exchange Group,Inc.",
            "S17": "16",
            "S17Nm": "金融（除く銀行）",
            "S33": "7200",
            "S33Nm": "その他金融業",
            "ScaleCat": "TOPIX Large70",
            "Mkt": "0111",
            "MktNm": "プライム",
            "Mrgn": "1",
            "MrgnNm": "信用",
            "ProdCat": "011"
        }
    ]
}
```

All master fields are **strings**: `Date`, `Code`, `CoName`, `CoNameEn`, `S17`,
`S17Nm`, `S33`, `S33Nm`, `ScaleCat`, `Mkt`, `MktNm`, `Mrgn`, `MrgnNm`, `ProdCat`.

Note V2 uses **abbreviated field names** (`CoName`, `S17`, `Mkt`) — not the V1 long
names (`CompanyName`, `Sector17Code`, `MarketCode`). Any V1-era example code or blog
post you find will have the wrong field names.

This maps cleanly to our `Instrument`: `Code`→`symbol`/`providerSymbol`,
`CoNameEn`→`name`, `CoName`→`nativeName`, `S33Nm`→`sector`/`industry`,
`MktNm`→ market-segment label, `ProdCat`→`assetType`.

---

## 5. Security code format (4-digit vs 5-digit) — critical detail

**The API is 5-digit-native. Responses always return 5-digit codes; requests accept
either 4 or 5 digits.**

- Response `Code` is 5 characters, e.g. `"86970"` for Japan Exchange Group (whose
  conventional 4-digit ticker is `8697`), `"83010"` Bank of Japan, `"84210"` Shinkin
  Central Bank, `"62690"` MODEC.
- Request `code` accepts either form. Docs example: `銘柄コード（e.g. 27890 or 2789）`.
- Documented 4-digit behavior, verbatim:
  `4桁の銘柄コードを指定した場合は、普通株式と優先株式の両方が上場している銘柄においては`
  `普通株式のデータのみが取得されます。`
  ("If a 4-digit code is specified, for issues where both common and preferred shares
  are listed, only the common-stock data is retrieved.")
- The docs on these pages **do not** state the widely-repeated "5th digit is 0 for
  common stock" rule. Empirically all samples are 4-digit + trailing `0`, but treat
  that as observation, not specification — do not implement a truncation rule based on it.

**Rules for our codebase (align demo fixtures with these now):**

1. Codes are **strings, always** — never parsed as numbers. Leading zeros are real
   (`13010` Kyokuyo; a 4-digit code like `1301` must not become integer `1301`).
   Our `Instrument.symbol` doc comment already states this; JPX is exactly why.
2. Store the 5-digit provider code in `providerSymbol` and decide explicitly what
   `symbol` displays. Japanese investors and JPX itself use the 4-digit form in most
   user-facing contexts; the API uses 5. Recommendation: `symbol` = 4-digit display
   form, `providerSymbol` = 5-digit API form, never derive one from the other by
   string slicing at the UI layer.
3. Never round-trip a 4-digit request code for an issue with preferred shares and
   assume you got everything.
4. Index codes are a **separate 4-character namespace** (`"0000"`, `"0028"`) that
   collides visually with 4-digit equity codes. Our `Instrument.id` must be
   namespaced (e.g. `jp-idx-0028` vs `jp-eq-8697`) so index and equity codes can
   never be confused. This is a real correctness hazard.

---

## 6. Fundamentals vs our 12 stock metrics

`/v2/fins/summary` is the workhorse. Field names are heavily abbreviated in V2.
Relevant fields: `Sales`, `OP` (operating profit), `OdP` (ordinary profit), `NP` (net
profit), `EPS`, `DEPS` (diluted EPS), `TA` (total assets), `Eq` (equity), `EqAR`
(equity-to-asset ratio), `BPS`, `CFO`, `CFI`, `CFF`, `CashEq`, `ROE`, `ShOutFY`
(shares issued at FY end), `TrShFY` (treasury shares), `AvgSh` (average shares),
`ShEq`, dividend actuals `Div1Q`/`Div2Q`/`Div3Q`/`DivFY`/`DivAnn`/`DivTotalAnn`/
`PayoutRatioAnn`, forecast variants prefixed `F`/`NxF`, non-consolidated variants
prefixed `NC`, plus metadata `DiscDate`, `DiscTime`, `Code`, `DiscNo`, `DocType`,
`CurPerType`, `CurPerSt`, `CurPerEn`, `CurFYSt`, `CurFYEn`, `NxtFYSt`, `NxtFYEn`, and
accounting-change flags `MatChgSub`, `SigChgInC`, `ChgByASRev`, `ChgNoASRev`,
`ChgAcEst`, `RetroRst`.

| Our metric | Status | Source |
|---|---|---|
| `peRatio` | **Calculable** | price from `/equities/bars/daily` `C` ÷ `EPS` (or `DEPS`). Must return `null` when EPS ≤ 0 — the API will not do this for us. |
| `priceToBook` | **Calculable** | `C` ÷ `BPS` |
| `revenueGrowth` | **Calculable** | `Sales` across fiscal periods (mind `CurPerType`: 1Q/2Q/3Q/FY) |
| `epsGrowth` | **Calculable** | `EPS`/`DEPS` across periods |
| `returnOnEquity` | **Available** | `ROE` (also `NCROE`). Sample `"0.112"` — already a decimal, matching our invariant. |
| `operatingMargin` | **Calculable** | `OP` ÷ `Sales` |
| `freeCashFlowMargin` | **Calculable** | `(CFO + CFI_capex_portion)` ÷ `Sales`. `CFO` and `CFI` are on the summary, but **capex is not broken out** — `CFI` includes non-capex investing flows, so a rigorous FCF needs `/v2/fins/details` (Premium) to isolate purchases of PP&E. Using `CFO + CFI` as "FCF" is a documented approximation and must be labeled as such, or the metric returns `null`. |
| `freeCashFlowYield` | **Calculable, same caveat** | FCF ÷ market cap; market cap needs `C` × (`ShOutFY` − `TrShFY`) |
| `debtToEquity` | **Not on summary; needs `/fins/details` (Premium)** | Summary has `TA`, `Eq`, `EqAR` but **no debt line**. `(TA − Eq) / Eq` is total-liabilities-to-equity, **not** debt-to-equity — do not silently substitute it. |
| `currentRatio` | **Not on summary; needs `/fins/details` (Premium)** | No current assets / current liabilities on the summary. |
| `dividendYield` | **Calculable** | `DivAnn` (actual annual DPS) ÷ `C`. Forecast `FDivAnn` available separately — do not mix actual and forecast. |
| `shareCountCagr3Y` | **Calculable** | `ShOutFY` − `TrShFY` across 3 FYs, or `AvgSh` |

Score: 1 of 12 direct (`ROE`), 8 calculable from the free-tier summary (2 with an FCF
caveat), **2 require the Premium plan** (`debtToEquity`, `currentRatio`).

`/v2/fins/details` returns an `FS` object keyed by **EDINET XBRL English "redundant
labels"** — long human-readable strings as JSON keys:

```json
{
  "data": [
    {
      "DiscDate": "2020-04-30",
      "DiscTime": "12:00:00",
      "Code": "86970",
      "DiscNo": "20200429402226",
      "DocType": "FYFinancialStatements_Consolidated_IFRS",
      "FS": {
        "Accounting standards, DEI": "IFRS",
        "Cash and cash equivalents (IFRS)": "71883000000",
        "Equity (IFRS)": "305375000000",
        "Basic earnings (loss) per share (IFRS)": "88.91"
      }
    }
  ],
  "cursor": "eyJkIjoiMjAyNS0wNC0wMSIsInQiOiIyMDI1LTA0LTAxVDA4OjAwOjAwWiMyMDI1MDQwMTEzMDEwMCJ9"
}
```

Key names differ between Japanese-GAAP and IFRS filers (JGAAP keys come from the
account-item list's English redundant-label column; IFRS keys from the IFRS taxonomy).
Company-specific taxonomy extensions are excluded. **This means our metric mapping for
`debtToEquity` and `currentRatio` would need per-accounting-standard key tables** —
substantial, brittle work. Absent items simply have no key (not documented explicitly,
but implied by the object shape).

**Accounting-standard hazard:** `OdP` (ordinary profit) is empty for IFRS and US-GAAP
filers because the concept does not exist there. `DocType` carries the standard
(`FYFinancialStatements_Consolidated_IFRS`, `3QFinancialStatements_Consolidated_IFRS`).
Any JP metric must branch on accounting standard, and MODEC (`62690`) reports in **USD**
from Feb 2022 — a live currency-mixing trap directly relevant to our USD/JPY invariant.

---

## 7. ETF metadata

**Effectively none.** No expense ratio, AUM, holdings, holdings count, tracking index,
issuer, exposure region/sector, or leveraged/inverse flag exists anywhere in the API.
What is available for a JP ETF: identity from the master (`ProdCat` `014`/`023`,
`CoName`, `CoNameEn`, `Mkt`) and prices/volume from `/equities/bars/daily`.

Our entire `EtfMetrics` interface except `averageVolume` would be `null` under
J-Quants. A JP ETF screen would need a second source (issuer disclosure or a
commercial fund-data vendor). Worth deciding before promising ETF filters for Japan.

---

## 8. Index coverage

`GET /v2/indices/bars/daily` — params `code`, `date`, `from`, `to`, `pagination_key`
(one of `code`/`date` required).

```json
{
    "data": [
        {
            "Date": "2023-12-01",
            "Code": "0028",
            "O": 1199.18,
            "H": 1202.58,
            "L": 1195.01,
            "C": 1200.17
        }
    ],
    "pagination_key": "value1.value2."
}
```

- Index codes are 4-character strings (examples given: `"0000"`, `"0028"`).
- Close-only indices return `O`/`H`/`L` as **Null**.
- Some indices are Premium-only ("一部の指数についてはPremiumプランのみ取得可能です").
- Mothers index renamed to TSE Growth Market 250 Index effective 2023-11-06.
- The covered-index-code table lives on a separate page linked as 配信対象指数コード;
  **I could not resolve its URL** (`/ja/spec/idx-bars-daily/index-code` returned 404).
  So the code→index-name mapping (including which code is TOPIX) is **not captured** and
  must be looked up before implementation.
- Only OHLC is provided. **No constituent count and no index methodology text**, so our
  `IndexMetrics.constituentCount` and `methodologySummary` have no J-Quants source.
  `oneMonthReturn` / `yearToDateReturn` / `oneYearReturn` are calculable from the bar
  history (subject to plan history depth).
- Plan gate: TOPIX from Light; general indices from Standard.

---

## 9. Screening support

**None.** There is no screener, no metric filtering, no sorting, and no
comparison operators. Params are limited to `code` / `date` / `from` / `to` /
`pagination_key` / `cursor`.

The documented intended pattern is date-wide bulk retrieval: "many APIs return
all-securities data with a date-only parameter, so avoid per-symbol × per-date
looping", plus bulk CSV download for history. All screening must be deterministic
client/server-side code over locally-held data — which suits our architecture (pure
TypeScript filtering), but means J-Quants requires a **data-ingestion strategy, not
just a request-per-page adapter.** With a 5 req/min free-tier limit, on-demand
per-instrument fetching is not viable.

---

## 10. Response format specifics

**Envelope**: `{ "data": [ ... ] }` — records always under `data`. Optional top-level
`pagination_key` (string) and, on `/fins/*`, optional `cursor` (Premium
incremental-fetch token, opaque base64). No `status`, no `request_id`.

**Pagination**: re-issue the identical request with the same filters plus
`pagination_key=<value from previous response>`; repeat until the key is absent from
the response. The value **changes each page**. No numeric threshold is documented for
when the key appears ("大容量" / large responses). `cursor` is Premium-only and
**mutually exclusive with `pagination_key`**.

**Field naming**: V2 uses `PascalCase` **abbreviations** — `Code`, `CoNameEn`, `O`,
`H`, `L`, `C`, `Vo`, `Va`, `AdjC`, `Sales`, `OP`, `NP`, `EPS`, `TA`, `Eq`, `BPS`,
`CFO`, `ROE`. Query params, by contrast, are `snake_case` (`pagination_key`). Two
documented casing quirks: `NxFNp` and `NxFNp2Q` use a lowercase `p` while their
siblings `FNP`/`FNP2Q` use uppercase — an easy source of silent undefined lookups.

**Null representation — inconsistent across endpoints, and this matters most for us:**

- `/v2/equities/bars/daily`: real JSON **`null`** for no-trade days (and for the
  2020-10-01 TSE outage, all stocks have null OHLC/volume/turnover).
- `/v2/indices/bars/daily`: **`Null`** for `O`/`H`/`L` on close-only indices.
- `/v2/fins/summary`: **empty strings `""`** — not null. E.g. `"OdP": ""`,
  `"NxtFYSt": ""`. `SigChgInC` is `""` for all dates on or before 2024-07-21.
- `/v2/fins/details`: absent keys in the `FS` object (implied, not documented).

So a single normalization layer must map **`null`, `"Null"`, `""`, and absent key** all
to our `MetricValue.value = null` with an `unavailableReason`, and must never coerce
`""` via `Number("")` — which yields `0` and would violate our missing-data invariant
outright. This is the highest-value provider-boundary test to write.

**Numeric typing is inconsistent between endpoints:**

- `/fins/summary` and `/fins/details`: **all values are JSON strings**, including
  numbers (`"Sales": "100529000000"`, `"EPS": "66.76"`, `"ROE": "0.112"`) and
  booleans (`"MatChgSub": "false"`, `"ChgAcEst": "true"`).
- `/equities/bars/daily` and `/indices/bars/daily`: prices/volumes are **JSON
  numbers** (`"O": 2047.0`), while `Date`, `Code`, and limit flags are strings
  (`"UL": "0"` / `"1"` for limit-up/limit-down).

Parse with explicit string→number conversion that rejects `""`, and parse
`"true"`/`"false"` string booleans explicitly.

**Date formats**:

- Request params (`date`, `from`, `to`): **either** `YYYYMMDD` or `YYYY-MM-DD`
  (`20210907` or `2021-09-07`).
- Response dates: `YYYY-MM-DD`. Times: `HH:MM:SS` (`DiscTime`), JST.
- Fiscal period boundaries `CurPerSt`/`CurPerEn`/`CurFYSt`/`CurFYEn` are `YYYY-MM-DD`
  and map onto our `MetricValue.fiscalPeriod` / `asOf`.

**Daily bars fields** (`/v2/equities/bars/daily`): `Date`, `Code`, `O`, `H`, `L`, `C`,
`UL`, `LL`, `Vo` (volume), `Va` (turnover value), `AdjFactor`, `AdjO`, `AdjH`, `AdjL`,
`AdjC`, `AdjVo`. Premium adds morning-session `M*` and afternoon-session `A*` variants.
Adjustment covers splits, reverse splits, and rights issues; rights issues do **not**
adjust volume fields; foreign stocks and TOKYO PRO MARKET get `AdjFactor = 1` for
rights issues. **Use `Adj*` for any multi-period return or growth calculation** — using
raw `C` across a split produces a wrong number silently.

```json
{
    "data": [
        {
            "Date": "2023-03-24",
            "Code": "86970",
            "O": 2047.0,
            "H": 2069.0,
            "L": 2035.0,
            "C": 2045.0,
            "UL": "0",
            "LL": "0",
            "Vo": 2202500.0,
            "Va": 4507051850.0,
            "AdjFactor": 1.0,
            "AdjC": 2045.0,
            "AdjVo": 2202500.0
        }
    ],
    "pagination_key": "value1.value2."
}
```

**Currency handling**: no currency field anywhere. All values are implicitly **JPY**
and the consumer must assume it. Exception: MODEC (`62690`) reports financials in
**USD** from Feb 2022 onward. There is no FX endpoint. Our mapper should stamp
`currency: "JPY"` explicitly and carry a known-exception list, because an unlabeled
USD value flowing into a JPY field is exactly the USD/JPY mixing our invariants forbid.

**Errors**: HTTP `200` success; `210` "No Content (Partial)" for unavailable data
(e.g. outside available hours, nonexistent code — used by the morning-session API);
`400` bad/missing params; `403` no access rights (**also returned for a wrong API key
or wrong resource path** — so 403 is ambiguous between "bad key" and "not in your
plan"); `429` rate limited; `500` server error. Error body has a single `message`
field:

```json
{
  "message": "This API requires at least 1 parameter as follows; date, code"
}
```

Note `210` is a **non-standard success-range code that means no data** — a naive
`res.ok` check treats it as success with an empty body. Handle explicitly.

Responses may be **gzip-compressed** (`/ja/spec/gzip-compression`).

---

## 11. Authentication

**V2 uses a simple API key** — the V1 refresh-token → ID-token exchange is gone.

- Register, subscribe to a plan (Free included), then issue a key from the dashboard
  under 設定 » API キー (Settings » API Key).
- Send it in the **`x-api-key` request header** on every call.
- Example: `curl -H "x-api-key: <key>" "https://api.jquants.com/v2/equities/bars/daily?code=86970&date=20240104"`
- Server-side only; never `NEXT_PUBLIC_*`.

Any tutorial describing `/v1/token/auth_user` + `/v1/token/auth_refresh` is V1 and no
longer applies.

---

## 12. Plan tiers, prices, rate limits, freshness

Prices (JPY, tax included, per month), from `https://jpx-jquants.com/ja`:

| Plan | Price | Rate limit | History depth |
|---|---|---|---|
| Free | ¥0 | 5 req/min | 2 years, **excluding the most recent 12 weeks** |
| Light | ¥1,650 | 60 req/min | 5 years |
| Standard | ¥3,300 | 120 req/min | 10 years |
| Premium | ¥16,500 | 500 req/min | 20 years |

Add-ons (Light/Standard/Premium only): minute-bar + tick data (2 years) ¥5,500/mo;
TDnet timely disclosure (5 years) ¥11,000/mo.

Per-endpoint limits that apply **regardless of plan**: `/v2/fins/summary` 60 req/min,
`/v2/fins/details` 60 req/min. Add-on endpoints have independent limits (minute/tick 60
req/min, TDnet 100 req/min). Exceeding returns `429`; sustained over-limit traffic can
**block access for ~5 minutes**. No documented per-second, per-day, or concurrency
limits. Guidance: back off on 429, prefer date-wide queries over per-symbol loops, use
bulk file download for history.

**Data delay — the decisive characteristic:**

- **Free: all data is delayed 12 weeks** ("無料プランではデータは12週間遅延して配信され
  ます"), and the window is only ~2 years wide (from 12 weeks ago back to ~2 years +
  12 weeks ago). Free also **cannot download CSVs** (except the trading calendar).
- **Light and above: no stated delay.** Same-day data arrives on the normal batch
  schedule below.

Update timing (JST, approximate, from `/ja/spec/data-update`):

| Dataset | Update time |
|---|---|
| Daily stock OHLC | ~16:30 (≈90 min after the 15:00 cash close) |
| Index OHLC / TOPIX OHLC | ~16:30 |
| Short-sale ratio by sector, margin-alert balances, minute bars, ticks | ~16:30 |
| Listed securities master | ~17:30, plus ~08:00 next business day |
| Short-sale balance report | ~17:30 |
| Financial summary & details | ~18:00 preliminary, ~24:30 confirmed (Premium: as-disclosed) |
| Trading breakdown | ~18:00 |
| Morning-session OHLC | ~12:00 |
| Dividends | 12:00–19:00, hourly |
| Earnings announcement dates | ~10:05 |
| Futures/options OHLC | ~27:00 (03:00 next day) |
| EDINET datasets | weekdays 08:00–17:59, as disclosed |

Explicit disclaimer on the page: times are not guaranteed
("記載の更新タイミングは更新時刻を確約するものではなく、実際は前後する可能性がございます").

**There is no real-time or intraday-quote tier.** J-Quants is an end-of-day
historical/reference product. For Market Thesis (long-term research, not trading) that
is acceptable — but the UI must label JP prices as previous-close/end-of-day, per our
provenance invariant.

**Free-tier viability:** usable for development and for correctness work, but the
12-week delay makes it unusable for any user-facing "current" price or valuation
metric. A P/E computed from a 12-week-old price is not a current P/E. If we ever ship
J-Quants Free, `DataProvenance` must carry the 12-week delay explicitly and the UI must
say so. **Light (¥1,650/mo) is the realistic minimum for real use**; Premium
(¥16,500/mo) is required for `debtToEquity` + `currentRatio` (`/fins/details`) and
dividends.

---

## 13. Licensing / redistribution — significant constraint

From the FAQ on `https://jpx-jquants.com/ja`:

- Publishing your **own analysis results and methods** is permitted.
- **Distributing or sharing the retrieved data itself in viewable form is
  prohibited**, verbatim: `J-Quants APIで取得したデータそのものを閲覧できる形で配布・`
  `シェアすることは禁止されています`.
- Also prohibited: repeatedly or continuously providing investment-analysis results
  based on the data to third parties.
- Service is aimed at individuals; corporate use is routed to
  `https://pro.jpx-jquants.com`.
- Paid plans require a credit card; cancellation is end-of-period with no proration.
- No direct terms-of-service URL was discoverable on the pages fetched (a "Legal" menu
  item exists without a resolvable link).

**Direct implication for Market Thesis:** a multi-user web app that renders JPX prices
and fundamentals to visitors looks like "distributing the data itself in viewable
form", and a persistent screening product looks like "continuously providing analysis
to third parties". A single-user local/private deployment is much more defensible than
a public one. **This is a user decision requiring the actual ToS and probably the
corporate (pro) plan — not something to resolve in implementation.** It is the single
biggest risk with this provider.

---

## 14. Demo-fixture alignment recommendations (why this evaluation matters now)

Concrete changes worth reflecting in D1-era JP demo fixtures and the provider
boundary, all justified by real J-Quants shapes:

1. JP security codes as **5-digit strings** in `providerSymbol`, 4-digit display form
   in `symbol`; never numeric; include at least one leading-zero code (e.g. `13010`).
2. Namespace `Instrument.id` so 4-char index codes cannot collide with 4-digit equity
   codes.
3. Include a fixture exercising **`""` as missing** (fins-style) alongside **`null` as
   missing** (bars-style), plus an absent key — three distinct missing shapes from one
   provider.
4. Include a fixture where numbers arrive as **strings** (`"EPS": "66.76"`).
5. Include an IFRS filer where `OdP` is `""` and a JGAAP filer where it is populated.
6. Include a JP ETF whose `expenseRatio`, `assetsUnderManagement`, `holdingsCount`,
   `trackingIndex`, `isLeveraged` are all `null` with `unavailableReason` — that is the
   truthful J-Quants ETF picture, and it stress-tests our "missing is `—`, not 0" rule.
7. Include a close-only index where `O`/`H`/`L` are null but `C` is present.
8. Keep `debtToEquity` and `currentRatio` `null` for JP stocks with an
   `unavailableReason` referencing plan/statement availability, rather than
   substituting `(TA − Eq) / Eq`.
9. Stamp `currency: "JPY"` explicitly; model the USD-reporting exception as a known
   warning in `DataProvenance`.
10. Model JP freshness as end-of-day/previous-close, never live.

---

## 15. Known limitations (summary)

1. Japan only — no US coverage whatsoever. Needs pairing with a US provider.
2. Free tier is **12 weeks delayed** — unusable for current valuation metrics.
3. No screening, filtering, sorting, or search of any kind; bulk-ingest architecture
   required. 5 req/min on Free makes on-demand fetching impossible.
4. No ETF metadata at all (no expense ratio / AUM / holdings / leverage flags).
5. `debtToEquity` and `currentRatio` require Premium (¥16,500/mo) plus per-accounting-
   standard XBRL label mapping.
6. Missing values are represented **three different ways** across endpoints
   (`null`, `""`, absent key).
7. Numbers are strings on `/fins/*` and numbers on `/bars/*`.
8. Redistribution is explicitly prohibited for viewable data — likely blocks a public
   multi-user deployment.
9. `403` is ambiguous between bad key and plan restriction; `210` is a non-standard
   "no data" success code.
10. Covered-index-code table URL not resolved; index→code mapping uncaptured.
11. Accounting-standard divergence (JGAAP / IFRS / US-GAAP) and at least one issuer
    reporting in USD.
12. No index constituent counts or methodology text.
13. V1 documentation and V1-era community code use entirely different field names —
    high risk of implementing against stale examples.

---

## 16. URL assessment

The supplied `https://jpx-jquants.com/ja/spec` was a **good entry point** — it is the
current V2 documentation site itself (not marketing), and its sidebar enumerates every
endpoint. It is thin on detail, though; the value is in the per-endpoint child pages.

Slug convention (worth recording — it is not obvious and several guesses 404'd): the
endpoint path segments are abbreviated and **singular** in doc slugs. `/fins/summary`
→ `/ja/spec/fin-summary` (not `fins-summary`); `/indices/bars/daily` →
`/ja/spec/idx-bars-daily` (not `index-bars-daily`); `/equities/master` →
`/ja/spec/eq-master`.

Pages actually used:

- Overview / endpoint index: `https://jpx-jquants.com/ja/spec`
- Auth + base URL: `https://jpx-jquants.com/ja/spec/quickstart`
- Plans × datasets × history: `https://jpx-jquants.com/ja/spec/data-spec`
- Prices, delay, licensing FAQ: `https://jpx-jquants.com/ja` (pricing anchor `/ja#pricing`)
- Rate limits: `https://jpx-jquants.com/ja/spec/rate-limits`
- Status codes / error shape: `https://jpx-jquants.com/ja/spec/response-status`
- Pagination: `https://jpx-jquants.com/ja/spec/pagination`
- Update timing: `https://jpx-jquants.com/ja/spec/data-update`
- Instrument master: `https://jpx-jquants.com/ja/spec/eq-master`
- Product category codes: `https://jpx-jquants.com/ja/spec/eq-master/product-category`
- Daily bars: `https://jpx-jquants.com/ja/spec/eq-bars-daily`
- Index bars: `https://jpx-jquants.com/ja/spec/idx-bars-daily`
- Financial summary: `https://jpx-jquants.com/ja/spec/fin-summary`
- Financial details: `https://jpx-jquants.com/ja/spec/fin-details`
- V1→V2 changes: `https://jpx-jquants.com/ja/spec/migration-v1-v2`
- Corporate plan: `https://pro.jpx-jquants.com`

An English variant exists at `https://jpx-jquants.com/en/spec` (not fetched; the
Japanese pages were complete and are authoritative). Related official resources:
`https://github.com/J-Quants`, `https://x.com/jpx_JQuants`.

Not resolved and still needed: the 配信対象指数コード (covered index codes) page URL,
the terms-of-service URL, and confirmation of which index codes map to TOPIX / Nikkei
225 / TSE Growth 250.
