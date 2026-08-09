"use client";

import { useState, useSyncExternalStore } from "react";

import type { EtfFilters } from "@/lib/screener/etf-filter";

/**
 * D4 ETF filter panel. Rendered only on the ETFs tab, so fund filters can
 * never be applied to stocks or indices.
 *
 * D6: below the `md` breakpoint the fields collapse behind a "Filters"
 * disclosure so the results stay visible on a phone; from `md` up the fields
 * are always shown and the disclosure button is not rendered at all, so
 * `aria-expanded` is never announced for a region that cannot collapse.
 *
 * Filter state lives in the URL (like every D2+ Discovery control): applying
 * navigates, and the panel repopulates from the `filters` prop, so back,
 * forward and refresh restore what the user selected.
 *
 * Units: the user types percentages and billions; the domain stores decimals
 * and absolute amounts. An empty field means "filter not active" and is never
 * sent — a blank input is not the same as zero.
 */

type NumericFilterKey =
  | "maximumExpenseRatio"
  | "minimumAssetsUnderManagement"
  | "minimumAverageVolume"
  | "minimumDividendYield";

interface NumericFilterField {
  key: NumericFilterKey;
  label: string;
  hint: string;
  step: string;
  /** Bounds in the units the user types. */
  minimum: number;
  maximum: number;
  /** Input units → stored units (percent → decimal, billions → absolute). */
  scale: number;
}

/**
 * Percent maxima are 100 because the URL and API accept a decimal fraction of
 * at most 1; rejecting the input is better than serializing a value that would
 * be silently dropped on the next page load.
 */
const NUMERIC_FILTER_FIELDS: readonly NumericFilterField[] = [
  {
    key: "maximumExpenseRatio",
    label: "Maximum expense ratio (%)",
    hint: "Whole percent. 0.5 means 0.5%.",
    step: "0.01",
    minimum: 0,
    maximum: 100,
    scale: 0.01,
  },
  {
    key: "minimumAssetsUnderManagement",
    label: "Minimum AUM (billions)",
    hint: "In the fund's native currency. 1 means 1 billion.",
    step: "0.1",
    minimum: 0,
    maximum: 1_000_000,
    scale: 1e9,
  },
  {
    key: "minimumAverageVolume",
    label: "Minimum average volume (shares)",
    hint: "A plain share count, for example 500000.",
    step: "1000",
    minimum: 0,
    maximum: 1e12,
    scale: 1,
  },
  {
    key: "minimumDividendYield",
    label: "Minimum dividend yield (%)",
    hint: "Whole percent. 2 means 2%.",
    step: "0.1",
    minimum: 0,
    maximum: 100,
    scale: 0.01,
  },
];

type FilterDraft = Record<NumericFilterKey, string> & {
  category: string;
  exposureRegion: string;
  excludeLeveraged: boolean;
  excludeInverse: boolean;
};

type FieldErrors = Partial<Record<NumericFilterKey, string>>;

/**
 * Unit conversions are rounded to 12 significant digits so binary
 * floating-point noise never reaches the URL (0.15% → 0.0015, not
 * 0.0015000000000000002). This changes no comparison outcome at the
 * precision financial data is reported in.
 */
function rescale(value: number, scale: number): number {
  return scale === 1 ? value : Number((value * scale).toPrecision(12));
}

function toInputUnits(value: number | undefined, scale: number): string {
  if (value === undefined) return "";
  return String(rescale(value, 1 / scale));
}

function draftFromFilters(filters: EtfFilters): FilterDraft {
  const draft: FilterDraft = {
    category: filters.category ?? "",
    exposureRegion: filters.exposureRegion ?? "",
    maximumExpenseRatio: "",
    minimumAssetsUnderManagement: "",
    minimumAverageVolume: "",
    minimumDividendYield: "",
    excludeLeveraged: filters.excludeLeveraged === true,
    excludeInverse: filters.excludeInverse === true,
  };
  for (const field of NUMERIC_FILTER_FIELDS) {
    draft[field.key] = toInputUnits(filters[field.key], field.scale);
  }
  return draft;
}

