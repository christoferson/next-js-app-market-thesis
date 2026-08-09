import type { IndexSnapshot } from "@/lib/domain";

/**
 * D4 index sorting (SPEC §D4 index scope): return-based sorting for the
 * Indices tab. Null values sort last in both directions (SPEC §6.9); ties
 * break by symbol for determinism.
 */
export const INDEX_SORT_FIELDS = [
  "oneMonthReturn",
  "yearToDateReturn",
  "oneYearReturn",
] as const;

export type IndexSortField = (typeof INDEX_SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export function isIndexSortField(value: string): value is IndexSortField {
  return (INDEX_SORT_FIELDS as readonly string[]).includes(value);
}

export function sortIndexSnapshots(
  snapshots: readonly IndexSnapshot[],
  field: IndexSortField,
  direction: SortDirection
): IndexSnapshot[] {
  const sign = direction === "asc" ? 1 : -1;

  return [...snapshots].sort((a, b) => {
    const aValue = a.metrics[field].value;
    const bValue = b.metrics[field].value;

    if (aValue === null && bValue === null) {
      return a.instrument.symbol.localeCompare(b.instrument.symbol);
    }
    if (aValue === null || !Number.isFinite(aValue)) return 1;
    if (bValue === null || !Number.isFinite(bValue)) return -1;
    if (aValue !== bValue) return (aValue - bValue) * sign;
    return a.instrument.symbol.localeCompare(b.instrument.symbol);
  });
}
