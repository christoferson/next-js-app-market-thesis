import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Market Thesis",
  description:
    "What Market Thesis is, the current Discovery phase, and how demo data is used.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          About Market Thesis
        </h1>
        <p className="text-sm text-stone-600">
          Know why you invested—and when the facts change.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">
          What Market Thesis is
        </h2>
        <p className="text-sm leading-relaxed text-stone-700">
          Market Thesis is a long-term investment discovery and research
          workspace. It helps you find research candidates, record why you
          invested, and notice when the underlying facts change.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          It covers six instrument groups:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
          <li>US stocks and Japanese stocks</li>
          <li>US-listed ETFs and Japanese-listed ETFs</li>
          <li>US market indices and Japanese market indices</li>
        </ul>
        <p className="text-sm leading-relaxed text-stone-700">
          Values are kept in each instrument&apos;s native currency — US
          instruments in USD, Japanese instruments in JPY. Amounts in different
          currencies are never added together or converted without an explicit,
          dated exchange rate.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">
          Current phase: Discovery
        </h2>
        <p className="text-sm leading-relaxed text-stone-700">
          The product workflow is Discover, Investigate, Decide, Track, Review.
          Only the first step is built today: browsing stocks, ETFs, and indices
          by asset type and market.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          This phase runs entirely on demo data. Search, watchlists, instrument
          detail pages, screening scores, charts, and portfolio tracking are not
          part of it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">
          What Market Thesis is not
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
          <li>It is not financial, investment, tax, or legal advice.</li>
          <li>It does not predict prices, returns, or future performance.</li>
          <li>
            It does not issue buy or sell recommendations, ratings, or price
            targets.
          </li>
          <li>
            It does not execute orders and is not connected to any brokerage.
          </li>
          <li>
            A criteria match means an instrument aligns with the filters you
            selected — nothing more.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">
          About the demo data
        </h2>
        <p className="text-sm leading-relaxed text-stone-700">
          Every instrument shown is fictional. Company names, symbols, prices,
          index levels, and financial metrics are fabricated for demonstration
          and do not describe any real company, fund, or index.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          The demo dataset uses a single fixed as-of date that never advances,
          so the same values appear on every visit. It is not delayed market
          data — it is not market data at all.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          Some values are intentionally missing so that unavailable data is
          visible as such. Missing data always displays as an em dash
          (&#8212;). It is never shown as zero, and it never satisfies an
          active numeric filter.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          Indices are reference benchmarks. An index shows a level, not a share
          price, and is not directly tradable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">Disclaimer</h2>
        <p className="rounded-md border border-stone-300 bg-white p-4 text-sm leading-relaxed text-stone-700">
          Market Thesis is a research tool, not financial advice. Market data
          may be delayed or incomplete. Verify information before making
          investment decisions.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          Demo data — not current market information. Investing involves risk,
          including the possible loss of principal. Past performance does not
          indicate future results. You are responsible for your own investment
          decisions and for verifying any figure against a primary source such
          as a company filing or an official exchange publication.
        </p>
      </section>
    </div>
  );
}