/** Identifies the applied filter set, so a URL change re-seeds the inputs. */
function filtersKey(filters: EtfFilters): string {
  return [
    filters.category ?? "",
    filters.exposureRegion ?? "",
    filters.maximumExpenseRatio ?? "",
    filters.minimumAssetsUnderManagement ?? "",
    filters.minimumAverageVolume ?? "",
    filters.minimumDividendYield ?? "",
    filters.excludeLeveraged === true ? "1" : "",
    filters.excludeInverse === true ? "1" : "",
  ].join("|");
}

/**
 * Out-of-range or non-numeric input is reported per field rather than being
 * coerced, so a filter value is never silently changed.
 */
function parseDraft(draft: FilterDraft): {
  filters: EtfFilters;
  fieldErrors: FieldErrors;
} {
  const filters: EtfFilters = {};
  const fieldErrors: FieldErrors = {};

  if (draft.category !== "") filters.category = draft.category;
  if (draft.exposureRegion !== "") filters.exposureRegion = draft.exposureRegion;

  for (const field of NUMERIC_FILTER_FIELDS) {
    const raw = draft[field.key].trim();
    if (raw === "") continue;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      fieldErrors[field.key] = "Enter a number, or leave this empty.";
      continue;
    }
    if (parsed < field.minimum || parsed > field.maximum) {
      fieldErrors[field.key] =
        `Enter a value between ${field.minimum} and ${field.maximum}.`;
      continue;
    }

    filters[field.key] = rescale(parsed, field.scale);
  }

  if (draft.excludeLeveraged) filters.excludeLeveraged = true;
  if (draft.excludeInverse) filters.excludeInverse = true;

  return { filters, fieldErrors };
}

/** Keep a hand-entered URL value selectable even if it is not a known option. */
function optionsWith(
  options: readonly string[],
  selected: string
): readonly string[] {
  if (selected === "" || options.includes(selected)) return options;
  return [...options, selected];
}

const INPUT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 tabular-nums placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";
const SELECT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const SECONDARY_BUTTON_CLASS =
  "rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const LABEL_CLASS = "block text-xs font-medium text-stone-700";
const HINT_CLASS = "text-[11px] text-stone-600";
const DISCLOSURE_BUTTON_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const FIELDS_ID = "etf-filter-fields";

/** Matches Tailwind's `md` breakpoint, which owns the layout switch. */
const DESKTOP_QUERY = "(min-width: 48rem)";

function subscribeToDesktopQuery(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/**
 * Whether the viewport is at or above `md`. Collapsed fields are unmounted
 * rather than merely hidden, so a phone user never tabs through eight form
 * controls that are not on screen; that requires knowing the breakpoint in JS.
 *
 * The server snapshot is `true`, so server-rendered and no-JS output always
 * contains the full field set — the panel degrades to the D4 always-open form
 * instead of becoming unreachable.
 */
function useIsDesktopViewport(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopQuery,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  );
}

export interface EtfFilterPanelProps {
  /** The filter set currently reflected in the URL. */
  filters: EtfFilters;
  /** Distinct fund categories in the ETF universe, derived server-side. */
  categories: readonly string[];
  /** Distinct exposure regions in the ETF universe, derived server-side. */
  exposureRegions: readonly string[];
  onApply: (filters: EtfFilters) => void;
}

