import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assertNever,
  type EtfMetrics,
  type EtfSnapshot,
  type IndexMetrics,
  type IndexSnapshot,
  type InstrumentSnapshot,
  type MetricValue,
  type StockMetrics,
  type StockSnapshot,
  type SupportedCurrency,
  type SupportedMarket,
} from "@/lib/domain";
import { getDiscoveryInstrument } from "@/lib/discovery/service";
import { MarketDataError } from "@/lib/market-data/errors";
import {
  formatCompactCurrency,
  formatCompactNumber,
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
const DEMO_NOTICE = "Demo data — not current market information.";
const NO_REASON_FALLBACK = "Not available";

const ASSET_TYPE_LABEL: Record<InstrumentSnapshot["assetType"], string> = {
  stock: "Stock",
  etf: "ETF",
  index: "Index",
};

const MARKET_LABEL: Record<SupportedMarket, string> = {
  US: "United States",
  JP: "Japan",
};

/**
 * Provider display names are an integration detail; the snapshot only carries
 * the provider id, so map it here rather than printing a raw id.
 */
const PROVIDER_DISPLAY_NAME: Record<string, string> = {
  demo: "Demo Data",
};

/* ------------------------------------------------------------------ layout */

const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const SECTION_HEADING_CLASS = "text-base font-semibold text-stone-900";
const GRID_CLASS = "grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";
const TERM_CLASS = "text-xs text-stone-500";
const VALUE_CLASS = "text-sm text-stone-800 tabular-nums";
const TEXT_VALUE_CLASS = "text-sm text-stone-800";
const PERIOD_CLASS = "text-[11px] text-stone-500";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>{title}</h2>
      {children}
    </section>
  );
}

