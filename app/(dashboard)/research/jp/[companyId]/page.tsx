import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatDate, MISSING_DISPLAY } from "@/lib/format";
import { WhatChangedSection } from "@/components/research/what-changed-section";
// Server-only gate. The client component never imports the analysis config, so
// whether AI is enabled is decided here and reflected in what gets rendered.
import { isAnalysisEnabled } from "@/lib/research/analysis/get-client";
import {
  getJapanCompanyResearch,
  type JapanCompanyResearch,
} from "@/lib/research/edinet/comparison";
import { getJapanResearchCompany } from "@/lib/research/edinet/universe";

/**
 * Japanese company research page (R3). Filings come from the local EDINET
 * store, which is read synchronously — no network call happens while
 * rendering. The store's contents change whenever the sync script runs, so the
 * route is rendered on demand rather than prerendered at build time.
 */
export const dynamic = "force-dynamic";

const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const SECTION_HEADING_CLASS = "text-base font-semibold text-stone-900";
const BADGE_CLASS =
  "rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase";
const EXTERNAL_LINK_CLASS =
  "rounded-sm text-stone-700 underline decoration-stone-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

const TABLE_CLASS = "w-full border-collapse text-sm";
const HEAD_CELL_CLASS =
  "border-b border-stone-300 px-3 py-2 text-left align-bottom text-xs font-medium tracking-wide text-stone-600 uppercase";
const CELL_CLASS = "border-b border-stone-200 px-3 py-2 align-top text-stone-800";
const MUTED_SMALL_CLASS = "text-[11px] text-stone-600";

/**
 * EDINET document types this page can describe. An unrecognized code is shown
 * verbatim rather than guessed at.
 */
const DOC_TYPE_LABEL: Record<string, string> = {
  "120": "Annual securities report (有価証券報告書)",
  "160": "Semiannual report (半期報告書)",
};

const ANALYSIS_EXPLANATION =
  "AI-assisted comparison of the business-risk sections in the two most " +
  "recent annual securities reports held in the local filing store.";

const ANALYSIS_EXTRA_NOTE =
  "Japan abolished quarterly reporting, so the comparison is annual: one " +
  "fiscal year against the one before it.";

const ANALYSIS_COST_NOTE =
  "Uses an AI model via AWS Bedrock when no stored result exists. First run " +
  "takes up to a minute.";

const ANALYSIS_LOADING_NOTE =
  "Comparing filings — Japanese source text, English findings. Takes up to a " +
  "minute.";

/**
 * Public Data License 1.0 requires the source be attributed in Japanese, and
 * that processed content be identified as processed.
 */
const ATTRIBUTION_JA =
  "出典：EDINET閲覧（提出）サイト（https://disclosure2.edinet-fsa.go.jp/）、PDL1.0";

const ATTRIBUTION_EN =
  "Source: EDINET disclosure site, Public Data License 1.0. Text sections are " +
  "extracted and processed by Market Thesis.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string }>;
}): Promise<Metadata> {
  const { companyId } = await params;
  const company = getJapanResearchCompany(companyId);
  if (company === null) {
    return { title: "Company not found — Market Thesis" };
  }
  return {
    title: `${company.ticker} filings — Market Thesis`,
    description: `What changed in ${company.name}'s recent EDINET filings, cited to source documents.`,
  };
}

/* ------------------------------------------------------------------ header */

