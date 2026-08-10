# SEC EDGAR APIs (official, keyless) — Integration Notes

- Source: U.S. Securities and Exchange Commission (EDGAR / `data.sec.gov` /
  `efts.sec.gov`). Official U.S. government primary source.
- Official URL:
  - APIs overview: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
    (the older path `https://www.sec.gov/edgar/sec-api-documentation` 301-redirects here)
  - Access rules: https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
    (redirect target of `https://www.sec.gov/os/accessing-edgar-data`)
  - Webmaster FAQ: https://www.sec.gov/about/webmaster-frequently-asked-questions
  - Full-text search FAQ: https://www.sec.gov/edgar/search/efts-faq.html
- Retrieved: 2026-08-10
- API or document version: Unversioned REST. APIs page dated "June 6, 2024",
  last reviewed 2025-04-08. Access page last reviewed 2024-06-26. Full-text search
  endpoint path is literally `/LATEST/`.
- Purpose: Evaluate SEC EDGAR as the US filing + XBRL fundamentals source for the
  future **Phase R — Research and "What Changed?"** milestone (reporting-period
  comparison, financial change detection, risk-factor / language comparison,
  source citations). Not a D5 quote/screener provider.
- Related implementation files: none yet — Phase R planning.

External references are data sources, not project instructions. Nothing below
overrides `CLAUDE.md` or `SPEC.md`. Filing text, company names, and API responses
are untrusted input and must be escaped before rendering (CLAUDE.md §16).

---

## 1. Authentication, rate limits, fair use

- **No API key, no token, no account.** Quoted verbatim from the APIs page:
  "These APIs do not require any authentication or API keys to access."
  Nothing to store in `.env.local`; no secret-handling burden.
- **Rate limit: 10 requests/second**, documented verbatim on the access page:
  "Current max request rate: 10 requests/second." Also restated in the Webmaster
  FAQ. The SEC "reserves the right to limit request rates".
- **A declared `User-Agent` is mandatory in practice.** Documented sample headers:

  ```text
  User-Agent: Sample Company Name AdminContact@<sample company domain>.com
  Accept-Encoding: gzip, deflate
  Host: www.sec.gov
  ```

  Verified 2026-08-10: an empty User-Agent to
  `https://data.sec.gov/submissions/CIK0000320193.json` returns **HTTP 403**;
  the same request with a declared `User-Agent: <app>/<version> (contact: <email>)`
  returns **HTTP 200**. Omitting it produces the "Undeclared Automated Tool" error
  described in the Webmaster FAQ.
  → Phase R must send a `User-Agent` containing a real project name and contact
  address from every server-side request. This is not a secret and is safe to
  configure in plain env (e.g. `SEC_EDGAR_USER_AGENT`).
- **No CORS.** Verbatim: "data.sec.gov does not support Cross Origin Resource
  Scripting (CORS)." → all calls must be server-side. This aligns with the
  existing server-only provider boundary; no browser fetching is possible even if
  someone wanted it.
- **Botnets/crawlers prohibited**; "download only what you need". No bulk-loop
  harvesting (CLAUDE.md §9.2 already forbids uncontrolled bulk fetch).
- No documented daily quota, no per-endpoint weighting, no paid tier for these
  APIs. A fee-based real-time dissemination service (PDS) exists but is not needed.

---

## 2. Licensing and redistribution

- EDGAR filings and the derived JSON APIs are **U.S. federal government public
  records**. The access page states: "Anyone can access and download this
  information for free."
- Works of the U.S. government are not subject to domestic copyright, so there is
  **no redistribution restriction comparable to J-Quants** (which forbids
  redistributing viewable data) or the "individual use only" badging on Massive.
- Practical caveats to record rather than ignore:
  - Individual filings may embed third-party copyrighted material (auditor
    reports, licensed market data, images) submitted by the filer; wholesale
    republication of filing *documents* is different from republishing extracted
    XBRL *numbers*.
  - The SEC does not warrant accuracy. The CIK/ticker files explicitly say: "We
    periodically update these files ... but do not guarantee accuracy or scope."
  - Attribution to SEC EDGAR should be shown in the UI as provenance anyway
    (CLAUDE.md §6.6).
