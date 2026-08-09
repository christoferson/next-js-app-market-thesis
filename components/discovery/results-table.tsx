"use client";

import Link from "next/link";

import {
  assertNever,
  type EtfSnapshot,
  type IndexSnapshot,
  type InstrumentSnapshot,
  type StockSnapshot,
} from "@/lib/domain";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatIndexLevel,
  formatPercent,
  formatRatio,
  formatSignedPercent,
  MISSING_DISPLAY,
} from "@/lib/format";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";

const NOT_TRADABLE_NOTE = "Reference index — not directly tradable";

const TABLE_CLASS = "w-full border-collapse text-sm";
const HEAD_CELL_CLASS =
  "border-b border-stone-300 px-3 py-2 text-left align-bottom text-xs font-medium tracking-wide text-stone-600 uppercase";
const NUMERIC_HEAD_CELL_CLASS = `${HEAD_CELL_CLASS} text-right`;
const CELL_CLASS = "border-b border-stone-200 px-3 py-2.5 align-top text-stone-800";
const NUMERIC_CELL_CLASS = `${CELL_CLASS} text-right tabular-nums`;

function isStockSnapshot(snapshot: InstrumentSnapshot): snapshot is StockSnapshot {
  return snapshot.assetType === "stock";
}

function isEtfSnapshot(snapshot: InstrumentSnapshot): snapshot is EtfSnapshot {
  return snapshot.assetType === "etf";
}

function isIndexSnapshot(snapshot: InstrumentSnapshot): snapshot is IndexSnapshot {
  return snapshot.assetType === "index";
}

function MarketCell({ snapshot }: { snapshot: InstrumentSnapshot }) {
  return (
    <td className={CELL_CLASS}>
      <span className="whitespace-nowrap text-stone-700">
        {`${snapshot.instrument.listingMarket} · ${snapshot.instrument.currency}`}
      </span>
    </td>
  );
}

/**
 * The row stays non-interactive; only the identity cell links to the detail
 * page, so keyboard users get one predictable target per row.
 */