export function EtfFilterPanel({
  filters,
  categories,
  exposureRegions,
  onApply,
}: EtfFilterPanelProps) {
  const [draft, setDraft] = useState<FilterDraft>(() =>
    draftFromFilters(filters)
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const isDesktop = useIsDesktopViewport();
  const [isOpen, setIsOpen] = useState(false);

  // Re-seed the inputs when the URL's filters change from outside this panel
  // (back/forward, or a shared link). Adjusting during render rather than in an
  // effect avoids rendering one frame of stale controls.
  const appliedKey = filtersKey(filters);
  const [lastAppliedKey, setLastAppliedKey] = useState(appliedKey);
  if (lastAppliedKey !== appliedKey) {
    setLastAppliedKey(appliedKey);
    setDraft(draftFromFilters(filters));
    setFieldErrors({});
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    setFieldErrors(parsed.fieldErrors);
    if (Object.keys(parsed.fieldErrors).length > 0) return;
    onApply(parsed.filters);
  }

  function handleClear() {
    setFieldErrors({});
    onApply({});
  }

  const categoryOptions = optionsWith(categories, draft.category);
  const regionOptions = optionsWith(exposureRegions, draft.exposureRegion);
  const activeCount = Object.keys(filters).length;
  const areFieldsVisible = isDesktop || isOpen;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-stone-200 bg-white p-4"
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-stone-900">
          ETF filters
        </legend>

        {isDesktop ? null : (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={FIELDS_ID}
            onClick={() => setIsOpen(!isOpen)}
            className={DISCLOSURE_BUTTON_CLASS}
          >
            <span className="flex items-center gap-2">
              Filters
              {activeCount > 0 ? (
                <span className="rounded-sm border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
                  {`${activeCount} active`}
                </span>
              ) : null}
            </span>
            <span className="text-xs font-normal text-stone-600">
              {isOpen ? "Hide" : "Show"}
            </span>
          </button>
        )}

        {areFieldsVisible ? (
          <div id={FIELDS_ID} className="space-y-3">
            <p className="text-xs text-stone-600">
              Leave a field empty to skip that filter. A fund with unavailable data
              never passes an active filter, and a fund whose leveraged or inverse
              status is unknown does not pass an exclusion.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="etf-filter-category" className={LABEL_CLASS}>
                  Category
                </label>
                <select
                  id="etf-filter-category"
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                  className={SELECT_CLASS}
                >
                  <option value="">Any category</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="etf-filter-region" className={LABEL_CLASS}>
                  Exposure region
                </label>
                <select
                  id="etf-filter-region"
                  value={draft.exposureRegion}
                  onChange={(event) =>
                    setDraft({ ...draft, exposureRegion: event.target.value })
                  }
                  aria-describedby="etf-filter-region-hint"
                  className={SELECT_CLASS}
                >
                  <option value="">Any region</option>
                  {regionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p id="etf-filter-region-hint" className={HINT_CLASS}>
                  Where the fund invests, not where it is listed.
                </p>
              </div>

              {NUMERIC_FILTER_FIELDS.map((field) => {
                const error = fieldErrors[field.key];
                const hintId = `etf-filter-${field.key}-hint`;
                const errorId = `etf-filter-${field.key}-error`;
                return (
                  <div key={field.key} className="space-y-1">
                    <label
                      htmlFor={`etf-filter-${field.key}`}
                      className={LABEL_CLASS}
                    >
                      {field.label}
                    </label>
                    <input
                      id={`etf-filter-${field.key}`}
                      type="number"
                      inputMode="decimal"
                      step={field.step}
                      value={draft[field.key]}
                      onChange={(event) =>
                        setDraft({ ...draft, [field.key]: event.target.value })
                      }
                      aria-describedby={
                        error === undefined ? hintId : `${hintId} ${errorId}`
                      }
                      aria-invalid={error === undefined ? undefined : true}
                      className={INPUT_CLASS}
                    />
                    <p id={hintId} className={HINT_CLASS}>
                      {field.hint}
                    </p>
                    {error === undefined ? null : (
                      <p
                        id={errorId}
                        className="text-[11px] font-medium text-stone-800"
                      >
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <div className="flex items-start gap-2">
                  <input
                    id="etf-filter-excludeLeveraged"
                    type="checkbox"
                    checked={draft.excludeLeveraged}
                    onChange={(event) =>
                      setDraft({ ...draft, excludeLeveraged: event.target.checked })
                    }
                    className="mt-0.5 size-4 accent-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
                  />
                  <label
                    htmlFor="etf-filter-excludeLeveraged"
                    className="text-xs font-medium text-stone-700"
                  >
                    Exclude leveraged ETFs
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="etf-filter-excludeInverse"
                    type="checkbox"
                    checked={draft.excludeInverse}
                    onChange={(event) =>
                      setDraft({ ...draft, excludeInverse: event.target.checked })
                    }
                    className="mt-0.5 size-4 accent-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
                  />
                  <label
                    htmlFor="etf-filter-excludeInverse"
                    className="text-xs font-medium text-stone-700"
                  >
                    Exclude inverse ETFs
                  </label>
                </div>
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
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