- **This is the most permissive source evaluated so far** and the only one with no
  redistribution question mark. Strong argument for making EDGAR the US
  fundamentals source of record for Phase R.

---

## 3. Coverage

| Dimension | Coverage |
|---|---|
| US stocks | Full, all SEC registrants. XBRL financial data from 2009 onward (first SEC XBRL mandate), voluntary XBRL from 2005. |
| Japanese stocks | **Only if SEC-registered.** Toyota (CIK 1094517) files 20-F and is present; the vast majority of TSE-listed companies are not SEC registrants. EDGAR does **not** replace EDINET for the Japanese market. |
| US ETFs | Fund registrants exist (N-CEN/N-PORT/485BPOS), but there is **no expense ratio / AUM / holdings API** in the XBRL company APIs. Not a substitute for an ETF metadata provider. |
| Indices | None. Indices are not registrants. |
| Filing text | Full text of all electronic filings **since 2001** (including exhibits) via full-text search. Header metadata back to 1994/1995. |
| Latency | APIs "updated in real-time as filings are disseminated": submissions typically <1s processing delay, XBRL APIs typically <1 min, "longer during peak filing times". |

Verdict for Phase R: EDGAR is the right source for **US filing ingestion, SEC
filing support, reporting-period comparison, financial change detection, and
citation mapping**. Japanese filing ingestion still requires EDINET.

---

## 4. API families and exact URL patterns

Hostnames: `data.sec.gov` (JSON APIs), `www.sec.gov` (archives, bulk, mapping
files), `efts.sec.gov` (full-text search).

### 4.1 Submissions — filing history by company

```text
https://data.sec.gov/submissions/CIK##########.json
```

`##########` = 10-digit CIK, **zero-padded** (`CIK0000320193.json`).

Verified shape (Apple, 2026-08-10, ~28 KB gzip-decompressed), abridged:

```json
{
  "cik": "0000320193",
  "entityType": "operating",
  "sic": "3571",
  "sicDescription": "Electronic Computers",
  "name": "Apple Inc.",
  "tickers": ["AAPL"],
  "exchanges": ["Nasdaq"],
  "fiscalYearEnd": "0926",
  "category": "Large accelerated filer",
  "formerNames": [],
  "filings": {
    "recent": {
      "accessionNumber": ["0000320193-26-000020", "..."],
      "filingDate": ["2026-07-31", "..."],
      "reportDate": ["2026-06-27", "..."],
      "acceptanceDateTime": ["2026-07-31T10:01:02.000Z", "..."],
      "form": ["10-Q", "..."],
      "items": ["", "..."],
      "core_type": ["XBRL", "..."],
      "isXBRL": [1, "..."],
      "isInlineXBRL": [1, "..."],
      "primaryDocument": ["aapl-20260627.htm", "..."],
      "primaryDocDescription": ["10-Q", "..."]
    },
    "files": [
      {
        "name": "CIK0000320193-submissions-001.json",
        "filingCount": 1238,
        "filingFrom": "1994-01-26",
        "filingTo": "2015-05-30"
      }
    ]
  }
}
```

Notes that matter for implementation:

- `filings.recent` is a **columnar / parallel-array structure**, not an array of
  objects. Index `i` across every column is one filing. A normalizer must zip
  these into domain objects; a length mismatch between columns is a validation
  failure, not something to paper over.
- `recent` is capped (1,000 filings for Apple). Older history lives in the
  paginated `filings.files[]` shards fetched from
  `https://data.sec.gov/submissions/<name>` — e.g.
  `https://data.sec.gov/submissions/CIK0000320193-submissions-001.json`.
  Apple's 1,000 most recent filings only reach back to 2015-05-30, and 587 of
  them are Form 4 insider filings, so **a 10-K history search may need shard
  fetches** — or better, filter server-side by form and stop early.
- `fiscalYearEnd: "0926"` is MMDD and is the authoritative fiscal-calendar hint.
- `reportDate` is the period end; `filingDate` is when it hit EDGAR. For "what
  changed" both are needed: `reportDate` orders periods, `filingDate` orders
  knowledge.
- `items` is populated for 8-K (e.g. `"2.02,9.01"`) — the 8-K item codes, which
  are the cheapest possible change-detection signal (see §5).

### 4.2 XBRL company concept — one tag, full history

