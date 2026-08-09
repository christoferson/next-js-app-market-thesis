"use client";

import Link from "next/link";

import type { StockSnapshot } from "@/lib/domain";
import type { StrategyScore } from "@/lib/screener/types";
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/lib/format";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";

/** One screened stock: the normalized snapshot plus its server-computed score. */
export interface ScreenerRow {
  snapshot: StockSnapshot;
  score: StrategyScore;
}

const TABLE_CLASS = "w-full border-collapse text-sm";
const HEAD_CELL_CLASS =
  "border-b border-stone-300 px-3 py-2 text-left align-bottom text-xs font-medium tracking-wide text-stone-600 uppercase";
const NUMERIC_HEAD_CELL_CLASS = `${HEAD_CELL_CLASS} text-right`;
const CELL_CLASS = "border-b border-stone-200 px-3 py-2.5 align-top text-stone-800";
const NUMERIC_CELL_CLASS = `${CELL_CLASS} text-right tabular-nums`;
const BADGE_CLASS =
  "inline-block rounded-sm border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[11px] text-stone-700";

/**
 * A score is alignment with the strategy's criteria out of 100 — never a
 * prediction. When available weight is too low the score is withheld and the
 * data completeness is shown instead, so a gap is never read as a low score.
 */
function StrategyMatch({
  score,
  align,
}: {
  score: StrategyScore;
  align: "right" | "left";
}) {
  const alignmentClass = align === "right" ? "items-end text-right" : "items-start";

  if (score.total === null) {
    return (
      <div className={`flex flex-col gap-0.5 ${alignmentClass}`}>
        <span className="text-stone-800">Insufficient Data</span>
        <span className="text-[11px] text-stone-600">
          {`Data completeness: ${formatRatio(score.availableWeight, 0)}/100`}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${alignmentClass}`}>
      <span className="text-stone-900 tabular-nums">
        {`${formatRatio(score.total, 1)} / 100`}
      </span>
      {score.label === null ? null : (
        <span className={BADGE_CLASS}>{score.label}</span>
      )}
    </div>
  );
}

function InstrumentIdentity({ snapshot }: { snapshot: StockSnapshot }) {
  const { id, symbol, name, nativeName } = snapshot.instrument;
  return (
    <Link
      href={`/discover/${id}`}
      className="block space-y-0.5 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
    >
      <div className="font-semibold text-stone-900">{symbol}</div>
      <div className="text-stone-700">{name}</div>
      {nativeName ? (
        <div lang="ja" className="text-xs text-stone-600">
          {nativeName}
        </div>
      ) : null}
    </Link>
  );
}

interface ScreenerResultsProps {
  rows: readonly ScreenerRow[];
}

/**
 * Screened stock table. Same columns as the Discovery stock table plus the
 * Strategy Match column; ETFs and indices are never screened by this strategy
 * and never reach this component.
 */
export function ScreenerResultsTable({ rows }: ScreenerResultsProps) {
  return (
    <div className="overflow-x-auto">
      <table className={TABLE_CLASS}>
        <caption className="sr-only">
          Demo stocks that match the selected criteria, with price, market
          capitalization, price-to-earnings ratio, return on equity, and the
          strategy match score out of 100. The score measures alignment with the
          strategy&apos;s criteria and does not predict future returns.
          Unavailable values are shown as an em dash.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD_CELL_CLASS}>
              Company
            </th>
            <th scope="col" className={HEAD_CELL_CLASS}>
              Market
            </th>
            <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
              Price
            </th>
            <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
              Market Cap
            </th>
            <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
              P/E
            </th>
            <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
              ROE
            </th>
            <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
              Strategy Match
            </th>
            <th scope="col" className={HEAD_CELL_CLASS}>
              <span className="sr-only">Watchlist</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ snapshot, score }) => {
            const { instrument, quote, metrics } = snapshot;
            return (
              <tr key={instrument.id}>
                <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
                  <InstrumentIdentity snapshot={snapshot} />
                </th>
                <td className={CELL_CLASS}>
                  <span className="whitespace-nowrap text-stone-700">
                    {`${instrument.listingMarket} · ${instrument.currency}`}
                  </span>
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatCurrency(quote?.price ?? null, instrument.currency)}
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatCompactCurrency(
                    quote?.marketCap ?? null,
                    instrument.currency
                  )}
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatRatio(metrics.peRatio.value)}
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatPercent(metrics.returnOnEquity.value)}
                </td>
                <td className={`${CELL_CLASS} text-right`}>
                  <StrategyMatch score={score} align="right" />
                </td>
                <td className={`${CELL_CLASS} text-right`}>
                  <WatchlistButton
                    instrumentId={instrument.id}
                    symbol={instrument.symbol}
                    name={instrument.name}
                    assetType={instrument.assetType}
                    size="row"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Narrow-viewport rendering of the same screened rows. */
export function ScreenerResultCards({ rows }: ScreenerResultsProps) {
  return (
    <ul className="space-y-3">
      {rows.map(({ snapshot, score }) => {
        const { instrument, quote, metrics } = snapshot;
        const facts: ReadonlyArray<{ label: string; value: string }> = [
          {
            label: "Price",
            value: formatCurrency(quote?.price ?? null, instrument.currency),
          },
          {
            label: "Market Cap",
            value: formatCompactCurrency(
              quote?.marketCap ?? null,
              instrument.currency
            ),
          },
          { label: "P/E", value: formatRatio(metrics.peRatio.value) },
          { label: "ROE", value: formatPercent(metrics.returnOnEquity.value) },
        ];

        return (
          <li
            key={instrument.id}
            className="rounded-md border border-stone-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <InstrumentIdentity snapshot={snapshot} />
              <div className="flex shrink-0 flex-col items-end gap-2">
                <WatchlistButton
                  instrumentId={instrument.id}
                  symbol={instrument.symbol}
                  name={instrument.name}
                  assetType={instrument.assetType}
                  size="row"
                />
              </div>
            </div>

            <p className="mt-2 text-xs text-stone-600">
              {`${instrument.listingMarket} · ${instrument.currency}`}
            </p>

            <div className="mt-3 border-t border-stone-200 pt-3">
              <p className="text-xs text-stone-600">Strategy Match</p>
              <div className="mt-1 text-sm">
                <StrategyMatch score={score} align="left" />
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs text-stone-600">{fact.label}</dt>
                  <dd className="tabular-nums text-stone-800">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
