"use client";

import {
  isIndexSortField,
  type IndexSortField,
  type SortDirection,
} from "@/lib/discovery/index-sort";

/**
 * D4 index sort control. Rendered only on the Indices tab — indices are
 * ordered by return, never scored. The default is no sort, which keeps the
 * provider's natural order.
 */

const NATURAL_ORDER_VALUE = "natural";

const FIELD_OPTIONS: ReadonlyArray<{ value: IndexSortField; label: string }> = [
  { value: "oneMonthReturn", label: "1-month return" },
  { value: "yearToDateReturn", label: "Year-to-date return" },
  { value: "oneYearReturn", label: "1-year return" },
];

const DIRECTION_OPTIONS: ReadonlyArray<{
  value: SortDirection;
  label: string;
}> = [
  { value: "desc", label: "Highest first" },
  { value: "asc", label: "Lowest first" },
];

const SELECT_CLASS =
  "rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

export interface IndexSortSelection {
  field: IndexSortField;
  direction: SortDirection;
}

export interface IndexSortControlProps {
  /** The sort currently reflected in the URL; null means natural order. */
  value: IndexSortSelection | null;
  onChange: (value: IndexSortSelection | null) => void;
}

export function IndexSortControl({ value, onChange }: IndexSortControlProps) {
  function handleFieldChange(raw: string) {
    if (!isIndexSortField(raw)) {
      onChange(null);
      return;
    }
    if (value !== null && value.field === raw) return;
    onChange({ field: raw, direction: value?.direction ?? "desc" });
  }

  function handleDirectionChange(raw: string) {
    if (value === null) return;
    const direction: SortDirection = raw === "asc" ? "asc" : "desc";
    if (direction === value.direction) return;
    onChange({ field: value.field, direction });
  }

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-md border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <label
          htmlFor="index-sort-field"
          className="text-xs font-medium text-stone-700"
        >
          Sort by
        </label>
        <select
          id="index-sort-field"
          value={value?.field ?? NATURAL_ORDER_VALUE}
          onChange={(event) => handleFieldChange(event.target.value)}
          aria-describedby="index-sort-note"
          className={SELECT_CLASS}
        >
          <option value={NATURAL_ORDER_VALUE}>Natural order</option>
          {FIELD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {value === null ? null : (
        <div className="flex items-center gap-2">
          <label
            htmlFor="index-sort-direction"
            className="text-xs font-medium text-stone-700"
          >
            Order
          </label>
          <select
            id="index-sort-direction"
            value={value.direction}
            onChange={(event) => handleDirectionChange(event.target.value)}
            className={SELECT_CLASS}
          >
            {DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <p id="index-sort-note" className="text-[11px] text-stone-500">
        Indices with an unavailable return are listed last in either order.
      </p>
    </div>
  );
}