```text
https://data.sec.gov/api/xbrl/companyconcept/CIK##########/us-gaap/AccountsPayableCurrent.json
```

Verified shape (Apple / `StockholdersEquity`, 264 facts, ~3 KB), abridged:

```json
{
  "cik": 320193,
  "taxonomy": "us-gaap",
  "tag": "StockholdersEquity",
  "label": "Stockholders' Equity Attributable to Parent",
  "description": "Total of all stockholders' equity (deficit) items, net of ...",
  "entityName": "Apple Inc.",
  "units": {
    "USD": [
      {
        "end": "2026-06-27",
        "val": 107520000000,
        "accn": "0000320193-26-000020",
        "fy": 2026,
        "fp": "Q3",
        "form": "10-Q",
        "filed": "2026-07-31",
        "frame": "CY2026Q2I"
      }
    ]
  }
}
```

- Duration facts (income statement, cash flow) additionally carry `"start"`.
  Instant facts (balance sheet) carry only `"end"`. That distinction is the
  cleanest programmatic way to tell a flow from a stock.
- `units` is keyed by unit of measure: `USD`, `shares`, `USD/shares`, `pure`.
  Verified: `EarningsPerShareDiluted` → `USD/shares`;
  `CommonStockSharesOutstanding` → `shares`.
- An unknown tag returns **HTTP 404** (verified with a fabricated tag). 404 means
  "this company never reported this concept" — that is `null` with an
  `unavailableReason`, never `0` (CLAUDE.md §6.4).
- Cheap and targeted: ~3 KB for one concept's entire history. Preferred over
  companyfacts when only a handful of metrics are needed.

### 4.3 XBRL company facts — every concept for one company

```text
https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
```

```json
{
  "cik": 320193,
  "entityName": "Apple Inc.",
  "facts": {
    "dei":     { "EntityCommonStockSharesOutstanding": { "label": "...", "units": { "shares": [ /* facts */ ] } } },
    "us-gaap": { "Revenues": { "label": "...", "description": "...", "units": { "USD": [ /* facts */ ] } } }
  }
}
```

Verified 2026-08-10: Apple returns 503 `us-gaap` concepts + 2 `dei` concepts in
~272 KB. Fact objects are identical in shape to §4.2. One call gives every metric
input — ideal for Phase R, where a full period comparison needs many concepts at
once. Caching one companyfacts document per company per day is far more
courteous than N companyconcept calls.

### 4.4 XBRL frames — one concept, one period, all companies

```text
https://data.sec.gov/api/xbrl/frames/us-gaap/AccountsPayableCurrent/USD/CY2019Q1I.json
```

Verified (`StockholdersEquity` / `USD` / `CY2024Q4I`): 5,953 data points, ~175 KB.

```json
{
  "taxonomy": "us-gaap",
  "tag": "StockholdersEquity",
  "ccp": "CY2024Q4I",
  "uom": "USD",
  "label": "Stockholders' Equity Attributable to Parent",
  "pts": 5953,
  "data": [
    { "accn": "0001104659-26-033973", "cik": 1750, "entityName": "AAR CORP",
      "loc": "US-IL", "end": "2024-11-30", "val": 1181600000 }
  ]
}
```

- Period format (documented verbatim): `CY####` annual (**duration 365 days ±30**),
  `CY####Q#` quarterly (**duration 91 days ±30**), `CY####Q#I` instantaneous.
- Units with a numerator and denominator use `-per-`, e.g. `USD-per-shares`
  (note: **the frames URL segment uses `USD-per-shares` while a companyfacts
  `units` key for the same concept is `USD/shares`** — do not assume one format).
  Default XBRL unit is `pure`.
- Documented caveat, verbatim: "the frame data is assembled by the dates that best
  align with a calendar quarter or year. Data users should be mindful different
  reporting start and end dates for facts contained in a frame." The AAR CORP row
  above ends `2024-11-30` inside a `CY2024Q4I` frame — proof that a frame mixes
  fiscal calendars. **Frames are for cross-sectional peer comparison, not for
  a single company's period-over-period series.**
- Frames is also the only endpoint that could feed a future *fundamental screener*
  over all US filers without downloading 1.4 GB of bulk data.

### 4.5 Full-text search (`efts.sec.gov`)

