"use client";

import { useEffect, useState } from "react";

import type { StockSnapshot, SupportedMarket } from "@/lib/domain";
import type { StockFilters } from "@/lib/screener/filter";
import type { MatchExplanation, StrategyScore } from "@/lib/screener/types";
import { FINANCIAL_EXCLUSION_EXPLANATION } from "@/lib/screener/evaluate";
import { qualityReasonablePriceV1 } from "@/lib/screener/strategies/quality-reasonable-price-v1";
import {
  DiscoveryControls,
  type DiscoveryControlsProps,
} from "@/components/discovery/discovery-controls";
import { Pagination } from "@/components/discovery/pagination";
import {
  ScreenerResultCards,
  ScreenerResultsTable,
  type ScreenerRow,
} from "./screener-results-table";

/** The only strategy available in D3; the API accepts this exact id. */
const STRATEGY_ID = "quality-reasonable-price-v1";
const STRATEGY_LABEL = `${qualityReasonablePriceV1.displayName} — v${qualityReasonablePriceV1.version}`;
const PAGE_SIZE = 25;

const SORT_FIELDS = ["strategyScore", "marketCap"] as const;
type SortField = (typeof SORT_FIELDS)[number];
type SortDirection = "asc" | "desc";

const SORT_FIELD_OPTIONS: ReadonlyArray<{ value: SortField; label: string }> = [
  { value: "strategyScore", label: "Strategy match" },
  { value: "marketCap", label: "Market cap" },
];

const SORT_DIRECTION_OPTIONS: ReadonlyArray<{
  value: SortDirection;
  label: string;
}> = [
  { value: "desc", label: "Highest first" },
  { value: "asc", label: "Lowest first" },
];

/* ------------------------------------------------------------ API contract */

interface ScreenSort {
  field: SortField;
  direction: SortDirection;
}

interface ScreenRequestBody {
  assetType: "stock";
  market?: SupportedMarket;
  query?: string;
  strategyId: typeof STRATEGY_ID;
  filters: StockFilters;
  sort: ScreenSort;
  page: number;
  pageSize: number;
}

interface ScreenResponseItem {
  snapshot: StockSnapshot;
  score: StrategyScore;
  explanation: MatchExplanation;
}

interface ScreenResponse {
  data: ScreenResponseItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
  summary: {
    ineligibleCount: number;
    excludedForMissingDataCount: number;
    filteredOutCount: number;
    eligibilityExplanation: string;
  };
}

/** The last completed screen, tagged with the request it answered. */
type ScreenOutcome =
  | { requestKey: string; status: "ok"; response: ScreenResponse }
  | { requestKey: string; status: "error"; message: string };

/**
 * The screen endpoint is an external boundary for the browser too: validate
 * the envelope shape before reading it rather than trusting the cast.
 */
function isScreenResponse(value: unknown): value is ScreenResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const { data, pagination, summary } = candidate;
  return (
    Array.isArray(data) &&
    typeof pagination === "object" &&
    pagination !== null &&
    typeof summary === "object" &&
    summary !== null
  );
}

/** Read the API's readable error message; never surface raw internals. */
function errorMessageFrom(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null) return null;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : null;
}

/* ---------------------------------------------------------------- filters */

type NumericFilterKey = Exclude<keyof StockFilters, "positiveFreeCashFlowOnly">;

interface NumericFilterField {
  key: NumericFilterKey;
  label: string;
  hint: string;
  step: string;
  /** Bounds in the units the user types, matching the API's accepted range. */
  minimum: number;
  maximum: number;
  exclusiveMinimum?: boolean;
  /** Input units → stored units (percent → decimal, billions → absolute). */
  scale: number;
}

const NUMERIC_FILTER_FIELDS: readonly NumericFilterField[] = [
  {
    key: "minimumMarketCap",
    label: "Minimum market cap (billions)",
    hint: "In the instrument's own currency. 10 means 10 billion.",
    step: "0.1",
    minimum: 0,
    maximum: 100000,
    scale: 1e9,
  },
  {
    key: "minimumRevenueGrowth",
    label: "Minimum revenue growth (%)",
    hint: "Whole percent. 10 means 10%.",
    step: "0.1",
    minimum: -100,
    maximum: 1000,
    scale: 0.01,
  },
  {
    key: "maximumPeRatio",
    label: "Maximum P/E",
    hint: "A plain ratio, for example 25.",
    step: "0.1",
    minimum: 0,
    maximum: 10000,
    exclusiveMinimum: true,
    scale: 1,
  },
  {
    key: "minimumFreeCashFlowYield",
    label: "Minimum free-cash-flow yield (%)",
    hint: "Whole percent. 5 means 5%.",
    step: "0.1",
    minimum: -100,
    maximum: 100,
    scale: 0.01,
  },
  {
    key: "maximumDebtToEquity",
    label: "Maximum debt-to-equity",
    hint: "A plain ratio, for example 1.5.",
    step: "0.1",
    minimum: 0,
    maximum: 1000,
    scale: 1,
  },
];

