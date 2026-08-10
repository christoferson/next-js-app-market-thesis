import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatSignedPercent,
  MISSING_DISPLAY,
} from "@/lib/format";
import { MarketDataError } from "@/lib/market-data/errors";
import type { FinancialLineChange } from "@/lib/research/changes";
import type { SelectedFact } from "@/lib/research/edgar/facts";
import {
  getCompanyResearch,
  type CompanyResearch,
  type FilingSummary,
} from "@/lib/research/service";
import {
  getResearchCompany,
  type ResearchCompany,
} from "@/lib/research/universe";

/**
 * Company research page. Filing data is fetched from SEC EDGAR per request
 * (the client throttles and caches for 15 minutes), so this route is always
 * rendered on demand and never prerendered at build time.
 */
export const dynamic = "force-dynamic";

/** US filers report in USD; R1 covers no other reporting currency. */
const REPORTING_CURRENCY = "USD" as const;

const PROVENANCE_NOTE =
  "Values are extracted from XBRL data in the company's SEC filings. " +
  "Calculated changes are deterministic. This is not financial advice.";

const NOT_REPORTED =
  "Not reported in recent annual filings.";

const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const SECTION_HEADING_CLASS = "text-base font-semibold text-stone-900";
const BADGE_CLASS =
  "rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase";
const MUTED_SMALL_CLASS = "text-[11px] text-stone-600";
const EXTERNAL_LINK_CLASS =
  "rounded-sm text-stone-700 underline decoration-stone-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

const TABLE_CLASS = "w-full border-collapse text-sm";
const HEAD_CELL_CLASS =
  "border-b border-stone-300 px-3 py-2 text-left align-bottom text-xs font-medium tracking-wide text-stone-600 uppercase";
const NUMERIC_HEAD_CELL_CLASS = `${HEAD_CELL_CLASS} text-right`;
const CELL_CLASS = "border-b border-stone-200 px-3 py-2 align-top text-stone-800";
const NUMERIC_CELL_CLASS = `${CELL_CLASS} text-right tabular-nums`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string }>;
}): Promise<Metadata> {
  const { companyId } = await params;
  const company = getResearchCompany(companyId);
  if (company === null) {
    return { title: "Company not found — Market Thesis" };
  }
  return {
    title: `${company.ticker} filings — Market Thesis`,
    description: `What changed in ${company.name}'s recent SEC filings, cited to source documents.`,
  };
}

/* ------------------------------------------------------------- value format */

/** Formatting is driven by the line's unit kind, never by guessing. */
function formatValue(
  unitKind: FinancialLineChange["unitKind"],
  value: number | null
): string {
  switch (unitKind) {
    case "currency":
      return formatCompactCurrency(value, REPORTING_CURRENCY);
    case "perShare":
      return formatCurrency(value, REPORTING_CURRENCY);
    case "shares":
      return formatCompactNumber(value);
  }
}

/**
 * A change carries an explicit sign so direction never depends on colour.
 * The minus is U+2212, matching `formatSignedPercent`.
 */
function formatSignedValue(
  unitKind: FinancialLineChange["unitKind"],
  value: number | null
): string {
  if (value === null || !Number.isFinite(value)) {
    return MISSING_DISPLAY;
  }
  const magnitude = formatValue(unitKind, Math.abs(value));
  if (magnitude === MISSING_DISPLAY) return MISSING_DISPLAY;
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `−${magnitude}`;
  return magnitude;
}