Not described on the APIs overview page; it is a separate service behind the UI at
`https://www.sec.gov/edgar/search/`. The JSON endpoint used by that UI, verified
working keyless on 2026-08-10:

```text
https://efts.sec.gov/LATEST/search-index?q=%22supply+chain+disruption%22&forms=10-K&startdt=2025-01-01&enddt=2025-03-31
https://efts.sec.gov/LATEST/search-index?q=%22risk+factors%22&ciks=0000320193&forms=10-K
```

Query parameters observed in use: `q` (quoted phrases, `AND`/`OR`/`NOT`/`NEAR()`
in ALL CAPS, trailing `*` wildcard), `forms`, `ciks`, `dateRange`, `startdt`,
`enddt`, `from` (offset).

Abridged response (Elasticsearch-shaped):

```json
{
  "took": 31,
  "hits": {
    "total": { "value": 252, "relation": "eq" },
    "hits": [
      {
        "_index": "edgar_file",
        "_id": "0000950170-25-027914:ovv-ex19_1.htm",
        "_score": 9.02,
        "_source": {
          "ciks": ["0001792580"],
          "display_names": ["Ovintiv Inc.  (OVV)  (CIK 0001792580)"],
          "form": "10-K",
          "root_forms": ["10-K"],
          "adsh": "0000950170-25-027914",
          "file_date": "2025-02-26",
          "period_ending": "2024-12-31",
          "file_type": "EX-19.1",
          "file_description": "...",
          "sics": ["1311"],
          "items": []
        }
      }
    ]
  }
}
```

- `_id` is `"<accession-with-dashes>:<filename>"` — it identifies the exact
  *document* inside the filing, which is exactly what a citation needs.