type FilterDraft = Record<NumericFilterKey, string> & {
  positiveFreeCashFlowOnly: boolean;
};

const EMPTY_DRAFT: FilterDraft = {
  minimumMarketCap: "",
  minimumRevenueGrowth: "",
  maximumPeRatio: "",
  minimumFreeCashFlowYield: "",
  maximumDebtToEquity: "",
  positiveFreeCashFlowOnly: false,
};

type FieldErrors = Partial<Record<NumericFilterKey, string>>;

interface DraftParseResult {
  filters: StockFilters;
  fieldErrors: FieldErrors;
}

/**
 * Empty inputs mean "filter not active" and are never sent. Out-of-range or
 * non-numeric input is reported per field instead of being coerced — a filter
 * value is never silently changed.
 */
function parseDraft(draft: FilterDraft): DraftParseResult {
  const filters: StockFilters = {};
  const fieldErrors: FieldErrors = {};

  for (const field of NUMERIC_FILTER_FIELDS) {
    const raw = draft[field.key].trim();
    if (raw === "") continue;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      fieldErrors[field.key] = "Enter a number, or leave this empty.";
      continue;
    }
    const belowMinimum = field.exclusiveMinimum
      ? parsed <= field.minimum
      : parsed < field.minimum;
    if (belowMinimum || parsed > field.maximum) {
      fieldErrors[field.key] = field.exclusiveMinimum
        ? `Enter a value above ${field.minimum} and up to ${field.maximum}.`
        : `Enter a value between ${field.minimum} and ${field.maximum}.`;
      continue;
    }

    filters[field.key] = parsed * field.scale;
  }

  if (draft.positiveFreeCashFlowOnly) {
    filters.positiveFreeCashFlowOnly = true;
  }

  return { filters, fieldErrors };
}

/* ----------------------------------------------------------------- summary */

function stockCount(count: number): string {
  return count === 1 ? "1 stock" : `${count} stocks`;
}

function summaryLines(summary: ScreenResponse["summary"]): string[] {
  const lines: string[] = [];
  if (summary.ineligibleCount > 0) {
    lines.push(
      `${stockCount(summary.ineligibleCount)} excluded: the strategy does not cover their sector.`
    );
  }
  if (summary.excludedForMissingDataCount > 0) {
    lines.push(
      `${summary.excludedForMissingDataCount} excluded because required filter data was unavailable.`
    );
  }
  if (summary.filteredOutCount > 0) {
    lines.push(
      `${summary.filteredOutCount} did not match the active filters.`
    );
  }
  return lines;
}

/* -------------------------------------------------------------- component */

const INPUT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 tabular-nums placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";
const SELECT_CLASS =
  "rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const SECONDARY_BUTTON_CLASS =
  "rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

export type StockScreenerProps = Omit<
  DiscoveryControlsProps,
  "childOwnsResults"
>;

/**
 * Stocks-tab screener (D3). The URL keeps asset type, market, search and the
 * unscreened page (D2); the strategy toggle, filters, sort and screened page
 * are client state only, so switching tabs or reloading returns to the plain
 * list view. When the strategy is enabled this component owns the results
 * region: results come from POST /api/discovery/screen, where all scoring
 * happens server-side.
 */