function InstrumentIdentity({ snapshot }: { snapshot: InstrumentSnapshot }) {
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

function WatchlistHeadCell() {
  return (
    <th scope="col" className={HEAD_CELL_CLASS}>
      <span className="sr-only">Watchlist</span>
    </th>
  );
}

function WatchlistCell({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const { id, symbol, name, assetType } = snapshot.instrument;
  return (
    <td className={`${CELL_CLASS} text-right`}>
      <WatchlistButton
        instrumentId={id}
        symbol={symbol}
        name={name}
        assetType={assetType}
        size="row"
      />
    </td>
  );
}

function StocksTable({ snapshots }: { snapshots: readonly StockSnapshot[] }) {
  return (
    <table className={TABLE_CLASS}>
      <caption className="sr-only">
        Demo stocks matching the selected filters, with price, market
        capitalization, revenue growth, price-to-earnings ratio, free cash flow
        yield, and return on equity. Unavailable values are shown as an em dash.
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
            Revenue Growth
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            P/E
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            FCF Yield
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            ROE
          </th>
          <WatchlistHeadCell />
        </tr>
      </thead>
      <tbody>
        {snapshots.map((snapshot) => (
          <tr key={snapshot.instrument.id}>
            <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
              <InstrumentIdentity snapshot={snapshot} />
            </th>
            <MarketCell snapshot={snapshot} />
            <td className={NUMERIC_CELL_CLASS}>
              {formatCurrency(
                snapshot.quote?.price ?? null,
                snapshot.instrument.currency
              )}
            </td>
            <td className={NUMERIC_CELL_CLASS}>
              {formatCompactCurrency(
                snapshot.quote?.marketCap ?? null,
                snapshot.instrument.currency
              )}
            </td>
            <td className={NUMERIC_CELL_CLASS}>
              {formatPercent(snapshot.metrics.revenueGrowth.value)}
            </td>
            <td className={NUMERIC_CELL_CLASS}>
              {formatRatio(snapshot.metrics.peRatio.value)}
            </td>
            <td className={NUMERIC_CELL_CLASS}>
              {formatPercent(snapshot.metrics.freeCashFlowYield.value)}
            </td>
            <td className={NUMERIC_CELL_CLASS}>
              {formatPercent(snapshot.metrics.returnOnEquity.value)}
            </td>
            <WatchlistCell snapshot={snapshot} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EtfsTable({ snapshots }: { snapshots: readonly EtfSnapshot[] }) {
  return (
    <table className={TABLE_CLASS}>
      <caption className="sr-only">
        Demo exchange-traded funds matching the selected filters, with price,
        category, expense ratio, assets under management, dividend yield, and
        investment exposure. Unavailable values are shown as an em dash.
      </caption>
      <thead>
        <tr>
          <th scope="col" className={HEAD_CELL_CLASS}>
            ETF
          </th>
          <th scope="col" className={HEAD_CELL_CLASS}>
            Market
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            Price
          </th>
          <th scope="col" className={HEAD_CELL_CLASS}>
            Category
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            Expense Ratio
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            AUM
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            Dividend Yield
          </th>
          <th scope="col" className={HEAD_CELL_CLASS}>
            Exposure
          </th>
          <WatchlistHeadCell />
        </tr>
      </thead>
      <tbody>
        {snapshots.map((snapshot) => {
          const { metrics } = snapshot;
          return (
            <tr key={snapshot.instrument.id}>
              <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
                <InstrumentIdentity snapshot={snapshot} />
                {metrics.isLeveraged === true || metrics.isInverse === true ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {metrics.isLeveraged === true ? (
                      <span className="rounded-sm border border-stone-300 px-1 py-0.5 text-[11px] text-stone-600">
                        Leveraged
                        {metrics.leverageFactor !== null
                          ? ` ${formatRatio(metrics.leverageFactor)}×`
                          : ""}
                      </span>
                    ) : null}
                    {metrics.isInverse === true ? (
                      <span className="rounded-sm border border-stone-300 px-1 py-0.5 text-[11px] text-stone-600">
                        Inverse
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </th>
              <MarketCell snapshot={snapshot} />
              <td className={NUMERIC_CELL_CLASS}>
                {formatCurrency(
                  snapshot.quote?.price ?? null,
                  snapshot.instrument.currency
                )}
              </td>
              <td className={CELL_CLASS}>
                {metrics.category ?? MISSING_DISPLAY}
              </td>
              <td className={NUMERIC_CELL_CLASS}>
                {formatPercent(metrics.expenseRatio.value, 2)}
              </td>
              <td className={NUMERIC_CELL_CLASS}>
                {formatCompactCurrency(
                  metrics.assetsUnderManagement.value,
                  snapshot.instrument.currency
                )}
              </td>
              <td className={NUMERIC_CELL_CLASS}>
                {formatPercent(metrics.dividendYield.value)}
              </td>
              <td className={CELL_CLASS}>
                {metrics.exposureRegions.length > 0
                  ? metrics.exposureRegions.join(", ")
                  : MISSING_DISPLAY}
              </td>
              <WatchlistCell snapshot={snapshot} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DayChangeCell({ dayChangePercent }: { dayChangePercent: number | null }) {
  const direction =
    dayChangePercent === null || !Number.isFinite(dayChangePercent)
      ? null
      : dayChangePercent > 0
        ? "up"
        : dayChangePercent < 0
          ? "down"
          : "unchanged";

  const toneClass =
    direction === "up"
      ? "text-emerald-700"
      : direction === "down"
        ? "text-rose-700"
        : "text-stone-700";

  return (
    <td className={NUMERIC_CELL_CLASS}>
      <span className={toneClass}>{formatSignedPercent(dayChangePercent)}</span>
      {direction === "up" || direction === "down" ? (
        <span className="sr-only"> {direction}</span>
      ) : null}
    </td>
  );
}

function IndicesTable({ snapshots }: { snapshots: readonly IndexSnapshot[] }) {
  return (
    <table className={TABLE_CLASS}>
      <caption className="sr-only">
        Demo market indices matching the selected filters, with index level, day
        change, year-to-date return, one-year return, and data date. Index
        levels are not share prices and indices are not directly tradable.
        Unavailable values are shown as an em dash.
      </caption>
      <thead>
        <tr>
          <th scope="col" className={HEAD_CELL_CLASS}>
            Index
          </th>
          <th scope="col" className={HEAD_CELL_CLASS}>
            Market
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            Level
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            Day Change
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            YTD Return
          </th>
          <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
            1Y Return
          </th>
          <th scope="col" className={HEAD_CELL_CLASS}>
            As Of
          </th>
          <WatchlistHeadCell />
        </tr>
      </thead>
      <tbody>
        {snapshots.map((snapshot) => (
          <tr key={snapshot.instrument.id}>
            <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
              <InstrumentIdentity snapshot={snapshot} />
            </th>
            <MarketCell snapshot={snapshot} />
            <td className={NUMERIC_CELL_CLASS}>
              {formatIndexLevel(snapshot.quote?.price ?? null)}
            </td>
            <DayChangeCell
              dayChangePercent={snapshot.quote?.dayChangePercent ?? null}
            />
            <td className={NUMERIC_CELL_CLASS}>
              {formatPercent(snapshot.metrics.yearToDateReturn.value)}
            </td>
            <td className={NUMERIC_CELL_CLASS}>
              {formatPercent(snapshot.metrics.oneYearReturn.value)}
            </td>
            <td className={CELL_CLASS}>
              {formatDate(snapshot.quote?.asOf ?? null)}
            </td>
            <WatchlistCell snapshot={snapshot} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ResultsTableProps {
  snapshots: readonly InstrumentSnapshot[];
}

/**
 * Each asset type gets its own table because the columns carry different
 * meanings — an index level is not a price and an ETF has no stock P/E.
 */
export function ResultsTable({ snapshots }: ResultsTableProps) {
  const first = snapshots[0];
  if (!first) {
    return null;
  }

  switch (first.assetType) {
    case "stock":
      return (
        <div className="overflow-x-auto">
          <StocksTable snapshots={snapshots.filter(isStockSnapshot)} />
        </div>
      );
    case "etf":
      return (
        <div className="overflow-x-auto">
          <EtfsTable snapshots={snapshots.filter(isEtfSnapshot)} />
        </div>
      );
    case "index":
      return (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <IndicesTable snapshots={snapshots.filter(isIndexSnapshot)} />
          </div>
          <p className="text-xs text-stone-600">{NOT_TRADABLE_NOTE}</p>
        </div>
      );
    default:
      return assertNever(first);
  }
}
