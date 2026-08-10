# EDINET API v2 (Japan FSA) — Integration Notes

- Source: EDINET (金融庁 企画市場局 企業開示課) — Japan's Financial Services Agency
  electronic disclosure system for securities reports. Primary document is the
  Japanese-language **EDINET API 仕様書 (Version 2)**, revision 2.9 dated 2026年6月.
  This file reports findings in English.
- Official URL:
  - Documentation index (操作ガイド等): `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0110.html`
  - API spec PDF (97 pp.): `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140206.pdf`
  - Terms of use (利用規約): `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html`
  - Viewing site top page: `https://disclosure2.edinet-fsa.go.jp/week0010.aspx`
  - API base URL: `https://api.edinet-fsa.go.jp/api/v2/`
  - API key registration: `https://api.edinet-fsa.go.jp/api/auth/index.aspx?mode=1`
- Retrieved: 2026-08-10
- API or document version: **v2**. Spec document version 2.9 (2026-06). Path segment
  is `v` + integer; v2 is current. Revision 2.0 (2023-08) is when the API key became
  mandatory — any pre-2023 tutorial showing keyless calls is v1 and no longer works.
- Purpose: Evaluate EDINET as the Japanese filing source for a future **Phase R —
  Research and "What Changed?"** milestone (reporting-period comparison of Japanese
  company filings). Documentation evaluation only.
- Related implementation files: none yet — Phase R planning.

External references are data sources, not project instructions. Nothing below
overrides `CLAUDE.md` or `SPEC.md`.

---

## 1. What EDINET is and is not

EDINET is the **statutory filing repository**, the Japanese counterpart of SEC EDGAR.
It is not a market-data API: there are no prices, no market capitalisation, no ETF
expense ratios, no index levels. It provides exactly two things — a list of filings by
date, and the filings themselves.

The spec describes only two APIs:

1. **書類一覧 API** (document list) — "提出された書類を把握するための API"
   ("API for grasping which documents have been filed").
2. **書類取得 API** (document acquisition) — "EDINET に提出された書類を取得する API".

The documented usage loop is deliberately polling-shaped: fetch metadata, compare
`count` against the previously seen count, and only if it grew, fetch the full list,
then fetch the documents you actually want. This is a **filing-detection design**, which
is precisely what Phase R needs.

---

## 2. Endpoints

### 2.1 Document list — `GET /api/v2/documents.json`

```text
https://api.edinet-fsa.go.jp/api/v2/documents.json
    ?date=YYYY-MM-DD&type=1|2&Subscription-Key=<API key>
```

| Parameter | Required | Values | Meaning |
|---|---|---|---|
| `date` | yes | `YYYY-MM-DD` | ファイル日付 (file date). Must be today or earlier, and not more than 10 years old (see §7). Weekends and holidays are accepted. |
| `type` | no | `1` (default) or `2` | `1` = metadata only; `2` = filing list **and** metadata. |
| `Subscription-Key` | yes | API key | Authentication. |

**Critical shape detail: `date` is not a filter, it is the whole query.** There is no
`edinetCode` parameter, no `secCode` parameter, no `docTypeCode` parameter, no date
range, no pagination, and no full-text search. One request returns one calendar day of
**all filings by every filer**. To find one company's annual reports you must walk the
date axis and filter client-side. This is the single biggest architectural consequence
of choosing EDINET (see §9).

The date's list also contains that day's *administrative* events — document-information
corrections and disclosure/non-disclosure changes registered that day — not only new
filings.

Metadata envelope (`type=1`), verbatim structure:

```json
{
  "metadata": {
    "title": "提出された書類を把握するための API",
    "parameter": { "date": "2023-04-03", "type": "2" },
    "resultset": { "count": 2 },
    "processDateTime": "2023-04-03 13:01",
    "status": "200",
    "message": "OK"
  },
  "results": [ /* only when type=2 */ ]
}
```

`processDateTime` changes even when the list content did not, so it cannot be used as
a change detector — `resultset.count` and `seqNumber` are the documented mechanisms.

### 2.2 Document acquisition — `GET /api/v2/documents/{docID}`

```text
https://api.edinet-fsa.go.jp/api/v2/documents/S1234567
    ?type=1|2|3|4|5&Subscription-Key=<API key>
```

| `type` | Content | Format |
|---|---|---|
| `1` | 提出本文書及び監査報告書 — filing body + audit report, **including the XBRL files** | ZIP |
| `2` | PDF (the "PDF 表示" link from the search UI only) | PDF |
| `3` | 代替書面・添付文書 — alternative documents / attachments | ZIP |
| `4` | 英文ファイル — English-language file, if the filer supplied one | ZIP |
| `5` | CSV — the filing's XBRL flattened to CSV/TSV | ZIP |

`type=1` ZIP layout: `PublicDoc/`, `AuditDoc/`, `XBRL/PublicDoc/`, `XBRL/AuditDoc/`,
`EnglishDoc/`. `type=5` ZIP contains `XBRL_TO_CSV/`.

Gotchas the spec calls out explicitly:

- `type=1` **excludes** a foreign company's English report body
  (「外国会社の英文報告本文は除く」).
- PDFs embedded inside attachments are not in `type=2`; they are in `type=3`.
- The `XbrlSearchDlInfo.csv` present in UI downloads is **absent** from API ZIPs; its
  information is instead in the document-list response.
- The header and table-of-contents panes rendered by the EDINET viewer are **not** in
  the API files. Section structure must be recovered from the XBRL/HTML itself.
- Availability is gated per document by `xbrlFlag` / `pdfFlag` / `attachDocFlag` /
  `englishDocFlag` / `csvFlag` from the list response. Check the flag before requesting
  the corresponding `type`, or you get an error.

### 2.3 Supporting static files (no API key needed)

Verified downloadable on 2026-08-10:

| File | URL | Notes |
|---|---|---|
| EDINET code list (JA) | `https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip` | 11,376 filers, Shift_JIS CSV |
| EDINET code list (EN) | `https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelisteng/Edinetcode.zip` | |
| Fund code list (JA) | `https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Fundcode.zip` | 6,369 funds |
| Fund code list (EN) | `https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelisteng/Fundcode.zip` | |
| EDINET code consolidation list | `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140190.csv` | 廃止→継続 code remapping |
| Form code list (別紙1) | `.../download/ESE140327.xlsx` | ordinanceCode × formCode × docType |
| List-output examples (別紙2) | `.../download/ESE140328.xlsx` | edge-case response samples |
| Taxonomy element list | `.../download/ESE140114.xlsx` | form/report elements |
| Account item list (勘定科目リスト) | `.../download/ESE140115.xlsx` | JP GAAP financial-statement elements |
| IFRS taxonomy element list | `.../download/ESE140184.xlsx` | |

These are the reference tables. Fetch them once and cache; do not re-derive them.

---

## 3. Filing metadata fields (`results[]`, type=2)

All 40 documented fields. Every field is a JSON **string** except `seqNumber`
(number) and the `count` in metadata.

| # | Field | Meaning / notes |
|---|---|---|
| 12 | `seqNumber` | Per-date sequence number. Once assigned it never changes; "fetch everything with seqNumber greater than the last one I saw" is the documented incremental-ingest idiom for same-day polling. |
| 13 | `docID` | 書類管理番号, 8 chars, e.g. `S1000001`. Globally unique per document. Amendments get their **own independent** docID. |
| 14 | `edinetCode` | Filer's EDINET code, 6 chars, `E` + 5 digits. **This is the stable company identifier — use it, not secCode.** |
| 15 | `secCode` | Filer's securities code, 5 chars (see §5). |
| 16 | `JCN` | 法人番号, corporate number, 13 digits. |
| 17 | `filerName` | Japanese filer name, ≤128 full-width chars. |
| 18 | `fundCode` | Fund code, `G` + 5 digits, for 特定有価証券 filings. |
| 19 | `ordinanceCode` | 府令コード, 3 digits (§4.1). |
| 20 | `formCode` | 様式コード, 6 chars, e.g. `030000`, `04A000` — **alphanumeric, not numeric**. |
| 21 | `docTypeCode` | 書類種別コード, 3 digits (§4.2). |
| 22 | `periodStart` | Period start. Populated **only** for 有価証券報告書 / 半期報告書 (fiscal year) and 四半期報告書 (quarter). `null` for all other document types — including 臨時報告書. |
| 23 | `periodEnd` | Period end, same rule. |
| 24 | `submitDateTime` | `YYYY-MM-DD hh:mm`, **JST**, minute precision only. |
| 25 | `docDescription` | The human-readable label shown in the EDINET UI, ≤147 chars, e.g. `有価証券届出書（内国投資信託受益証券）`. Japanese. |
| 26 | `issuerEdinetCode` | Issuer, for large-shareholding reports. |
| 27 | `subjectEdinetCode` | Target company, for tender offers. |
| 28 | `subsidiaryEdinetCode` | Subsidiary EDINET codes, **comma-joined string**, up to 10. |
| 29 | `currentReportReason` | 臨報提出事由 — the statutory reason an extraordinary report was filed, ≤1000 chars, comma-joined if multiple. Values look like `第19条第2項第1号` (企業内容等の開示に関する内閣府令) or `第29条第2項第1号` (特定有価証券…府令). **This is the machine-readable "why" of an extraordinary report and is directly valuable for change detection.** |
| 30 | `parentDocID` | Parent document's docID. For a 訂正報告書 this is the docID of the document being amended — **but only "提出操作上設定されている場合のみ" (only when it was set during the filing operation), so it is not guaranteed present.** |
| 31 | `opeDateTime` | Operation timestamp; set for staff corrections, non-disclosure actions, and magnetic-disk/paper filings. |
| 32 | `withdrawalStatus` | `"1"` = this is a withdrawal request; `"2"` = this document was withdrawn; `"0"` = neither. |
| 33 | `docInfoEditStatus` | `"1"` = this record is a staff correction; `"2"` = this document was corrected; `"0"` = neither. |
| 34 | `disclosureStatus` | `"1"` = non-disclosure started; `"2"` = currently non-disclosed; `"3"` = non-disclosure lifted; `"0"` = normal. |
| 35–39 | `xbrlFlag`, `pdfFlag`, `attachDocFlag`, `englishDocFlag`, `csvFlag` | `"1"` / `"0"` availability flags gating `documents/{docID}?type=`. |
| 40 | `legalStatus` | `"1"` = within statutory inspection period; `"2"` = within extension period (still viewable); `"0"` = viewing period expired / withdrawn (**not retrievable**). |

### 3.1 Records mutate and can be emptied — a real correctness hazard

The document list is **not append-only history**. Past-date responses are rewritten by
a nightly job. Three documented transitions blank out a record:

1. **Viewing period expiry** — every field except `seqNumber` and `docID` becomes
   `null`, all flags become `"0"`, `legalStatus` becomes `"0"`.
2. **Withdrawal** — same, except `parentDocID` and `withdrawalStatus` survive; a
   child document is withdrawn along with its parent.
3. **Non-disclosure by bureau staff** — `disclosureStatus` changes.

So a docID we stored last year may today resolve to an all-`null` record and a
document-acquisition call that fails. Any Phase R store must therefore treat
`(docID, our own fetch timestamp)` as the provenance key, keep our own copy of the
filing text we analysed, and be able to render "this filing is no longer retrievable
from EDINET" rather than showing an empty row or a crash. This maps directly onto our
existing provenance invariant (§6.6 of `CLAUDE.md`).

