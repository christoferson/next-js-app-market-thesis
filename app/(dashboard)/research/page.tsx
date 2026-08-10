import Link from "next/link";
import type { Metadata } from "next";

import { RESEARCH_UNIVERSE } from "@/lib/research/universe";

export const metadata: Metadata = {
  title: "Research — Market Thesis",
  description:
    "Compare what changed in a company's SEC filings, cited to the source documents.",
};

/**
 * Research entry point. The curated universe is a static list, so this page
 * renders without touching SEC EDGAR — only a company page fetches filings.
 */
export default function ResearchPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Research
        </h1>
        <p className="text-sm text-stone-600">
          Compare what changed in a company&apos;s SEC filings.
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
          Research reads real companies&apos; actual filings from SEC EDGAR.
          Every figure links to the filing it came from, so you can check it
          against the primary document.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          This differs from Discover, where every instrument, price, and metric
          is fictional demo data. Filing figures are reported historical
          results — they are not prices and not current market information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">Companies</h2>
        <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
          {RESEARCH_UNIVERSE.map((company) => (
            <li key={company.id}>
              <Link
                href={`/research/${company.id}`}
                className="flex flex-col gap-0.5 rounded-sm px-4 py-3 transition-colors motion-reduce:transition-none hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 sm:flex-row sm:items-baseline sm:gap-3"
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
          A small starter set — more companies in later milestones. Only US
          filers that publish to SEC EDGAR are covered today; Japanese filings
          are not yet available here.
        </p>
      </section>
    </div>
  );
}