export function StockScreener({
  state,
  pagination,
  meta,
  children,
}: StockScreenerProps) {
  const [isStrategyEnabled, setIsStrategyEnabled] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [appliedFilters, setAppliedFilters] = useState<StockFilters>({});
  const [sort, setSort] = useState<ScreenSort>({
    field: "strategyScore",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  const [outcome, setOutcome] = useState<ScreenOutcome | null>(null);

  // Market and search live in the URL; when they change, the screened page
  // must restart at 1. Adjusting during render (rather than in an effect)
  // avoids a request for a page that no longer applies.
  const scopeKey = `${state.market ?? "all"}|${state.query}`;
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey);
  if (lastScopeKey !== scopeKey) {
    setLastScopeKey(scopeKey);
    setPage(1);
  }

  const requestBody: ScreenRequestBody = {
    assetType: "stock",
    ...(state.market === undefined ? {} : { market: state.market }),
    ...(state.query === "" ? {} : { query: state.query }),
    strategyId: STRATEGY_ID,
    filters: appliedFilters,
    sort,
    page,
    pageSize: PAGE_SIZE,
  };
  // Identifies the request the UI is currently asking for; the loading state
  // is derived by comparing it with the request the last result came from, so
  // no loading flag has to be set from inside the effect.
  const requestKey = `${reloadToken}|${JSON.stringify(requestBody)}`;

  useEffect(() => {
    if (!isStrategyEnabled) return;

    const controller = new AbortController();

    async function run(): Promise<void> {
      try {
        const httpResponse = await fetch("/api/discovery/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const payload: unknown = await httpResponse
          .json()
          .catch((): unknown => null);

        if (controller.signal.aborted) return;

        if (!httpResponse.ok) {
          setOutcome({
            requestKey,
            status: "error",
            message:
              errorMessageFrom(payload) ??
              "The screen could not be completed. Please try again.",
          });
        } else if (!isScreenResponse(payload)) {
          setOutcome({
            requestKey,
            status: "error",
            message:
              "The screen returned an unexpected response. Please try again.",
          });
        } else {
          setOutcome({ requestKey, status: "ok", response: payload });
        }
      } catch {
        if (controller.signal.aborted) return;
        setOutcome({
          requestKey,
          status: "error",
          message:
            "The screen could not be reached. Check your connection and try again.",
        });
      }
    }

    void run();
    return () => {
      controller.abort();
    };
    // requestKey covers every value in requestBody, including reloadToken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStrategyEnabled, requestKey]);

  function handleStrategyToggle(enabled: boolean) {
    setIsStrategyEnabled(enabled);
    setPage(1);
    setOutcome(null);
  }

  function handleApply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    setFieldErrors(parsed.fieldErrors);
    if (Object.keys(parsed.fieldErrors).length > 0) return;
    setAppliedFilters(parsed.filters);
    setPage(1);
  }

  function handleClear() {
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setAppliedFilters({});
    setPage(1);
  }

  function handleSortFieldChange(raw: string) {
    const field = SORT_FIELDS.find((candidate) => candidate === raw);
    if (field === undefined || field === sort.field) return;
    setSort({ ...sort, field });
    setPage(1);
  }

  function handleSortDirectionChange(raw: string) {
    const direction: SortDirection = raw === "asc" ? "asc" : "desc";
    if (direction === sort.direction) return;
    setSort({ ...sort, direction });
    setPage(1);
  }

  // A screen is in flight whenever the latest outcome is for an older request.
  const isLoading = isStrategyEnabled && outcome?.requestKey !== requestKey;
  // A stale error is dropped as soon as a retry starts, but stale results stay
  // visible (dimmed) so the table does not flash empty between screens.
  const errorMessage =
    !isLoading && outcome?.status === "error" ? outcome.message : null;
  const response = outcome?.status === "ok" ? outcome.response : null;

  const rows: readonly ScreenerRow[] =
    response?.data.map((item) => ({
      snapshot: item.snapshot,
      score: item.score,
    })) ?? [];

  const screenedTotal = response?.pagination.total ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(screenedTotal / Math.max(response?.pagination.pageSize ?? PAGE_SIZE, 1))
  );

  return (
    <DiscoveryControls
      state={state}
      pagination={pagination}
      meta={meta}
      childOwnsResults={isStrategyEnabled}
    >
      <div className="space-y-4">
        <section className="space-y-3 rounded-md border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-900">
            Screening strategy
          </h2>

          <div className="flex items-start gap-2">
            <input
              id="strategy-toggle"
              type="checkbox"
              checked={isStrategyEnabled}
              onChange={(event) => handleStrategyToggle(event.target.checked)}
              aria-describedby="strategy-description strategy-exclusion"
              className="mt-0.5 size-4 accent-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
            />
            <div className="space-y-1">
              <label
                htmlFor="strategy-toggle"
                className="text-sm font-medium text-stone-900"
              >
                {STRATEGY_LABEL}
              </label>
              <p id="strategy-description" className="text-xs text-stone-600">
                {qualityReasonablePriceV1.description}
              </p>
              <p id="strategy-exclusion" className="text-xs text-stone-500">
                {FINANCIAL_EXCLUSION_EXPLANATION}
              </p>
            </div>
          </div>

          {isStrategyEnabled ? (
            <form onSubmit={handleApply} className="space-y-4 border-t border-stone-200 pt-4">
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-stone-900">
                  Filters
                </legend>
                <p className="text-xs text-stone-500">
                  Leave a field empty to skip that filter. A stock with
                  unavailable data never passes an active filter.
                </p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {NUMERIC_FILTER_FIELDS.map((field) => {
                    const error = fieldErrors[field.key];
                    return (
                      <div key={field.key} className="space-y-1">
                        <label
                          htmlFor={`filter-${field.key}`}
                          className="block text-xs font-medium text-stone-700"
                        >
                          {field.label}
                        </label>
                        <input
                          id={`filter-${field.key}`}
                          type="number"
                          inputMode="decimal"
                          step={field.step}
                          value={draft[field.key]}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              [field.key]: event.target.value,
                            })
                          }
                          aria-describedby={
                            error === undefined
                              ? `filter-${field.key}-hint`
                              : `filter-${field.key}-hint filter-${field.key}-error`
                          }
                          aria-invalid={error === undefined ? undefined : true}
                          className={INPUT_CLASS}
                        />
                        <p
                          id={`filter-${field.key}-hint`}
                          className="text-[11px] text-stone-500"
                        >
                          {field.hint}
                        </p>
                        {error === undefined ? null : (
                          <p
                            id={`filter-${field.key}-error`}
                            className="text-[11px] font-medium text-stone-800"
                          >
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex items-start gap-2 sm:col-span-2 lg:col-span-1">
                    <input
                      id="filter-positiveFreeCashFlowOnly"
                      type="checkbox"
                      checked={draft.positiveFreeCashFlowOnly}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          positiveFreeCashFlowOnly: event.target.checked,
                        })
                      }
                      className="mt-0.5 size-4 accent-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
                    />
                    <label
                      htmlFor="filter-positiveFreeCashFlowOnly"
                      className="text-xs font-medium text-stone-700"
                    >
                      Positive free cash flow only
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    Apply filters
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Clear filters
                  </button>
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-200 pt-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="screener-sort-field"
                    className="text-xs font-medium text-stone-700"
                  >
                    Sort by
                  </label>
                  <select
                    id="screener-sort-field"
                    value={sort.field}
                    onChange={(event) =>
                      handleSortFieldChange(event.target.value)
                    }
                    className={SELECT_CLASS}
                  >
                    {SORT_FIELD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="screener-sort-direction"
                    className="text-xs font-medium text-stone-700"
                  >
                    Order
                  </label>
                  <select
                    id="screener-sort-direction"
                    value={sort.direction}
                    onChange={(event) =>
                      handleSortDirectionChange(event.target.value)
                    }
                    className={SELECT_CLASS}
                  >
                    {SORT_DIRECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          ) : null}
        </section>

        {isStrategyEnabled ? (
          <div className="space-y-4">
            <p role="status" className="min-h-5 text-xs text-stone-500">
              {isLoading
                ? "Screening stocks…"
                : errorMessage !== null || response === null
                  ? ""
                  : `${stockCount(screenedTotal)} ${
                      screenedTotal === 1 ? "matches" : "match"
                    } the selected criteria.`}
            </p>

            {errorMessage !== null ? (
              <div className="space-y-3 rounded-md border border-stone-300 bg-stone-50 p-4">
                <p className="text-sm text-stone-800">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => setReloadToken((token) => token + 1)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {errorMessage === null && response !== null ? (
              <>
                {rows.length === 0 ? (
                  <p className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
                    No stocks match the selected criteria. Widening or clearing a
                    filter may surface more research candidates.
                  </p>
                ) : (
                  <div
                    className={
                      isLoading ? "opacity-60 transition-opacity" : undefined
                    }
                  >
                    <div className="hidden md:block">
                      <ScreenerResultsTable rows={rows} />
                    </div>
                    <div className="md:hidden">
                      <ScreenerResultCards rows={rows} />
                    </div>
                  </div>
                )}

                {summaryLines(response.summary).length > 0 ? (
                  <ul className="space-y-1">
                    {summaryLines(response.summary).map((line) => (
                      <li key={line} className="text-xs text-stone-500">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-xs text-stone-500">
                  A strategy match measures alignment with the strategy&apos;s
                  criteria. It does not predict future returns.
                </p>

                {screenedTotal > 0 || page > 1 ? (
                  <Pagination
                    page={response.pagination.page}
                    totalPages={totalPages}
                    hasNextPage={response.pagination.hasNextPage}
                    onPageChange={(nextPage) => {
                      if (nextPage < 1 || nextPage === page) return;
                      setPage(nextPage);
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          children
        )}
      </div>
    </DiscoveryControls>
  );
}