Separately, filer attributes (`secCode`, `JCN`, `filerName`) are frozen at the moment
the list record was created and are **never** back-updated. Current values must come
from the EDINET code list, and retired EDINET codes must be resolved through the
consolidation list (`ESE140190.csv`, columns 集約処理日 / 廃止EDINETコード /
継続EDINETコード).

---

## 4. Code tables

### 4.1 `ordinanceCode` (府令コード) — 7 values

| Code | Ordinance |
|---|---|
| `010` | 企業内容等の開示に関する内閣府令 — corporate disclosure (**this is the one that matters for operating companies**) |
| `015` | 内部統制府令 — internal control |
| `020` | 外国債等の発行者の開示 — foreign bond issuers |
| `030` | 特定有価証券の内容等の開示 — specified securities (funds/trusts) |
| `040` | 公開買付け（発行者以外） — third-party tender offers |
| `050` | 公開買付け（発行者による） — issuer tender offers |
| `060` | 株券等の大量保有の状況の開示 — large shareholdings |

### 4.2 `docTypeCode` (書類種別コード) — full table from the spec

| Code | Document type | Phase R relevance |
|---|---|---|
| 010 | 有価証券通知書 | |
| 020 | 変更通知書（有価証券通知書） | |
| 030 | 有価証券届出書 | |
| 040 | 訂正有価証券届出書 | |
| 050 | 届出の取下げ願い | |
| 060 | 発行登録通知書 | |
| 070 | 変更通知書（発行登録通知書） | |
| 080 | 発行登録書 | |
| 090 | 訂正発行登録書 | |
| 100 | 発行登録追補書類 | |
| 110 | 発行登録取下届出書 | |
| **120** | **有価証券報告書** — annual securities report | **primary** |
| **130** | **訂正有価証券報告書** — amended annual report | **primary** |
| 135 | 確認書 (certification) | |
| 136 | 訂正確認書 | |
| **140** | **四半期報告書** — quarterly report | historical only (see below) |
| **150** | **訂正四半期報告書** | historical only |
| **160** | **半期報告書** — semiannual report | **primary** |
| **170** | **訂正半期報告書** | **primary** |
| **180** | **臨時報告書** — extraordinary report | **primary** |
| **190** | **訂正臨時報告書** | **primary** |
| 200 / 210 | 親会社等状況報告書 / 訂正 | |
| 220 / 230 | 自己株券買付状況報告書 / 訂正 — share buyback status | capital allocation |
| 235 / 236 | 内部統制報告書 / 訂正 | |
| 240–320 | 公開買付届出書, 訂正, 撤回届出書, 公開買付報告書, 意見表明報告書, 対質問回答報告書 and their amendments | M&A events |
| 330 / 340 | 別途買付け禁止の特例申出書 / 訂正 | |
| 350 | 大量保有報告書 | ownership changes |
| 360 | 変更報告書 | |
| 370 | 訂正大量保有報告書 | |
| 380 | 基準日の届出書 | |
| (380 row cont.) | 変更の届出書 | |

**Japan abolished quarterly reports.** The 2026 EDINET taxonomy element list contains
**zero** 四半期報告書 forms — only 半期報告書 (`jpcrp040300-ssr`, `jpcrp050000-ssr`,
`jpcrp050200-ssr`, `jpcrp090300-ssr`, `jpcrp100000-ssr`). Corroborating: the spec's
retention table gives 四半期報告書 3-year inspection + 7-year extension, and notes the
extension applies to filings from 2015-04-01, while 半期報告書 gained its extension for
filings from **2024-04-01**. So docTypeCode `140`/`150` remain in the code tables to
describe **historical** filings and must still be parsed, but a Phase R
period-comparison for a current Japanese company compares **annual (120) vs semiannual
(160)** — not four quarters. This is a genuine product-shape difference from the US and
must not be papered over with a "quarterly" label.

`ordinanceCode` + `formCode` disambiguates further. Selected `010` rows from 別紙1:

| ordinance | formCode | Form | docType |
|---|---|---|---|
| 010 | `030000` | 第三号様式 | 有価証券報告書 |
| 010 | `040000` | 第四号様式 (法24条3項) | 有価証券報告書 |
| 010 | `043000` | 第四号の三様式 | 四半期報告書 |
| 010 | `043A00` | 第四号の三様式 | 半期報告書 |
| 010 | `050000` | 第五号様式 | 半期報告書 |
| 010 | `053000` | 第五号の三様式 | 臨時報告書 |
| 010 | `102000` | 第十号の二様式 | 臨時報告書 |
| 010 | `102100` | 第十号の二様式 | 外国会社臨時報告書 |

Note `043000` (quarterly) vs `043A00` (semiannual) differ by one alphabetic character
in the same form number — another reason `formCode` must be a string.