function ResearchHeader({
  company,
}: {
  company: JapanCompanyResearch["company"];
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 tabular-nums">
          {company.ticker}
        </h1>
        <span className={BADGE_CLASS}>
          Source: EDINET (Financial Services Agency)
        </span>
      </div>
      <p className="text-sm text-stone-700">{company.name}</p>
      <p lang="ja" className="text-sm text-stone-600">
        {company.nativeName}
      </p>
      <p className="text-sm text-stone-600">
        Real filing data — cited to source documents.
      </p>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-stone-600">EDINET code</dt>
          <dd className="text-sm text-stone-800">{company.edinetCode}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-600">Securities code</dt>
          <dd className="text-sm text-stone-800 tabular-nums">
            {company.secCode}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* -------------------------------------------------------- filing timeline */

type StoredFilingView = JapanCompanyResearch["filings"][number];

function FilingRow({ filing }: { filing: StoredFilingView }) {
  const label = DOC_TYPE_LABEL[filing.docTypeCode] ?? filing.docTypeCode;

  return (
    <tr>
      <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
        <span className="block font-medium text-stone-900">{label}</span>
        {filing.docDescription === null ? null : (
          <span lang="ja" className={`block ${MUTED_SMALL_CLASS}`}>
            {filing.docDescription}
          </span>
        )}
        <span className={`block ${MUTED_SMALL_CLASS}`}>{filing.docId}</span>
      </th>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {formatDate(filing.submitDate)}
      </td>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {filing.periodEnd === null
          ? MISSING_DISPLAY
          : formatDate(filing.periodEnd)}
      </td>
      <td className={CELL_CLASS}>
        {filing.hasRiskText ? "Risk text extracted ✓" : MISSING_DISPLAY}
      </td>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        <a
          href={filing.viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_LINK_CLASS}
        >
          View filing (EDINET)
        </a>
      </td>
    </tr>
  );
}

function FilingTimelineSection({
  filings,
}: {
  filings: readonly StoredFilingView[];
}) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>Filing Timeline</h2>

      {filings.length === 0 ? (
        <p className="text-sm leading-relaxed text-stone-700">
          No filings in the local store for this company yet. Run{" "}
          <code className="rounded-sm bg-stone-100 px-1 py-0.5 text-xs text-stone-800">
            npm run sync:edinet
          </code>{" "}
          for the relevant filing windows (see README).
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            Annual securities reports and semiannual reports held in the local
            store, most recently submitted first. Each row links to the filing
            on the EDINET disclosure site.
          </p>
          <div className="overflow-x-auto">
            <table className={TABLE_CLASS}>
              <caption className="sr-only">
                Stored EDINET filings with the document type, the date
                submitted, the period the filing reports on, whether the
                business-risk text was extracted, and a link to the document.
                Unavailable values show an em dash.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Document
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Submitted
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Period end
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Risk section
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Link
                  </th>
                </tr>
              </thead>
              <tbody>
                {filings.map((filing) => (
                  <FilingRow key={filing.docId} filing={filing} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * When runtime AI is switched off for a deployment, the section is replaced by
 * a plain statement rather than a button that cannot work.
 */
function NarrativeComparisonDisabled() {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>What Changed — Business Risks</h2>
      <p className="text-sm text-stone-600">
        AI narrative comparison is disabled in this deployment.
      </p>
    </section>
  );
}

function AttributionFooter() {
  return (
    <footer className="space-y-1 border-t border-stone-200 pt-4">
      <p lang="ja" className="text-xs leading-relaxed text-stone-600">
        {ATTRIBUTION_JA}
      </p>
      <p className="text-xs leading-relaxed text-stone-600">{ATTRIBUTION_EN}</p>
    </footer>
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

export default async function JapanCompanyResearchPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const research = getJapanCompanyResearch(companyId);
  if (research === null) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <ResearchHeader company={research.company} />
      <FilingTimelineSection filings={research.filings} />
      {isAnalysisEnabled() ? (
        <WhatChangedSection
          companyId={companyId}
          endpointTemplate="/api/research/jp/{companyId}/what-changed"
          heading="What Changed — Business Risks"
          explanation={ANALYSIS_EXPLANATION}
          extraNote={ANALYSIS_EXTRA_NOTE}
          buttonLabel="Compare latest business risks"
          costNote={ANALYSIS_COST_NOTE}
          loadingNote={ANALYSIS_LOADING_NOTE}
          sourceLabel="EDINET"
        />
      ) : (
        <NarrativeComparisonDisabled />
      )}
      <AttributionFooter />
    </div>
  );
}