/** EDGAR gives the fiscal year end as "MMDD" — no year, so no year is shown. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatFiscalYearEnd(monthDay: string | null): string | null {
  if (monthDay === null || !/^\d{4}$/.test(monthDay)) return null;
  const month = Number(monthDay.slice(0, 2));
  const day = Number(monthDay.slice(2, 4));
  const name = MONTH_NAMES[month - 1];
  if (name === undefined || day < 1 || day > 31) return null;
  return `${name} ${day}`;
}

/** The EDGAR filing-index directory for an accession. */
function filingIndexUrl(cik: number, accessionNumber: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replaceAll("-", "")}/`;
}

/* ------------------------------------------------------------------ header */

function ResearchHeader({
  research,
}: {
  research: CompanyResearch;
}) {
  const fiscalYearEnd = formatFiscalYearEnd(research.fiscalYearEnd);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          {research.company.ticker}
        </h1>
        <span className={BADGE_CLASS}>Source: SEC EDGAR</span>
      </div>
      <p className="text-sm text-stone-700">{research.entityName}</p>
      <p className="text-sm text-stone-600">
        Real filing data — cited to source documents.
      </p>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        {fiscalYearEnd === null ? null : (
          <div>
            <dt className="text-xs text-stone-600">Fiscal year</dt>
            <dd className="text-sm text-stone-800">{`Fiscal year ends ${fiscalYearEnd}`}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-stone-600">Retrieved</dt>
          <dd className="text-sm text-stone-800">
            {`Retrieved ${formatDate(research.fetchedAt)}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-600">CIK</dt>
          <dd className="text-sm text-stone-800 tabular-nums">
            {research.company.cik}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* --------------------------------------------------------- what changed */

function FactCell({
  fact,
  unitKind,
}: {
  fact: SelectedFact | null;
  unitKind: FinancialLineChange["unitKind"];
}) {
  return (
    <td className={NUMERIC_CELL_CLASS}>
      <span className="block">{formatValue(unitKind, fact?.value ?? null)}</span>
      {fact === null ? null : (
        <span className={`block ${MUTED_SMALL_CLASS}`}>
          {`Period ended ${formatDate(fact.periodEnd)}`}
        </span>
      )}
    </td>
  );
}

