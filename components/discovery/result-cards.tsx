"use client";

import { assertNever, type InstrumentSnapshot } from "@/lib/domain";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatIndexLevel,
  formatPercent,
  formatRatio,
} from "@/lib/format";

const ASSET_TYPE_LABEL: Record<InstrumentSnapshot["assetType"], string> = {
  stock: "Stock",
  etf: "ETF",
  index: "Index",
};

interface MetricRow {
  label: string;
  value: string;
}

function keyMetrics(snapshot: InstrumentSnapshot): readonly MetricRow[] {
  switch (snapshot.assetType) {
    case "stock":
      return [
        {
          label: "Price",
          value: formatCurrency(
            snapshot.quote?.price ?? null,
            snapshot.instrument.currency
          ),
        },
        {
          label: "Market Cap",
          value: formatCompactCurrency(
            snapshot.quote?.marketCap ?? null,
            snapshot.instrument.currency
          ),
        },
        { label: "P/E", value: formatRatio(snapshot.metrics.peRatio.value) },
        {
          label: "ROE",
          value: formatPercent(snapshot.metrics.returnOnEquity.value),
        },
      ];
    case "etf":
      return [
        {
          label: "Price",
          value: formatCurrency(
            snapshot.quote?.price ?? null,
            snapshot.instrument.currency
          ),
        },
        {
          label: "Expense Ratio",
          value: formatPercent(snapshot.metrics.expenseRatio.value, 2),
        },
        {
          label: "AUM",
          value: formatCompactCurrency(
            snapshot.metrics.assetsUnderManagement.value,
            snapshot.instrument.currency
          ),
        },
      ];
    case "index":
      return [
        { label: "Level", value: formatIndexLevel(snapshot.quote?.price ?? null) },
        {
          label: "YTD Return",
          value: formatPercent(snapshot.metrics.yearToDateReturn.value),
        },
      ];
    default:
      return assertNever(snapshot);
  }
}

function ResultCard({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const { instrument } = snapshot;
  const metrics = keyMetrics(snapshot);

  return (
    <li className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-semibold text-stone-900">{instrument.symbol}</p>
          <p className="text-sm text-stone-700">{instrument.name}</p>
          {instrument.nativeName ? (
            <p lang="ja" className="text-xs text-stone-500">
              {instrument.nativeName}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] text-stone-600">
          {ASSET_TYPE_LABEL[snapshot.assetType]}
        </span>
      </div>

      <p className="mt-2 text-xs text-stone-500">
        {`${instrument.listingMarket} · ${instrument.currency}`}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-xs text-stone-500">{metric.label}</dt>
            <dd className="tabular-nums text-stone-800">{metric.value}</dd>
          </div>
        ))}
      </dl>

      {snapshot.assetType === "index" ? (
        <p className="mt-3 text-xs text-stone-500">
          Reference index — not directly tradable
        </p>
      ) : null}

      <p className="mt-3 text-xs text-stone-500">
        {`As of ${formatDate(snapshot.quote?.asOf ?? snapshot.provenance.asOf)}`}
      </p>
    </li>
  );
}

interface ResultCardsProps {
  snapshots: readonly InstrumentSnapshot[];
}

export function ResultCards({ snapshots }: ResultCardsProps) {
  return (
    <ul className="space-y-3">
      {snapshots.map((snapshot) => (
        <ResultCard key={snapshot.instrument.id} snapshot={snapshot} />
      ))}
    </ul>
  );
}