Also present: formCodes `70x001`/`71x001` under 府令 `010` labelled 「XBRLの修正」 —
XBRL-only corrections. And DEI carries `XBRLAmendmentFlagDEI` ("true if only XBRL is
amended without amending the report face"). A "what changed" engine must distinguish a
substantive amendment from an XBRL-tagging fix, or it will report phantom changes.

---

## 5. Coverage and identifiers

From `Edinetcode.zip` (11,376 rows, as of 2026-08-09), columns: ＥＤＩＮＥＴコード,
提出者種別, 上場区分, 連結の有無, 資本金, 決算日, 提出者名, 提出者名（英字）,
提出者名（ヨミ）, 所在地, 提出者業種, 証券コード, 提出者法人番号.

| Slice | Count |
|---|---|
| Total EDINET codes | 11,376 |
| 上場 (listed) | 3,827 |
| 非上場 (unlisted, still filing) | 1,274 |
| blank 上場区分 (individuals, non-obligated entities, foreign govts) | 6,275 |
| **Rows carrying a 証券コード** | **3,828** |
| 内国法人・組合 (domestic corporations/partnerships) | 4,919 |
| 個人 (individuals — large-shareholding filers) | 3,149 |
| 外国法人・組合 | 183 (+653 non-obligated) |

Plus 6,369 fund codes in `Fundcode.zip` (fund code, securities code, fund name, kana,
特定有価証券区分名, 特定期1/2, EDINET code, issuer name).

So the answer to "who files to EDINET" is: **all listed companies (~3,800 with
securities codes), plus unlisted bond issuers, plus investment funds/trusts, plus
~3,100 individuals who file large-shareholding reports.** The filer universe is roughly
3× the investable universe; EDINET code → is-this-a-company-we-care-about must be
filtered through 上場区分 and the presence of a 証券コード.

### 5.1 secCode format — confirms the J-Quants finding

**All 3,828 securities codes in the official list are exactly 5 characters and all
3,828 end in `0`.** Sample: `13760` (Kaneko Seeds, conventional ticker 1376), `13770`
(Sakata Seed), `13010` (Kyokuyo), `57110`.

This **empirically matches** the J-Quants observation recorded in
`jquants/integration-notes.md` §5 — two independent official Japanese sources agree on
5-digit-with-trailing-zero. Neither source *documents* the rule, so the note there
still stands: treat it as an observation, do not implement a truncation rule. But it
does mean a single `providerSymbol` representation (5-digit string) works across
J-Quants and EDINET, and `edinetCode` gives us a stable join key that survives
securities-code changes. Codes must be strings; `13010` and `1301` are different tokens
and neither is the integer 1301.

The DEI taxonomy documents `SecurityCodeDEI` as "識別番号 … 該当する場合は、記載する"
(recorded *if applicable*) — so it is legitimately absent for unlisted filers, i.e.
`null`, not `""` and not `0`.

### 5.2 English-document availability

`englishDocFlag` is per-document and `documents/{docID}?type=4` returns whatever the
filer voluntarily supplied. **I could not quantify how common English is** — that
requires actually querying date ranges, which requires an API key. Two documented
constraints temper expectations: `type=1` explicitly excludes a foreign company's
English report body, and English filing is voluntary rather than mandated by the
ordinance forms. The taxonomy does carry English standard labels for every element and
`FilerNameInEnglishDEI` / `CompanyNameInEnglishCoverPage`, so **numeric** data can be
labelled in English regardless. **Narrative** text — risk factors, MD&A, management
policy — should be assumed Japanese-only unless `englishDocFlag` says otherwise.
Quantifying English coverage is an explicit open item for the start of Phase R.

---

## 6. XBRL: taxonomy shape and the CSV escape hatch

### 6.1 Element names are ASCII English, not Japanese — correcting a common belief

This is worth stating plainly because the opposite is widely assumed. In the official
element lists, the `要素名` (element name) column is **CamelCase ASCII English**, and
`名前空間プレフィックス` is an ASCII prefix. Japanese appears in the *label* columns.
Verbatim rows:

```text
jppfs_cor | CashAndDeposits              | 現金及び預金
jppfs_cor | NotesAndAccountsReceivableTradeAndContractAssets
jpcrp_cor | BusinessRisksTextBlock       | 事業等のリスク [テキストブロック]
jpigp_cor | TradeAndOtherReceivablesCAIFRS | 営業債権及びその他の債権、流動資産（IFRS）
jpdei_cor | AccountingStandardsDEI       | 会計基準
```

So EDINET XBRL is **queryable without reading Japanese**. Namespace prefixes:

| Prefix | Domain |
|---|---|
| `jpdei_cor` | Document & entity information (34 elements) |
| `jpcrp_cor` | 企業内容等の開示府令 forms — cover page + narrative sections |
| `jppfs_cor` | JP GAAP financial statements (account items) |
| `jpigp_cor` | IFRS financial statements |
| `jpsps_cor` | 特定有価証券 (funds) forms |
| `jplvh_cor` | Large-shareholding reports |
| `jpctl_cor` | Internal control reports |
| `jptoi_cor` | Tender offers |

Scale, counted from the 2026 element lists: `ESE140115` (JP GAAP account items) covers
24 industry sheets — 一般商工業 `cai`, 建設業 `cns`, 銀行・信託業 `bk1`/`bk2`,
生命保険業 `in1`, 損害保険業 `in2`, 鉄道 `rwy`, 海運 `wat`, 電気事業, ガス事業,
投資信託受益証券, etc. `ESE140114` spans 68 sheets (one per statutory form).
`ESE140184` covers IFRS. Each element row carries 標準ラベル and 冗長ラベル in **both**
Japanese and English, plus `type`, `substitutionGroup`, `periodType`, `balance`,
`abstract`, `depth`, and a legal reference.

### 6.2 Narrative sections are first-class tagged elements — the key Phase R enabler

The annual-report taxonomy tags each narrative section as a single
`nonnum:textBlockItemType` element:

| Element | Section |
|---|---|
| `jpcrp_cor:BusinessRisksTextBlock` | 事業等のリスク — risk factors |
| `jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlows…TextBlock` | 経営者による財政状態、経営成績及びキャッシュ・フローの状況の分析 (MD&A) |
| `jpcrp_cor:BusinessPolicyBusinessEnvironmentIssuesToAddressEtcTextBlock` | 経営方針、経営環境及び対処すべき課題等 |
| `jpcrp_cor:ResearchAndDevelopmentActivitiesTextBlock` | 研究開発活動 |
| `jpcrp_cor:DividendPolicyTextBlock` | 配当政策 |
| `jpcrp_cor:InformationAboutEmployeesTextBlock` | 従業員の状況 |
| `jpcrp_cor:…GoingConcernRisksBusinessRisksTextBlock` | 重要事象等の内容、分析及び対応策 |

**This is materially better than US 10-K section extraction.** Item 1A vs Item 7
boundaries in a 10-K must be recovered by heuristic text parsing; in EDINET the filer
has already delimited each section with a stable machine-readable element ID. Extracting
"this year's risk factors vs last year's risk factors" is a taxonomy lookup, not a
parsing problem. For the Phase R capabilities "risk-factor changes",
"management-language comparison" and "guidance comparison", EDINET is arguably the
easier of the two jurisdictions.

### 6.3 Period comparison is directly supported by DEI

`jpdei_cor` supplies exactly the period scaffolding a comparison engine needs:
`CurrentFiscalYearStartDateDEI`, `CurrentPeriodEndDateDEI`, `CurrentFiscalYearEndDateDEI`,
`TypeOfCurrentPeriodDEI` (documented values `FY` = 年度, `HY` = 中間期 — note again: no
quarterly value), `PreviousFiscalYearStartDateDEI`, `PreviousFiscalYearEndDateDEI`,
`ComparativePeriodEndDateDEI`, plus `AccountingStandardsDEI` (`IFRS` / `US GAAP` /
Japanese), `WhetherConsolidatedFinancialStatementsArePreparedDEI`, `NumberOfSubmissionDEI`
(1 = original, 2 = first amendment, …), `AmendmentFlagDEI`,
`IdentificationOfDocumentSubjectToAmendmentDEI`, `ReportAmendmentFlagDEI`,
`XBRLAmendmentFlagDEI`.

`IdentificationOfDocumentSubjectToAmendmentDEI` inside the XBRL is a **more reliable**
amendment link than the list-level `parentDocID`, which the spec admits is only set
when the filer set it during submission.

`AccountingStandardsDEI` also resolves the JP GAAP/IFRS branch declaratively — the
filing tells us which of `jppfs_cor` or `jpigp_cor` to read, so we do not have to guess.
The same accounting-standard divergence flagged in `jquants/integration-notes.md` §6
(ordinary profit not existing under IFRS) applies here, but here it is self-describing.

### 6.4 The CSV alternative (`type=5`) — and its two traps

`type=5` returns EDINET's own server-side XBRL→CSV conversion, one row per fact, with
9 columns:

| Column | Meaning |
|---|---|
| 要素ID | element ID (namespace-qualified) |
| 項目名 | item name (label) |
| コンテキストID | context ID |
| 相対年度 | relative fiscal year, **relative to the filing's submission date** |
| 連結・個別 | consolidated / non-consolidated |
| 期間・時点 | duration / instant |
| ユニットID | unit ID |
| 単位 | unit (currency) |
| 値 | the instance value |

**Trap 1 — it is not CSV.** Per the viewing guide: extension is `.csv`, delimiter is
**TAB**, encoding is **UTF-16LE**, line ending is CRLF, every field is wrapped in `"`
with `""` escaping. It is TSV called CSV "for convenience"
(「便宜上 CSV としています」). A naive `csv.parse(utf8Text)` will produce garbage.

**Trap 2 — `-` means zero, and blank means unlabelled.** Documented verbatim:
「「値」が「-」の場合、明示的に値が「0」であることを示します」 — a `-` in the value
column means an **explicit zero**, not missing. A blank in a label column means no
Japanese name is defined for that ID (typically a filer-specific extension element),
and if 単位 and ユニットID are *both* `-`, no unit was set for that item.

This inverts our display convention and is a direct collision with the missing-data
invariant in `CLAUDE.md` §6.4, where we render missing as `—`. **We must map EDINET
`-` → `0`, and absence-of-row → `null`, and never let EDINET's `-` reach the UI as our
`—`.** This is the single highest-value normalisation test to write when Phase R starts.

One more: 連結・個別 is only meaningful for `jppfs`-prefixed elements; everything else
is emitted as 「その他」. And instance values are truncated at 30,000 characters, which
matters precisely for the narrative text blocks we most want — long risk-factor sections
will be cut off in the CSV. **Narrative diffing should use `type=1` XBRL, not `type=5`
CSV.** The CSV is for numbers.

### 6.5 Is EDINET XBRL harder than us-gaap? Honest comparison

Harder:

- **Industry-partitioned account taxonomy.** us-gaap is one flat namespace; EDINET
  splits JP GAAP account items across 24 industry-specific tables. A metric mapping
  needs per-industry element tables, or at minimum must handle a bank and a
  manufacturer having different element names for analogous lines.
- **Two parallel financial namespaces** (`jppfs_cor` for JP GAAP, `jpigp_cor` for
  IFRS) with different element names for the same concept
  (`CashAndDeposits` vs `CashAndCashEquivalentsIFRS`), so every mapping is doubled.
  IFRS elements are additionally suffixed `IFRS`/`CAIFRS`.
- **Filer-specific extension elements** exist and surface with blank Japanese labels.
- **Form-code granularity**: 68 form taxonomies vs a handful of US form types.
- Reference documents are Japanese-language PDFs/XLSX, not a machine-readable API.

Easier:

- **Element names are ASCII English** (§6.1) — no Japanese needed to write selectors.
- **Narrative sections are pre-delimited text blocks** (§6.2) — strictly easier than
  10-K item parsing.
- **DEI declares the accounting standard, period type, and amendment lineage** (§6.3),
  so no inference needed.
- **An official flattened tabular rendering exists** (`type=5`); SEC has no per-filing
  equivalent (its `companyfacts` JSON is a different, company-level product).
- **An official English label column exists for every element**, so UI labels come free.

Net: **numeric extraction is meaningfully harder than us-gaap** (industry × accounting
standard matrix), **narrative extraction is meaningfully easier**. Since Phase R is
primarily about narrative and period comparison, the asymmetry is less unfavourable
than the "Japanese XBRL is hard" reputation suggests. The hard part of EDINET is not
the language — it is the retrieval model (§9).

---

## 7. Retention window — 10 years, stated explicitly

The spec is unambiguous: `date` may be any date "当日以前で、直近の財務局営業日の 24 時
において 10 年を経過していない日付" — today or earlier, and not yet 10 years past as of
midnight on the most recent bureau business day. The nightly job **deletes** files whose
file date has passed 10 years (「10 年を経過したファイル日付のファイルは削除されます」).

Per-document-type retention (縦覧期間 statutory + 延長期間 extension = 閲覧期間):

| Ordinance | Document type | Statutory (a) | Extension (b) | Total |
|---|---|---|---|---|
| 企業内容等の開示府令 | 有価証券報告書 | 5 y | 5 y | **10 y** |
| 企業内容等の開示府令 | 半期報告書 | 5 y | 5 y | **10 y** |
| 企業内容等の開示府令 | 四半期報告書 | 3 y | 7 y | **10 y** |

Caveats stated in the spec:

- Extension applies to 半期報告書 filed on/after **2024-04-01**, and to 四半期報告書
  filed on/after **2015-04-01**.
- 特定有価証券 (fund) annual reports get **no extension** — shorter effective window.
- **臨時報告書 has no extension period at all** (it was removed from this table in
  revision 2.1, 2024-03). Extraordinary reports therefore age out faster than annual
  reports — a real gap for long-horizon event history.
- Documents in the extension period may not receive filer corrections the way
  in-statutory-period documents do, so an old filing may be knowingly stale.
- Expiry is deferred to the next business day if the anniversary is a bureau holiday.

Historical availability floors, from the 2023-01-04 system replacement notice
(as-of that date; the rolling 10-year window has since moved past some of these):
有価証券報告書 from 2013-01-04, 四半期報告書 from 2015-04-01, 臨時報告書 from
2021-01-04.

**Phase R consequence: EDINET is a 10-year rolling window, not an archive.** SEC EDGAR
retains filings indefinitely. If Market Thesis wants long-horizon Japanese filing
history, or wants to keep 臨時報告書 event history beyond its short window, **we must
archive what we fetch.** That is a storage-and-licensing decision (§8 permits it) to
make explicitly at the start of Phase R, not a detail to discover later.

---

## 8. Licensing and redistribution — the standout advantage

From the EDINET 利用規約 (revised 令和7年4月25日 / 2025-04-25):

- EDINET content is published under the Japanese government's **公共データ利用規約
  第1.0版 (PDL 1.0)** — an open-data licence. **Reuse and redistribution are broadly
  permitted, including commercial use.** No separate commercial-use prohibition.
- **Attribution is required.** Prescribed form:
  `出典：EDINET閲覧（提出）サイト（当該ページのURL）、PDL1.0`.
- If content is edited or processed, that fact and the processor must be stated, and it
  must not be presented 「あたかも国…が作成した未加工のままであるかのような態様で」
  ("as if it were the State's unaltered original").
- **Excluded** from PDL 1.0: logos/marks/character designs, the **EDINET Taxonomy**
  (separate IP statement), the XBRL report-creation tool, and the Excel
  large-shareholding forms. So the taxonomy files themselves are not open-licensed even
  though the filing data is — relevant if we were to redistribute an element table.
- **Scraping the viewing site is prohibited** (「スクレイピング等」) except via the API,
  or for content the API cannot provide. The API is the sanctioned access path.
- Prohibited: 「短時間における大量のアクセス」 (high-volume access in a short time) and
  anything harming sound operation. FSA may cut off offenders **without notice**.
- The API may be stopped or degraded without prior notice; specs may change; access
  limits may be imposed based on load. FSA disclaims all liability for resulting damage.
- FSA may survey users and publish anonymised use cases.

**This is a decisively better licensing position than J-Quants.** Compare
`jquants/integration-notes.md` §13, where distributing retrieved data in viewable form
is *prohibited* and a public multi-user deployment is questionable. EDINET is
government open data under PDL 1.0: we may display filing content, cache it, archive it
past the 10-year API window, and serve it to users — provided we attribute correctly and
disclose that we processed it. Combined with SEC EDGAR (also public-domain government
data), **filings are the one data category where Market Thesis has a clean redistribution
story in both markets.** Prices and fundamentals remain the constrained category.

Practical requirement: our provenance model must carry the PDL 1.0 attribution string
and the source page URL, and the UI must not imply that our derived analysis is the
FSA's own unmodified output.

---

## 9. Registration, authentication, rate limits

**An API key is mandatory for v2 — confirmed both from the spec and empirically.**

Registration flow (spec ch. 2):

1. Allow pop-ups for `https://api.edinet-fsa.go.jp` (the key-issuance screen is a
   pop-up; the spec devotes a whole section to configuring Edge for this).
2. Create an account at `https://api.edinet-fsa.go.jp/api/auth/index.aspx?mode=1` —
   this redirects to **Azure AD B2C** (`fsaedinetauth.b2clogin.com`, policy
   `B2C_1_APIManagement`). Email + CAPTCHA + email verification code.
3. Set a password: 12–256 chars, ≥3 of {lower, upper, digit, symbol}, no reuse of the
   previous password.
4. **Multi-factor authentication is mandatory** — SMS code or automated voice call to a
   registered phone number. There is no way to skip it.
5. After MFA sign-in, register a contact address on the API-key screen; the key is then
   displayed. Save it — the screen is the only place it appears.
6. Separate flows exist for changing the contact / reissuing the key, deleting the key,
   password reset, and clearing MFA.

**Cost: the spec states no fee, and no pricing, plan, or quota page exists.** Under
PDL 1.0 government open data, free access is the reasonable reading — but note the spec
never says the word "free" either. Treat it as free-with-registration and verify at
signup.

Transport and auth:

- `Subscription-Key` is a **query-string parameter**, not a header. That is unusual and
  a leak risk: it will land in server access logs, proxy logs, and any URL we log.
  **Our HTTP client must redact `Subscription-Key` before any logging**, per
  `CLAUDE.md` §16. Server-side only, never `NEXT_PUBLIC_*`.
- **TLS 1.2 or higher required.**
- **Cross-domain requests are explicitly not allowed** — 「ブラウザ上で動作するスクリプト
  （JavaScript 等）を利用した通信は行えない」. Browser-side fetching is impossible by
  design; all calls must originate from the Next.js server. This suits our architecture
  and, as with SEC EDGAR, removes any temptation to call the API from a client component.
- GET only.

**Rate limits: no number is published.** The spec documents `429 Too Many Requests`
with the description 「大量リクエスト」 and the guidance "wait sufficient time and retry;
review your fetch interval" — but **no requests-per-second or per-day figure appears
anywhere**, and revision 2.8 (2026-05) only *added* the 429 description, implying
enforcement is comparatively recent. The 利用規約 forbids 「短時間における大量のアクセス」
without quantifying it, and reserves the right to impose limits based on load and to cut
users off without notice.

Practical reading: budget conservatively, make the interval configurable, honour 429
with exponential backoff, and never write an unbounded bulk-fetch loop. Compare SEC
EDGAR's published 10 req/s — EDINET gives us no such number, so **the safe assumption is
that EDINET is stricter, not looser.** Cache aggressively; the data is immutable once
filed (subject to §3.1).

### 9.1 Status codes — HTTP 200 lies

**Every error is returned with HTTP status 200.** The real status is inside the JSON
body. Verified empirically on 2026-08-10 with no key:

```json
{"StatusCode": 401,"message": "Access denied due to invalid subscription key.Make sure to provide a valid key for an active subscription."}
```

— returned with `HTTP:200`. (Note the body key is `StatusCode` here, while the spec's
success/error envelope documents a nested `metadata.status` string. Both shapes exist;
a validator must tolerate both.)

| Status | Message | Meaning |
|---|---|---|
| 200 | `OK` | success (document-list API) |
| 400 | `Bad Request` | parameter format / character-encoding problem |
| 401 | `Access denied due to invalid subscription key.…` | missing or wrong key |
| 404 | `Not Found` | resource absent — also raised for wrong parameter values |
| 429 | `Too Many Requests` | rate limited |
| 500 | `Internal Server Error` | server-side; check EDINET/FSA maintenance notices |

Error envelope:

```json
{ "metadata": { "title": "提出された書類を把握するための API", "status": "404", "message": "Not Found" } }
```

For the **document-acquisition** API the spec is explicit that success and error cannot
be distinguished by status or by inspecting the body, because both return 200 with
*some* payload. The documented discriminator is **`Content-Type`**:

| Content-Type | Meaning |
|---|---|
| `application/octet-stream` | ZIP retrieved successfully |
| `application/pdf` | PDF retrieved successfully |
| `application/json; charset=utf-8` | **failure** — body is an error object |

So the provider boundary must branch on `Content-Type`, not on `res.ok`. A naive
`if (res.ok) saveZip(body)` will happily write JSON error text to a `.zip` file. This is
the same class of hazard as J-Quants' non-standard `210` code, and worse — here *all*
errors are 200.

Non-API-path requests (anything not under `/api/v2/`) and maintenance windows return
**HTML error or "Sorry" pages**, not JSON — so the parser must also survive receiving
HTML.

---

## 10. Update timing and data lag

- **Same-day data**: updated from **08:30 JST onward, roughly every minute**. The
  same-day file is replaced even when its content did not change.
- **Past-date data**: rebuilt by a nightly job starting **just after 24:00 JST**. The
  job rewrites *every* file date, not only changed ones, then deletes dates past 10
  years, and finally creates the new same-day file. **The appearance of the current
  day's file is the documented signal that the nightly job finished and the prior day's
  data is final.**
- All timestamps are **JST**; `submitDateTime` and `processDateTime` are minute
  precision (`YYYY-MM-DD hh:mm`).
- Magnetic-disk and paper filings appear on the list for the date of the *filing
  operation*, **not** the nominal filing date — the spec warns explicitly that such a
  document will not appear on its filing date's list.

So filing detection is effectively near-real-time (minute-level during business hours),
and there is **no delay tier** — a striking contrast with J-Quants Free's 12-week lag.
For Phase R, "a new annual report was filed today" is detectable within about a minute.
Combined with `currentReportReason`, so is "an extraordinary report was filed and here
is its statutory reason".

---

## 11. Phase R feasibility assessment

**Verdict: EDINET is a good fit for Phase R, and the blocking work is retrieval
architecture, not comprehension.**

Supports Phase R capabilities well:

- Japanese filing ingestion — yes, sanctioned API, open licence.
- Filing detection — yes, purpose-built (metadata count + `seqNumber`, minute-level).
- Reporting-period comparison — yes; DEI gives period boundaries, type, and comparative
  period declaratively.
- Risk-factor / management-language / MD&A comparison — **yes, and better than the US**,
  because sections are pre-tagged text blocks.
- Financial change detection — yes, via `jppfs_cor`/`jpigp_cor`, at the cost of an
  industry × accounting-standard element mapping.
- Amendment tracking — yes, and richly: docTypeCode 130/170/190, `parentDocID`,
  `NumberOfSubmissionDEI`, `AmendmentFlagDEI`, `XBRLAmendmentFlagDEI`.
- Source citations / evidence retrieval — yes; docID + element ID is a precise,
  stable citation, and PDL 1.0 permits quoting the source.

Requires design decisions before implementation:

1. **Date-axis-only retrieval.** No company query exists. Serving "show me Toyota's
   filings" requires having ingested and indexed the date range ourselves. This is an
   **ingest-and-store product**, not a request-per-page adapter — the same conclusion
   reached for J-Quants (§9 there), for a different reason.
2. **We must archive.** The 10-year rolling window deletes data; 臨時報告書 ages out
   faster still. PDL 1.0 permits archiving, so this is a storage decision, not a legal
   one — but it means Phase R implies persistence, which is currently unauthorised.
3. **Semiannual, not quarterly.** The product's period-comparison vocabulary cannot
   assume four quarters for Japan. "What changed since the previous quarter" is not
   answerable for a current Japanese filer; "since the previous half-year" is.
4. **Records can be emptied.** Provenance must record our own fetch, and the UI needs a
   truthful "no longer available from EDINET" state.
5. **Unquantified rate limits.** Interval must be configurable and conservative.

---

## 12. Known limitations (summary)

1. **No query dimension except date.** No company, code, form-type, date-range, or
   full-text parameter. Contrast SEC EDGAR, which offers per-company submissions JSON
   *and* full-text search.
2. **10-year rolling retention, with deletion.** 臨時報告書 has no extension period;
   fund annual reports have none either. Self-archiving is mandatory for long history.
3. **All errors return HTTP 200.** Document acquisition can only be validated by
   `Content-Type`. Two different error body shapes observed (`StatusCode` vs
   `metadata.status`).
4. **Rate limits undocumented.** Only a 429 code and a vague 利用規約 prohibition.
5. **API key in the query string** — logging-leak hazard requiring explicit redaction.
6. **Mandatory MFA (SMS/voice) via Azure AD B2C** for registration. Non-trivial
   onboarding; awkward for CI or shared credentials.
7. **`-` means explicit zero in the type=5 CSV**, colliding head-on with our `—`
   convention for missing.
8. **type=5 "CSV" is UTF-16LE TSV** and truncates values at 30,000 chars — unusable for
   long narrative sections.
9. **Records mutate and can be blanked** on expiry, withdrawal, or non-disclosure;
   filer attributes are frozen at record creation and require the code list plus the
   consolidation list to resolve.
10. **Industry-partitioned JP GAAP taxonomy (24 industry tables) × two accounting
    namespaces** (`jppfs_cor` / `jpigp_cor`) makes numeric metric mapping laborious;
    filer-specific extension elements appear with blank labels.
11. **Narrative content is Japanese for most filers.** English via `type=4` is voluntary
    and unquantified; `type=1` excludes foreign companies' English bodies.
12. **Quarterly reports abolished** — docTypeCode 140/150 are historical only; the 2026
    taxonomy has no quarterly form.
13. **Filer universe is ~3× the investable universe** (individuals, funds, unlisted
    issuers) and must be filtered via 上場区分 / 証券コード presence.
14. **No prices, no market cap, no ETF metadata, no indices.** EDINET must be paired
    with a market-data provider; it cannot replace one.
15. **Taxonomy files are excluded from PDL 1.0** even though filing data is covered.
16. **No CORS by design** — server-side only (not a problem for us, but it forecloses
    any client-side option).
17. **Service may be stopped or changed without notice**, with full liability
    disclaimed.

---

## 13. Sources actually fetched (2026-08-10)

- `https://disclosure2.edinet-fsa.go.jp/weee0010.aspx` — taxonomy/code-list download
  page. **The assigned URL was not the API portal**; it is the taxonomy download page.
  It mentions 「EDINET APIの利用登録はこちらから」 but the link is JavaScript-driven and
  yields no URL. All downloads on it are `javascript:void(0);`.
- `https://disclosure2.edinet-fsa.go.jp/week0010.aspx` — EDINET top page. This is where
  the API registration URL and `https://api.edinet-fsa.go.jp/` appear, as **plain text,
  not hyperlinks**.
- `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0110.html` —
  **the actual documentation index** (操作ガイド等). Not linked from either page above in
  a machine-followable way; this is the page worth bookmarking.
- `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140206.pdf`
  — API spec v2 (rev 2.9), 97 pp. Primary source for §§2–4, 7, 9, 10.
- `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140133.pdf`
  — 書類閲覧操作ガイド, 104 pp. Primary source for §6.4 (CSV layout, encoding, `-`
  semantics).
- `https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html` —
  利用規約 / PDL 1.0. Primary source for §8.
- `ESE140327.xlsx` (form codes), `ESE140114.xlsx`, `ESE140115.xlsx`, `ESE140184.xlsx`
  (taxonomy element lists), `Edinetcode.zip`, `Fundcode.zip` — parsed locally for
  §§4–6.
- `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-08-07&type=2` — called
  **without any key**, solely to confirm the auth requirement and observe the
  error-in-200 behaviour. No key was used, obtained, or stored.
- `https://api.edinet-fsa.go.jp/api/auth/index.aspx?mode=1` — confirmed 302 to Azure AD
  B2C; not followed further.

**Retrieval note on method:** the API spec, form-code list, and taxonomy lists are
binary PDF/XLSX. Fetching them as text yields only compressed bytes — every substantive
fact in this document came from locally decoding those files (`pdftotext`, and manual
XLSX ZIP/sharedStrings parsing). Anyone re-verifying this note must do the same; a plain
web fetch of these URLs returns nothing usable.

Not resolved, still open for Phase R:

- Actual rate limit (unpublished; discoverable only by measurement or by asking FSA).
- Whether registration is stated anywhere to be free of charge.
- **Frequency of English documents** (`englishDocFlag = "1"`) among listed filers —
  needs an API key and a sampled date range.
- Per-industry element mapping for our numeric metrics (large, deferrable).
- Whether 別紙2 (`ESE140328.xlsx`) contains edge cases beyond those in §3.1 —
  downloaded but not parsed in depth.