- **Coverage starts 2001** (FAQ: "all EDGAR filings submitted electronically since
  2001", including attachments/exhibits). Pre-2001 text is not searchable.
- Stop words (`the`, `is`, `at`, `which`, `on`) are not indexed. Wildcards are not
  supported inside exact phrases or boolean queries.
- **Deep paging is capped**: `from=10000` returns
  `{"errorType":"ResponseError", "errorMessage":"... Result window is too large,
  from + size must be less than or equal to: [10000] ..."}` — an Elasticsearch
  error surfaced with HTTP 200. Two consequences: never assume HTTP 200 means
  success on this host, and never paginate past 10,000 results.
- This endpoint is **undocumented as a public API contract** (it exists to serve
  the UI, and the path says `/LATEST/`). Treat it as unstable: schema-validate
  every response, keep it behind the provider boundary, and expect breakage.
  Prefer submissions + companyfacts for anything that must be reliable.

### 4.6 Bulk data

```text
https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip
https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip
```

Recompiled nightly at ~03:00 ET. Verified via HEAD on 2026-08-10:
`companyfacts.zip` = **1,400,391,677 bytes (~1.4 GB)**, `submissions.zip` =
**1,556,554,492 bytes (~1.56 GB)**, both `content-type: application/zip`.
Documented as "the most efficient means to fetch large amounts of API data".

Relevant only if Phase R ever wants a local fundamentals warehouse. Out of scope
for on-demand per-company research; do not download in CI or tests.

### 4.7 CIK ↔ ticker mapping

```text
https://www.sec.gov/files/company_tickers.json
https://www.sec.gov/files/company_tickers_exchange.json
https://www.sec.gov/files/company_tickers_mf.json
```

Verified 2026-08-10 — both non-fund files contain **10,398 rows** but in two
*different and both awkward* shapes:

```json
// company_tickers.json — object keyed by stringified index
{ "0": { "cik_str": 1045810, "ticker": "NVDA", "title": "NVIDIA CORP" },
  "1": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." } }
```

```json
// company_tickers_exchange.json — fields + positional rows
{ "fields": ["cik", "name", "ticker", "exchange"],
  "data": [[1045810, "NVIDIA CORP", "NVDA", "Nasdaq"]] }
}
```

- `cik_str` is a **number**, so leading zeros are gone; it must be zero-padded to
  10 digits before building any `CIK##########` URL. Off-by-one padding is the
  single most likely integration bug here.
- `company_tickers_exchange.json` rows are positional arrays — validate against
  the `fields` array rather than hardcoding indices.
- SEC disclaims accuracy and scope for these files. One CIK can have multiple
  tickers (share classes); `submissions.tickers` is an array.

---

## 5. Locating documents and exhibits for a filing ("what changed" plumbing)

Given `cik` (unpadded for archive paths) and `accessionNumber`
`0000320193-26-000020`, let `accnNoDashes = 000032019326000020`:

| Target | URL |
|---|---|
| Primary document (from `filings.recent.primaryDocument`) | `https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627.htm` |
| Machine-readable document list | `https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/index.json` |
| Human filing index | `https://www.sec.gov/Archives/edgar/data/<cik>/<accn-with-dashes>-index.html` |
| Complete submission text | `https://www.sec.gov/Archives/edgar/data/<cik>/<accnNoDashes>/<accn-with-dashes>.txt` |
| SGML header only | `.../<accnNoDashes>/<accn-with-dashes>.hdr.sgml` |
| XBRL payload for that filing | `.../<accnNoDashes>/<accn-with-dashes>-xbrl.zip` |

Verified `index.json` shape (Apple 10-Q, 65 items):

```json
{ "directory": {
    "name": "/Archives/edgar/data/320193/000032019326000020",
    "parent-dir": "/Archives/edgar/data/320193",
    "item": [
      { "name": "0000320193-26-000020-index.html", "type": "text.gif", "size": "" },
      { "name": "0000320193-26-000020-xbrl.zip", "type": "compressed.gif", "size": "166630" },
      { "name": "a10-qexhibit31106272026.htm", "type": "text.gif", "size": "10578" }
    ] } }
```

Caveats: `type` is a **GIF icon name**, not a MIME type or an EDGAR document type,
and `size` is a *string* that is sometimes empty. `index.json` gives filenames but
**not** EDGAR exhibit types (EX-10.1, EX-99.1). To get exhibit *types*, parse the
`-index.html` table, the `.hdr.sgml` header, or use the full-text search
`_source.file_type` field, which does carry values like `"EX-19.1"`.

Filing types for change detection:

| Form | Role in "What Changed" |
|---|---|
| **10-K** | Annual. The only filing with a full Item 1A Risk Factors and full segment/accounting-policy notes. Year-over-year risk-factor and MD&A diffing is a 10-K↔10-K operation. |
| **10-Q** | Quarterly. Carries updated financials plus *changes* to risk factors (Part II Item 1A) rather than the full set. Quarter-over-quarter financial diffs come from here. |
| **8-K** | Event-driven. `filings.recent.items` gives the item codes without downloading anything — e.g. `2.02` results of operations (earnings release, with the release itself usually EX-99.1), `5.02` officer departures/appointments, `2.04` accelerated financial obligation, `4.02` non-reliance on previously issued financials. Item codes alone are a strong, cheap, deterministic change signal. |
| 20-F / 40-F / 6-K | Foreign private issuers (e.g. Toyota). Annual is 20-F, not 10-K; 6-K replaces 8-K/10-Q. Any period-comparison UI hardcoded to 10-K/10-Q will silently show nothing for these filers. |
| DEF 14A | Proxy — compensation and capital-allocation context. Not XBRL-tagged financials. |

Sequencing for a "what changed since last quarter" view: submissions → filter
`form` ∈ {10-K, 10-Q, 8-K} → order by `reportDate` → pick current + prior period →
pull companyfacts for the numbers → fetch the two primary documents for text
sections → cite via accession number + document filename.

---

## 6. XBRL concepts vs. our 12 stock metrics

Concept availability confirmed present in Apple's live companyfacts
(2026-08-10) for every tag named below. `dei` provides only
`EntityCommonStockSharesOutstanding` and `EntityPublicFloat`.

| Metric (`lib/domain/metrics.ts`) | Deterministically derivable from XBRL? | Concepts |
|---|---|---|
| `revenueGrowth` | **Yes** | `RevenueFromContractWithCustomerExcludingAssessedTax` (post-ASC 606) or `Revenues`; compare two FY duration facts |
| `epsGrowth` | **Yes** | `EarningsPerShareDiluted` (unit `USD/shares`), two FY facts |
| `returnOnEquity` | **Yes** | `NetIncomeLoss` ÷ `StockholdersEquity` (flow ÷ instant — average opening/closing equity, and document the choice) |
| `operatingMargin` | **Yes** | `OperatingIncomeLoss` ÷ revenue |
| `freeCashFlowMargin` | **Yes** | (`NetCashProvidedByUsedInOperatingActivities` − `PaymentsToAcquirePropertyPlantAndEquipment`) ÷ revenue |
| `debtToEquity` | **Yes**, with a definition choice | `LongTermDebtNoncurrent` + `LongTermDebtCurrent` (interest-bearing debt) ÷ `StockholdersEquity`; or `Liabilities` ÷ `StockholdersEquity` for total-liabilities D/E. **These are different metrics — pick one and label it.** |
| `currentRatio` | **Yes** | `AssetsCurrent` ÷ `LiabilitiesCurrent` |
| `shareCountCagr3Y` | **Yes** | `CommonStockSharesOutstanding` or `WeightedAverageNumberOfDilutedSharesOutstanding` across 4 annual points (weighted-average diluted is the more comparable series) |
| `priceToBook` | **Partly** | Book value per share from `StockholdersEquity` ÷ shares — but **price is not in EDGAR**. Needs a quote provider. |
| `peRatio` | **Partly** | `EarningsPerShareDiluted` from EDGAR; price from a quote provider. |
| `freeCashFlowYield` | **Partly** | FCF from EDGAR; market cap needs price × shares. |
| `dividendYield` | **Partly** | `CommonStockDividendsPerShareDeclared` or `PaymentsOfDividendsCommonStock` from EDGAR; price from a quote provider. |

**8 of 12 fully derivable from EDGAR alone; the other 4 are fully derivable the
moment a price is supplied.** EDGAR is the strongest fundamentals source
evaluated so far for US stocks — it has actual statement line items rather than
a provider's opaque precomputed ratios, which also means every ratio can carry
`origin: "calculated"` plus the exact filing accession number it came from
(CLAUDE.md §6.6 provenance, satisfied better than by any commercial provider).

Two invariant reminders: keep percentages as decimals at the point of
calculation, and treat a missing concept (HTTP 404, or a tag the filer simply
never used) as `null` with an `unavailableReason` — never `0`.

---

## 7. Period, frame, and fiscal-year semantics (read before writing any comparison)

1. **`fy` and `fp` describe the filing the fact was reported in, not the fact's
   own period.** Verified in Apple's data: the fact
   `start=2023-10-01, end=2024-09-28, val=391035000000` appears **twice** — once
   with `fy: 2024, fp: "FY"` and again with `fy: 2025, fp: "FY"` (as the prior-year
   comparative inside the FY2025 10-K). Grouping by `fy` to build a time series
   produces duplicates and wrong labels. **Group by `start`/`end` instead, and
   dedupe.**
2. **The same fact recurs across filings.** `StockholdersEquity` at
   `end=2026-03-28` appears from both `0000320193-26-000013` (Q2 10-Q) and
   `0000320193-26-000020` (Q3 10-Q, as comparative). Deterministic rule needed:
   for each `(concept, unit, start, end)` keep the fact with the latest `filed`
   date (that is the most recently restated value), and keep the earlier value if
   the app ever wants to show "this number was revised".
3. **`frame` is present on some facts and absent on others.** Only facts the SEC
   judged to fit a calendar frame carry it. Presence of `frame` is a convenient
   "this is a clean calendar-aligned period" filter; absence is not an error.
4. **Non-calendar fiscal years are the norm, not an edge case.** Apple's
   `fiscalYearEnd` is `0926` and FY2025 runs `2024-09-29 → 2025-09-27` — a 52/53
   week retail-style calendar where period lengths differ year to year. Never
   assume 90/365-day periods; never compare a duration fact to another whose
   length differs materially without saying so.
5. **Quarterly income/cash-flow facts may be cumulative (YTD), not discrete.**
   10-Q filings tag both three-month and nine-month durations for the same
   concept. Q4 is frequently not tagged at all and must be derived as
   FY − 9-month YTD. Discriminate strictly on `end - start` length; do not trust
   `fp` alone.
6. **Frames mix fiscal calendars** (§4.4) — cross-sectional only.

---

## 8. Limitations and risks

- **No prices, no market cap, no ETF metadata, no indices.** EDGAR is
  fundamentals + documents only. It complements, and does not replace, a D5 quote
  provider.
- **Japan coverage is effectively absent.** Only SEC-registered foreign private
  issuers appear. EDINET remains required for the JP market.
- **IFRS filers use a different taxonomy.** Verified with Toyota (CIK 1094517):
  facts are split across `ifrs-full` (221 concepts, e.g. `AdditionalPaidinCapital`,
  `AdjustmentsForDecreaseIncreaseInInventories`) **and** `us-gaap` (483 concepts,
  from historical filings). A us-gaap-only mapper returns partial or
  stale-period data for these companies without failing loudly. Any metric mapper
  must be taxonomy-aware and must report `unavailableReason` when the concept
  exists only in the other taxonomy.
- **Custom (extension) taxonomies are excluded by design.** The APIs only
  aggregate facts using non-custom taxonomies (`us-gaap`, `ifrs-full`, `dei`,
  `srt`) that apply to the whole entity. Company-specific extension tags and
  segment-level facts are absent — segment-change detection needs the filing's
  own XBRL (`-xbrl.zip`), not these APIs.
- **Concept drift over time.** Revenue is the canonical example:
  pre-2018 filings use `Revenues` / `SalesRevenueNet`, post-ASC 606 use
  `RevenueFromContractWithCustomerExcludingAssessedTax`. A long revenue series
  requires an ordered fallback list of tags, and the tag actually used must be
  recorded in `sourceField`. Never silently sum two different concepts.
- **Amended filings.** `10-K/A`, `10-Q/A`, `8-K/A` appear as distinct `form`
  values (Apple's history includes `8-K/A`, `4/A`, `SC 13G/A`). A `form == "10-K"`
  equality filter misses amendments; a `startsWith("10-K")` filter conflates them.
  Restatements also mean the *same period* can hold different values across
  filings — see §7.2. Form `8-K` item `4.02` (non-reliance on previously issued
  financial statements) is a first-class "what changed" event.
- **`filings.recent` truncation** (§4.1) — long histories need shard fetches.
- **Full-text search is an undocumented UI endpoint**, capped at 10,000 results
  deep, 2001+ only, and returns Elasticsearch errors with HTTP 200 (§4.5).
- **No document-diff service.** EDGAR gives documents; section extraction
  (Item 1A, Item 7 MD&A) and diffing are entirely the application's job, and
  HTML/inline-XBRL markup varies substantially between filers and filing agents.
- **Data lag** is small for the APIs (<1s / <1min) but the real lag is
  economic: a 10-K arrives weeks after fiscal year end (Apple FY end 2025-09-27,
  10-K filed 2025-10-31 — 34 days). "Latest fundamentals" always means "latest
  *filed*", and the UI must show `reportDate` and `filed`, not imply currency.
- **Post-acceptance corrections/deletions**: filings can be removed or corrected;
  previously built indexes are not retroactively fixed (full/quarterly indexes are
  rebuilt weekly Saturday mornings). A cached accession number can 404 later.
- **HTTP 403 without a declared `User-Agent`** — verified. Easy to hit from a new
  environment or a fresh deployment that forgets the env var.

---

## 9. Assessment for Phase R

Recommended as the **US filing and fundamentals source for Phase R**, on these
grounds: keyless, no secret to manage, no redistribution restriction, primary
source (so provenance is citable down to the accession number), and it supplies
statement line items rather than opaque vendor ratios — meaning 8 of our 12 stock
metrics become `origin: "calculated"` with a verifiable source, and the remaining
4 need only a price.

Suggested minimum viable Phase R slice, in dependency order:
`company_tickers.json` (CIK resolution, zero-padded) → `submissions` (period
discovery, form filter, 8-K item codes) → `companyfacts` (one cached call per
company, deterministic period-over-period deltas) → filing `index.json` +
primary document (text retrieval and citations). Full-text search and bulk ZIPs
are optional extras, not foundations.

Deliberately deferred: bulk ZIP ingestion, per-filing `-xbrl.zip` parsing for
segment data, IFRS/20-F support, and any LLM step. Per CLAUDE.md §6.2 all deltas,
ratios, and growth rates stay in deterministic TypeScript; Claude's role in
Phase R is comparison, classification, and explanation over facts the backend has
already computed and cited.