/** A plain label/value pair for non-metric fields (text, quote values). */
function FactRow({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className={TERM_CLASS}>{label}</dt>
      <dd className={numeric ? VALUE_CLASS : TEXT_VALUE_CLASS}>{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------- metric tables */

/**
 * A metric row description: a human label, how to reach the metric, and how to
 * format it. Selectors keep this type-safe without indexing by string, so no
 * raw camelCase key ever reaches the UI. Formatting comes from `@/lib/format`.
 */
interface MetricDescriptor<TMetrics> {
  readonly label: string;
  readonly select: (metrics: TMetrics) => MetricValue;
  readonly format: (value: number | null, currency: SupportedCurrency) => string;
}

const asPercent = (value: number | null): string => formatPercent(value);
const asPercent2 = (value: number | null): string => formatPercent(value, 2);
const asRatio = (value: number | null): string => formatRatio(value);
const asCompactNumber = (value: number | null): string =>
  formatCompactNumber(value);
const asCompactCurrency = (
  value: number | null,
  currency: SupportedCurrency
): string => formatCompactCurrency(value, currency);

const STOCK_METRIC_ROWS: ReadonlyArray<MetricDescriptor<StockMetrics>> = [
  { label: "P/E", select: (m) => m.peRatio, format: asRatio },
  { label: "Price/Book", select: (m) => m.priceToBook, format: asRatio },
  { label: "Revenue Growth", select: (m) => m.revenueGrowth, format: asPercent },
  { label: "EPS Growth", select: (m) => m.epsGrowth, format: asPercent },
  { label: "ROE", select: (m) => m.returnOnEquity, format: asPercent },
  {
    label: "Operating Margin",
    select: (m) => m.operatingMargin,
    format: asPercent,
  },
  {
    label: "FCF Margin",
    select: (m) => m.freeCashFlowMargin,
    format: asPercent,
  },
  { label: "FCF Yield", select: (m) => m.freeCashFlowYield, format: asPercent },
  { label: "Debt/Equity", select: (m) => m.debtToEquity, format: asRatio },
  { label: "Current Ratio", select: (m) => m.currentRatio, format: asRatio },
  { label: "Dividend Yield", select: (m) => m.dividendYield, format: asPercent },
  {
    label: "3Y Share Count CAGR",
    select: (m) => m.shareCountCagr3Y,
    format: asPercent,
  },
];

const ETF_METRIC_ROWS: ReadonlyArray<MetricDescriptor<EtfMetrics>> = [
  { label: "Expense Ratio", select: (m) => m.expenseRatio, format: asPercent2 },
  {
    label: "AUM",
    select: (m) => m.assetsUnderManagement,
    format: asCompactCurrency,
  },
  {
    label: "Avg Volume",
    select: (m) => m.averageVolume,
    format: asCompactNumber,
  },
  {
    label: "Holdings Count",
    select: (m) => m.holdingsCount,
    format: asCompactNumber,
  },
  { label: "Dividend Yield", select: (m) => m.dividendYield, format: asPercent },
];

const INDEX_PERFORMANCE_ROWS: ReadonlyArray<MetricDescriptor<IndexMetrics>> = [
  { label: "1M Return", select: (m) => m.oneMonthReturn, format: asPercent },
  { label: "YTD Return", select: (m) => m.yearToDateReturn, format: asPercent },
  { label: "1Y Return", select: (m) => m.oneYearReturn, format: asPercent },
];

const INDEX_DETAIL_ROWS: ReadonlyArray<MetricDescriptor<IndexMetrics>> = [
  {
    label: "Constituents",
    select: (m) => m.constituentCount,
    format: asCompactNumber,
  },
];

function MetricGrid<TMetrics>({
  metrics,
  rows,
  currency,
}: {
  metrics: TMetrics;
  rows: ReadonlyArray<MetricDescriptor<TMetrics>>;
  currency: SupportedCurrency;
}) {
  return (
    <dl className={GRID_CLASS}>
      {rows.map((row) => {
        const metric = row.select(metrics);
        return (
          <div key={row.label}>
            <dt className={TERM_CLASS}>{row.label}</dt>
            <dd className={VALUE_CLASS}>{row.format(metric.value, currency)}</dd>
            {metric.period ? (
              <dd className={PERIOD_CLASS}>{metric.period}</dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

/* ------------------------------------------------------- data availability */

interface UnavailableMetric {
  label: string;
  reason: string;
}

function collectUnavailable<TMetrics>(
  metrics: TMetrics,
  rows: ReadonlyArray<MetricDescriptor<TMetrics>>
): UnavailableMetric[] {
  const unavailable: UnavailableMetric[] = [];
  for (const row of rows) {
    const metric = row.select(metrics);
    if (metric.value === null) {
      unavailable.push({
        label: row.label,
        reason: metric.unavailableReason ?? NO_REASON_FALLBACK,
      });
    }
  }
  return unavailable;
}

function unavailableMetrics(snapshot: InstrumentSnapshot): UnavailableMetric[] {
  switch (snapshot.assetType) {
    case "stock":
      return collectUnavailable(snapshot.metrics, STOCK_METRIC_ROWS);
    case "etf":
      return collectUnavailable(snapshot.metrics, ETF_METRIC_ROWS);
    case "index":
      return collectUnavailable(snapshot.metrics, [
        ...INDEX_PERFORMANCE_ROWS,
        ...INDEX_DETAIL_ROWS,
      ]);
    default:
      return assertNever(snapshot);
  }
}

function DataAvailability({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const unavailable = unavailableMetrics(snapshot);

  return (
    <Section title="Data Availability">
      {unavailable.length === 0 ? (
        <p className="text-sm text-stone-700">
          All tracked metrics are available for this instrument.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            These metrics are unavailable. Unavailable data is never treated as
            zero and never satisfies a numeric filter.
          </p>
          <ul className="space-y-2">
            {unavailable.map((metric) => (
              <li key={metric.label} className="text-sm text-stone-700">
                <span className="font-medium text-stone-900">
                  {metric.label}
                </span>
                <span className="text-stone-500">{` ${MISSING_DISPLAY} `}</span>
                <span>{metric.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ common parts */

/** Prices are currency; an index level is a plain number, never money. */
function formatPriceOrLevel(snapshot: InstrumentSnapshot): string {
  const value = snapshot.quote?.price ?? null;
  return snapshot.assetType === "index"
    ? formatIndexLevel(value)
    : formatCurrency(value, snapshot.instrument.currency);
}

function priceOrLevelLabel(snapshot: InstrumentSnapshot): string {
  return snapshot.assetType === "index" ? "Level" : "Price";
}

function DetailHeader({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const { instrument, quote } = snapshot;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              {instrument.symbol}
            </h1>
            <span className="rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase">
              {ASSET_TYPE_LABEL[snapshot.assetType]}
            </span>
          </div>
          <p className="text-sm text-stone-700">{instrument.name}</p>
          {instrument.nativeName ? (
            <p lang="ja" className="text-sm text-stone-500">
              {instrument.nativeName}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-xs text-stone-500">
            {priceOrLevelLabel(snapshot)}
          </p>
          <p className="text-xl text-stone-900 tabular-nums">
            {formatPriceOrLevel(snapshot)}
          </p>
          <WatchlistButton
            instrumentId={instrument.id}
            symbol={instrument.symbol}
            name={instrument.name}
            assetType={instrument.assetType}
            size="detail"
          />
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <FactRow
          label="Listing Market"
          value={MARKET_LABEL[instrument.listingMarket]}
        />
        <FactRow label="Exchange" value={instrument.exchangeName} />
        <FactRow label="Currency" value={instrument.currency} />
        <FactRow label="As of" value={formatDate(quote?.asOf ?? null)} />
      </dl>

      {snapshot.assetType === "index" ? (
        <p className="rounded-md border border-stone-300 bg-stone-50 px-4 py-2 text-sm text-stone-700">
          {NOT_TRADABLE_NOTE}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------- asset-type views */

function TradableOverview({
  snapshot,
}: {
  snapshot: StockSnapshot | EtfSnapshot;
}) {
  const { instrument, quote } = snapshot;
  const currency = instrument.currency;

  return (
    <Section title="Overview">
      <dl className={GRID_CLASS}>
        <FactRow
          label="Previous Close"
          numeric
          value={formatCurrency(quote?.previousClose ?? null, currency)}
        />
        <FactRow
          label="Day Change"
          numeric
          value={formatSignedPercent(quote?.dayChangePercent ?? null)}
        />
        <FactRow
          label="52-Week High"
          numeric
          value={formatCurrency(quote?.fiftyTwoWeekHigh ?? null, currency)}
        />
        <FactRow
          label="52-Week Low"
          numeric
          value={formatCurrency(quote?.fiftyTwoWeekLow ?? null, currency)}
        />
        {snapshot.assetType === "stock" ? (
          <>
            <FactRow
              label="Market Cap"
              numeric
              value={formatCompactCurrency(quote?.marketCap ?? null, currency)}
            />
            <FactRow
              label="Average Volume"
              numeric
              value={formatCompactNumber(quote?.averageVolume ?? null)}
            />
            <FactRow
              label="Sector"
              value={instrument.sector ?? MISSING_DISPLAY}
            />
            <FactRow
              label="Industry"
              value={instrument.industry ?? MISSING_DISPLAY}
            />
          </>
        ) : null}
      </dl>
    </Section>
  );
}

function StockSections({ snapshot }: { snapshot: StockSnapshot }) {
  return (
    <>
      <TradableOverview snapshot={snapshot} />
      <Section title="Key Metrics">
        <MetricGrid
          metrics={snapshot.metrics}
          rows={STOCK_METRIC_ROWS}
          currency={snapshot.instrument.currency}
        />
      </Section>
    </>
  );
}

/** Leveraged/inverse flags are boolean | null: unknown is not "No". */
function booleanLabel(value: boolean | null): string {
  if (value === null) return "Unknown";
  return value ? "Yes" : "No";
}

function EtfSections({ snapshot }: { snapshot: EtfSnapshot }) {
  const { metrics, instrument } = snapshot;
  const fundDetails: ReadonlyArray<{ label: string; value: string }> = [
    ...(metrics.issuer === undefined
      ? []
      : [{ label: "Issuer", value: metrics.issuer }]),
    ...(metrics.category === undefined
      ? []
      : [{ label: "Category", value: metrics.category }]),
    ...(metrics.trackingIndex === undefined
      ? []
      : [{ label: "Tracking Index", value: metrics.trackingIndex }]),
  ];

  return (
    <>
      <TradableOverview snapshot={snapshot} />

      <Section title="Fund Details">
        {fundDetails.length === 0 ? (
          <p className="text-sm text-stone-600">
            No fund details are available for this ETF.
          </p>
        ) : (
          <dl className={GRID_CLASS}>
            {fundDetails.map((detail) => (
              <FactRow
                key={detail.label}
                label={detail.label}
                value={detail.value}
              />
            ))}
          </dl>
        )}
      </Section>

      <Section title="Cost and Size">
        <MetricGrid
          metrics={metrics}
          rows={ETF_METRIC_ROWS}
          currency={instrument.currency}
        />
      </Section>

      <Section title="Exposure">
        <dl className={GRID_CLASS}>
          <FactRow
            label="Regions"
            value={
              metrics.exposureRegions.length > 0
                ? metrics.exposureRegions.join(", ")
                : MISSING_DISPLAY
            }
          />
          <FactRow
            label="Sectors"
            value={
              metrics.exposureSectors.length > 0
                ? metrics.exposureSectors.join(", ")
                : MISSING_DISPLAY
            }
          />
        </dl>
        <p className="text-xs text-stone-500">
          {`Listed in ${MARKET_LABEL[instrument.listingMarket]}. `}
          A listing market is not the same as investment exposure — the regions
          and sectors above describe what the fund invests in.
        </p>
      </Section>

      <Section title="Risk Characteristics">
        <dl className={GRID_CLASS}>
          <FactRow label="Leveraged" value={booleanLabel(metrics.isLeveraged)} />
          <FactRow label="Inverse" value={booleanLabel(metrics.isInverse)} />
          {metrics.leverageFactor === null ? null : (
            <FactRow
              label="Leverage Factor"
              numeric
              value={formatRatio(metrics.leverageFactor)}
            />
          )}
        </dl>
      </Section>
    </>
  );
}

function IndexSections({ snapshot }: { snapshot: IndexSnapshot }) {
  const { metrics, quote, instrument } = snapshot;

  return (
    <>
      <Section title="Overview">
        <dl className={GRID_CLASS}>
          <FactRow
            label="Previous Level"
            numeric
            value={formatIndexLevel(quote?.previousClose ?? null)}
          />
          <FactRow
            label="Day Change"
            numeric
            value={formatSignedPercent(quote?.dayChangePercent ?? null)}
          />
          <FactRow
            label="52-Week High"
            numeric
            value={formatIndexLevel(quote?.fiftyTwoWeekHigh ?? null)}
          />
          <FactRow
            label="52-Week Low"
            numeric
            value={formatIndexLevel(quote?.fiftyTwoWeekLow ?? null)}
          />
        </dl>
        <p className="text-xs text-stone-500">
          An index level is a benchmark reading, not a share price.
        </p>
      </Section>

      <Section title="Performance">
        <MetricGrid
          metrics={metrics}
          rows={INDEX_PERFORMANCE_ROWS}
          currency={instrument.currency}
        />
      </Section>

      <Section title="Index Details">
        <dl className={GRID_CLASS}>
          <FactRow
            label="Constituents"
            numeric
            value={formatCompactNumber(metrics.constituentCount.value)}
          />
        </dl>
        {metrics.methodologySummary === undefined ? null : (
          <p className="text-sm leading-relaxed text-stone-700">
            {metrics.methodologySummary}
          </p>
        )}
      </Section>
    </>
  );
}

function AssetSections({ snapshot }: { snapshot: InstrumentSnapshot }) {
  switch (snapshot.assetType) {
    case "stock":
      return <StockSections snapshot={snapshot} />;
    case "etf":
      return <EtfSections snapshot={snapshot} />;
    case "index":
      return <IndexSections snapshot={snapshot} />;
    default:
      return assertNever(snapshot);
  }
}

/* ---------------------------------------------------------- provenance box */

function Provenance({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const { provenance } = snapshot;
  const providerName =
    PROVIDER_DISPLAY_NAME[provenance.provider] ?? provenance.provider;

  return (
    <Section title="Data Source">
      <dl className={GRID_CLASS}>
        <FactRow label="Provider" value={providerName} />
        <FactRow label="Data as of" value={formatDate(provenance.asOf)} />
        <FactRow
          label="Delivery"
          value={provenance.isDelayed ? "Delayed" : "Not marked delayed"}
        />
      </dl>

      {provenance.isDemo ? (
        <p className="text-sm font-medium text-stone-800">{DEMO_NOTICE}</p>
      ) : null}

      {provenance.warnings.length > 0 ? (
        <ul className="space-y-1">
          {provenance.warnings.map((warning) => (
            <li key={warning} className="text-xs text-stone-600">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------- route */

export default async function InstrumentDetailPage({
  params,
}: {
  params: Promise<{ instrumentId: string }>;
}) {
  const { instrumentId } = await params;

  let snapshot: InstrumentSnapshot | null;
  try {
    snapshot = await getDiscoveryInstrument(instrumentId);
  } catch (error) {
    // A malformed ID is indistinguishable from an unknown one to the user.
    if (error instanceof MarketDataError && error.code === "INVALID_REQUEST") {
      notFound();
    }
    throw error;
  }

  if (snapshot === null) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link
        href="/discover"
        className="inline-block rounded-sm text-sm text-stone-600 transition-colors hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to Discover
      </Link>

      <DetailHeader snapshot={snapshot} />

      <AssetSections snapshot={snapshot} />

      <DataAvailability snapshot={snapshot} />

      <Provenance snapshot={snapshot} />
    </div>
  );
}