function SourceCell({
  cik,
  fact,
}: {
  cik: number;
  fact: SelectedFact | null;
}) {
  if (fact === null) {
    return <td className={CELL_CLASS}>{MISSING_DISPLAY}</td>;
  }
  return (
    <td className={CELL_CLASS}>
      <a
        href={filingIndexUrl(cik, fact.accessionNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className={EXTERNAL_LINK_CLASS}
      >
        {`${fact.form} ${fact.accessionNumber} (sec.gov)`}
      </a>
      <span className={`block ${MUTED_SMALL_CLASS}`}>
        {`Filed ${formatDate(fact.filedDate)}`}
      </span>
    </td>
  );
}

function ChangeRow({
  change,
  cik,
}: {
  change: FinancialLineChange;
  cik: number;
}) {
  const rowHeader = (
    <th
      scope="row"
      className={`${CELL_CLASS} text-left font-normal whitespace-nowrap`}
    >
      <span className="font-medium text-stone-900">{change.label}</span>
      {change.current === null ? null : (
        <span className={`block ${MUTED_SMALL_CLASS}`}>
          {change.current.sourceTag}
        </span>
      )}
    </th>
  );

  // A concept the company never reported is stated as such rather than shown
  // as a row of dashes with a change of zero.
  if (change.current === null && change.prior === null) {
    return (
      <tr>
        {rowHeader}
        <td className={`${CELL_CLASS} text-stone-600`} colSpan={5}>
          {NOT_REPORTED}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      {rowHeader}
      <FactCell fact={change.prior} unitKind={change.unitKind} />
      <FactCell fact={change.current} unitKind={change.unitKind} />
      <td className={NUMERIC_CELL_CLASS}>
        {formatSignedValue(change.unitKind, change.absoluteChange)}
      </td>
      <td className={NUMERIC_CELL_CLASS}>
        {formatSignedPercent(change.relativeChange)}
      </td>
      <SourceCell cik={cik} fact={change.current} />
    </tr>
  );
}

function WhatChangedSection({ research }: { research: CompanyResearch }) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>What Changed — Annual</h2>
      <p className="text-sm text-stone-600">
        The most recent annual period compared with the one before it. A change
        describes what the company reported; it is not an assessment.
      </p>

      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <caption className="sr-only">
            Reported annual figures for the two most recent annual periods, the
            change between them, and the filing each current figure came from.
            Unavailable figures show an em dash and are never treated as zero.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Line item
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Prior period
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Current period
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Change
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                % Change
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {research.changes.map((change) => (
              <ChangeRow
                key={change.metricId}
                change={change}
                cik={research.company.cik}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-stone-600">{PROVENANCE_NOTE}</p>
    </section>
  );
}

/* -------------------------------------------------------- filing timeline */

function FilingRow({
  filing,
}: {
  filing: FilingSummary;
}) {
  return (
    <tr>
      <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
        <span className={BADGE_CLASS}>{filing.form}</span>
      </th>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {formatDate(filing.filingDate)}
      </td>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {filing.reportDate === null
          ? MISSING_DISPLAY
          : formatDate(filing.reportDate)}
      </td>
      <td className={CELL_CLASS}>
        <span className="block">{filing.description ?? MISSING_DISPLAY}</span>
        {filing.items === null ? null : (
          <span className={`block ${MUTED_SMALL_CLASS}`}>
            {`Items ${filing.items}`}
          </span>
        )}
        <span className={`block ${MUTED_SMALL_CLASS}`}>
          {filing.accessionNumber}
        </span>
      </td>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        <a
          href={filing.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_LINK_CLASS}
        >
          {`View filing (sec.gov)`}
        </a>
      </td>
    </tr>
  );
}

function FilingTimelineSection({ research }: { research: CompanyResearch }) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>Filing Timeline</h2>

      {research.filings.length === 0 ? (
        <p className="text-sm text-stone-600">
          No annual, quarterly, or current reports were returned for this
          company.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            Annual (10-K), quarterly (10-Q), and current (8-K) reports, most
            recently filed first. Each row links to the filing on sec.gov.
          </p>
          <div className="overflow-x-auto">
            <table className={TABLE_CLASS}>
              <caption className="sr-only">
                Recent SEC filings with the form type, the date filed, the
                period the filing reports on, and a link to the document.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Form
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Filed
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Period
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Document
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Link
                  </th>
                </tr>
              </thead>
              <tbody>
                {research.filings.map((filing) => (
                  <FilingRow key={filing.accessionNumber} filing={filing} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* --------------------------------------------------------- inline failure */

/**
 * EDGAR being unreachable is an expected condition, not a crash: the page
 * still identifies the company and explains what could not be loaded.
 */
function EdgarUnavailable({
  company,
  message,
  retryable,
}: {
  company: ResearchCompany;
  message: string;
  retryable: boolean;
}) {
  return (
    <div className="space-y-6">
      <BackLink />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            {company.ticker}
          </h1>
          <span className={BADGE_CLASS}>Source: SEC EDGAR</span>
        </div>
        <p className="text-sm text-stone-700">{company.name}</p>
      </div>

      <section role="alert" className={SECTION_CLASS}>
        <h2 className={SECTION_HEADING_CLASS}>
          SEC EDGAR is temporarily unavailable
        </h2>
        <p className="text-sm leading-relaxed text-stone-700">{message}</p>
        <p className="text-sm leading-relaxed text-stone-700">
          {retryable
            ? "This is usually temporary. Reload the page to try again."
            : "Filing data for this company could not be read. You can open the company's filings directly on sec.gov in the meantime."}
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          No filing figures were loaded, so no numbers on this page describe
          this company.
        </p>
        <p>
          <a
            href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=10-K`}
            target="_blank"
            rel="noopener noreferrer"
            className={EXTERNAL_LINK_CLASS}
          >
            Open filings on EDGAR (sec.gov)
          </a>
        </p>
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/research"
      className="inline-block rounded-sm text-sm text-stone-600 transition-colors motion-reduce:transition-none hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
    >
      ← Back to Research
    </Link>
  );
}

/* ------------------------------------------------------------------- route */

export default async function CompanyResearchPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  // The universe is checked before any network call, so an unknown slug never
  // costs an EDGAR request.
  const company = getResearchCompany(companyId);
  if (company === null) {
    notFound();
  }

  let research: CompanyResearch | null = null;
  let failure: { message: string; retryable: boolean } | null = null;
  try {
    research = await getCompanyResearch(companyId);
  } catch (error) {
    if (error instanceof MarketDataError) {
      failure = { message: error.message, retryable: error.retryable };
    } else {
      // Unexpected failures belong to the error boundary.
      throw error;
    }
  }

  if (failure !== null) {
    return (
      <EdgarUnavailable
        company={company}
        message={failure.message}
        retryable={failure.retryable}
      />
    );
  }

  if (research === null) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <ResearchHeader research={research} />
      <WhatChangedSection research={research} />
      <FilingTimelineSection research={research} />
    </div>
  );
}
