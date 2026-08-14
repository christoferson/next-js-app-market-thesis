import Link from "next/link";
import type { Metadata } from "next";

import { MISSING_DISPLAY, formatCurrency, formatDate } from "@/lib/format";
import { getPortfolio } from "@/lib/portfolio/service";
import { listTransactions } from "@/lib/portfolio/store";
import type { CurrencyTotals, Position } from "@/lib/portfolio/types";
import { subjectHref } from "@/components/thesis/labels";
import { Ledger } from "@/components/portfolio/ledger";
import {
  PriceMarkForm,
  type PriceMarkOption,
} from "@/components/portfolio/price-mark-form";
import { TransactionForm } from "@/components/portfolio/transaction-form";
import {
  BADGE_CLASS,
  CELL_CLASS,
  CURRENCY_LABEL,
  HEAD_CELL_CLASS,
  METHODOLOGY_NOTE,
  NUMERIC_CELL_CLASS,
  NUMERIC_HEAD_CELL_CLASS,
  SECTION_CLASS,
  STORAGE_NOTE,
  TABLE_CLASS,
  formatQuantity,
  formatSignedCurrency,
} from "@/components/portfolio/labels";

/**
 * Portfolio ledger (P1). The store is a local SQLite file read synchronously,
 * so this server component queries it directly instead of calling the app's own
 * HTTP API. Its contents change whenever the user records a transaction, so the
 * route is rendered on demand rather than prerendered at build time.
 *
 * Two product rules shape the whole page. USD and JPY totals are reported side
 * by side and never added together — no exchange rate is applied here, so no
 * combined figure could be honest. And no live prices exist: a position is only
 * valued once the user records a price mark, which is always displayed with the
 * date it was observed, together with a count of the positions no mark covers.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio — Market Thesis",
  description:
    "A manual ledger of your positions: cost basis, realized gains, dividends, and values from prices you recorded.",
};

const CARD_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const CARD_ROW_CLASS = "flex items-baseline justify-between gap-4 text-sm";
const CARD_LABEL_CLASS = "text-stone-600";
const CARD_VALUE_CLASS = "tabular-nums text-stone-900";

/** One per-currency summary. Nothing here is ever added to another card. */
function CurrencyCard({ totals }: { totals: CurrencyTotals }) {
  const rows: ReadonlyArray<{ label: string; value: string }> = [
    {
      label: "Open positions",
      value: String(totals.openPositionCount),
    },
    {
      label: "Cost basis",
      value: formatCurrency(totals.costBasis, totals.currency),
    },
    {
      label: "Realized gain",
      value: formatSignedCurrency(totals.realizedGain, totals.currency),
    },
    {
      label: "Dividend income",
      value: formatCurrency(totals.dividendIncome, totals.currency),
    },
    {
      label: "Fees paid",
      value: formatCurrency(totals.totalFees, totals.currency),
    },
  ];

  return (
    <section className={CARD_CLASS}>
      <h3 className="text-base font-semibold text-stone-900">
        {CURRENCY_LABEL[totals.currency]}
      </h3>

      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className={CARD_ROW_CLASS}>
            <dt className={CARD_LABEL_CLASS}>{row.label}</dt>
            <dd className={CARD_VALUE_CLASS}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1 border-t border-stone-200 pt-3">
        {totals.openPositionCount === 0 ? (
          <p className="text-sm leading-relaxed text-stone-700">
            No open positions in this currency. The figures above cover positions
            you have since closed.
          </p>
        ) : totals.markedValue === null ? (
          <p className="text-sm leading-relaxed text-stone-700">
            No price marks recorded, so these positions are not valued. Record a
            price you looked up to value them.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-stone-700">
            {`Marked value ${formatCurrency(totals.markedValue, totals.currency)} — based on prices you recorded, oldest ${formatDate(totals.oldestMarkDate)}`}
          </p>
        )}
        {totals.unmarkedPositionCount > 0 ? (
          <p className="text-xs leading-relaxed text-stone-600">
            {`${totals.unmarkedPositionCount} open position${
              totals.unmarkedPositionCount === 1 ? "" : "s"
            } ${
              totals.unmarkedPositionCount === 1 ? "has" : "have"
            } no price mark and ${
              totals.unmarkedPositionCount === 1 ? "is" : "are"
            } not included.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SubjectCell({ position }: { position: Position }) {
  const href = subjectHref(position.subjectRef);
  const closed = position.quantity === 0;

  return (
    <div className="space-y-0.5">
      {href === null ? (
        <span
          className={closed ? "text-stone-600" : "font-medium text-stone-900"}
        >
          {position.subjectLabel}
        </span>
      ) : (
        <Link
          href={href}
          className={`rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 ${
            closed ? "text-stone-600" : "font-medium text-stone-900"
          }`}
        >
          {position.subjectLabel}
        </Link>
      )}
      {closed ? (
        // "Closed" is a word, not a colour or a struck-through row.
        <div>
          <span className={BADGE_CLASS}>Closed</span>
        </div>
      ) : null}
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const closed = position.quantity === 0;
  const cellClass = closed ? `${CELL_CLASS} text-stone-600` : CELL_CLASS;
  const numericClass = closed
    ? `${NUMERIC_CELL_CLASS} text-stone-600`
    : NUMERIC_CELL_CLASS;

  return (
    <tr>
      <th scope="row" className={`${cellClass} font-normal`}>
        <SubjectCell position={position} />
      </th>
      <td className={cellClass}>{position.currency}</td>
      <td className={numericClass}>{formatQuantity(position.quantity)}</td>
      <td className={numericClass}>
        {formatCurrency(position.averageCost, position.currency)}
      </td>
      <td className={numericClass}>
        {formatCurrency(position.costBasis, position.currency)}
      </td>
      <td className={numericClass}>
        {position.latestMark === null ? (
          MISSING_DISPLAY
        ) : (
          <span className="block space-y-0.5">
            <span className="block">
              {formatCurrency(position.latestMark.price, position.currency)}
            </span>
            {/* A mark is never shown without the date it was observed. */}
            <span className="block text-[11px] text-stone-600">
              {`as of ${formatDate(position.latestMark.asOf)}`}
            </span>
          </span>
        )}
      </td>
      <td className={numericClass}>
        {formatCurrency(position.markValue, position.currency)}
      </td>
      <td className={numericClass}>
        {formatSignedCurrency(position.unrealizedGain, position.currency)}
      </td>
      <td className={numericClass}>
        {formatSignedCurrency(position.realizedGain, position.currency)}
      </td>
      <td className={numericClass}>
        {formatCurrency(position.dividendIncome, position.currency)}
      </td>
    </tr>
  );
}

const POSITION_COLUMNS: ReadonlyArray<{ label: string; numeric: boolean }> = [
  { label: "Subject", numeric: false },
  { label: "Currency", numeric: false },
  { label: "Quantity", numeric: true },
  { label: "Avg cost", numeric: true },
  { label: "Cost basis", numeric: true },
  { label: "Latest mark", numeric: true },
  { label: "Mark value", numeric: true },
  { label: "Unrealized", numeric: true },
  { label: "Realized", numeric: true },
  { label: "Dividends", numeric: true },
];

function PositionsTable({ positions }: { positions: readonly Position[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
      <table className={TABLE_CLASS}>
        <caption className="sr-only">
          Your positions, open ones first, each in its own currency: quantity
          held, moving-average cost, cost basis, the latest price you recorded
          with its date, and the resulting value alongside realized gains and
          dividends. Unrealized values exist only where a price mark does.
          Unavailable values are shown as an em dash.
        </caption>
        <thead>
          <tr>
            {POSITION_COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={
                  column.numeric ? NUMERIC_HEAD_CELL_CLASS : HEAD_CELL_CLASS
                }
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <PositionRow key={position.subjectRef} position={position} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PortfolioPage() {
  const { positions, totals } = getPortfolio();
  const transactions = listTransactions();

  const openPositions: PriceMarkOption[] = positions
    .filter((position) => position.quantity > 0)
    .map((position) => ({
      subjectRef: position.subjectRef,
      subjectLabel: position.subjectLabel,
      currency: position.currency,
    }));

  const hasEntries = transactions.length > 0;

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Portfolio
        </h1>
        <p className="text-sm text-stone-600">
          A manual ledger of your positions. Not synced to an account; not
          financial advice.
        </p>
      </div>

      {totals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            Totals by currency
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-stone-700">
            Each currency is reported on its own. There is no combined total,
            because no exchange rate is applied here.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {totals.map((currencyTotals) => (
              <CurrencyCard
                key={currencyTotals.currency}
                totals={currencyTotals}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-stone-900">
          Positions
        </h2>

        {positions.length === 0 ? (
          <div className={SECTION_CLASS}>
            <p className="text-sm leading-relaxed text-stone-700">
              No transactions yet. Record your first buy below.
            </p>
          </div>
        ) : (
          <PositionsTable positions={positions} />
        )}

        <p className="max-w-3xl text-xs leading-relaxed text-stone-600">
          {METHODOLOGY_NOTE}
        </p>
      </section>

      <section className="max-w-3xl space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-stone-900">
          Add transaction
        </h2>
        <p className="text-sm leading-relaxed text-stone-700">
          Entries are recorded exactly as you enter them. Positions, cost basis
          and realized gains are calculated from the ledger, never stored.
        </p>
        <TransactionForm />
      </section>

      {openPositions.length > 0 ? (
        <section className="max-w-3xl space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            Record price mark
          </h2>
          <p className="text-sm leading-relaxed text-stone-700">
            Record a price you looked up (e.g. from your broker) to value open
            positions. The date is shown wherever the value is used.
          </p>
          <PriceMarkForm positions={openPositions} />
        </section>
      ) : null}

      {hasEntries ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            Ledger
          </h2>
          <Ledger transactions={transactions} />
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-stone-600">{STORAGE_NOTE}</p>
    </div>
  );
}
