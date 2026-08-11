import Link from "next/link";
import type { Metadata } from "next";

import { JAPAN_RESEARCH_UNIVERSE } from "@/lib/research/edinet/universe";
import { RESEARCH_UNIVERSE } from "@/lib/research/universe";

export const metadata: Metadata = {
  title: "Research — Market Thesis",
  description:
    "Compare what changed in a company's SEC and EDINET filings, cited to the source documents.",
};

const COMPANY_LIST_CLASS =
  "divide-y divide-stone-200 rounded-md border border-stone-200 bg-white";
const COMPANY_LINK_CLASS =
  "flex flex-col gap-0.5 rounded-sm px-4 py-3 transition-colors motion-reduce:transition-none hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 sm:flex-row sm:items-baseline sm:gap-3";

/**
 * Research entry point. Both curated universes are static lists, so this page
 * renders without touching SEC EDGAR or the local EDINET store — only a
 * company page reads filings.
 */
export default function ResearchPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Research
        </h1>
        <p className="text-sm text-stone-600">
          Compare what changed in a company&apos;s regulatory filings — US
          filers via SEC EDGAR, Japanese filers via EDINET.
        </p>
      </div>

      {/*
        The one distinction a user must not miss: Research quotes real public
        filings, while Discover browses fabricated demo instruments. Stated
        plainly and calmly, not as a warning.
      */}
      <section className="space-y-2 rounded-md border border-stone-300 bg-stone-50 p-5">
        <h2 className="text-base font-semibold text-stone-900">
          Real filing data, cited to source
        </h2>
        <p className="text-sm leading-relaxed text-stone-700">
          Research reads real companies&apos; actual filings from SEC EDGAR and
          EDINET. Every figure links to the filing it came from, so you can
          check it against the primary document.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          This differs from Discover, where every instrument, price, and metric
          is fictional demo data. Filing figures are reported historical
          results — they are not prices and not current market information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">Companies</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-800">
            United States
          </h3>
          <ul className={COMPANY_LIST_CLASS}>
            {RESEARCH_UNIVERSE.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/research/${company.id}`}
                  className={COMPANY_LINK_CLASS}
                >
                  <span className="text-sm font-semibold text-stone-900">
                    {company.ticker}
                  </span>
                  <span className="text-sm text-stone-700">{company.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-stone-600">
            Filing data is read from SEC EDGAR on demand.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-800">Japan</h3>
          <ul className={COMPANY_LIST_CLASS}>
            {JAPAN_RESEARCH_UNIVERSE.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/research/jp/${company.id}`}
                  className={COMPANY_LINK_CLASS}
                >
                  <span className="text-sm font-semibold text-stone-900 tabular-nums">
                    {company.ticker}
                  </span>
                  <span className="text-sm text-stone-700">{company.name}</span>
                  {/*
                    The native name is marked so screen readers and font
                    selection treat it as Japanese, not as English text.
                  */}
                  <span lang="ja" className="text-sm text-stone-600">
                    {company.nativeName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-stone-600">
            Filing data is ingested locally from EDINET. Quarterly reports were
            abolished in Japan — comparisons are annual.
          </p>
        </div>

        <p className="text-xs leading-relaxed text-stone-600">
          A small starter set in each market — more companies in later
          milestones.
        </p>
      </section>
    </div>
  );
}
