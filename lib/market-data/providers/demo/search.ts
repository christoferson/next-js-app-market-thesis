import type { InstrumentSnapshot } from "@/lib/domain";

/**
 * Normalize a search term for deterministic, case-insensitive matching.
 * Katakana/latin width differences matter for Japanese native names, so
 * NFKC-fold full-width forms before lowercasing.
 */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase().trim();
}

/**
 * Match ranking (SPEC §D2): lower rank sorts first.
 * 0 exact symbol, 1 symbol prefix, 2 exact name, 3 name prefix,
 * 4 name substring, 5 native-name substring. null = no match.
 */
export function rankMatch(
  snapshot: InstrumentSnapshot,
  normalizedQuery: string
): number | null {
  const symbol = normalizeSearchText(snapshot.instrument.symbol);
  const name = normalizeSearchText(snapshot.instrument.name);
  const nativeName = snapshot.instrument.nativeName
    ? normalizeSearchText(snapshot.instrument.nativeName)
    : null;

  if (symbol === normalizedQuery) return 0;
  if (symbol.startsWith(normalizedQuery)) return 1;
  if (name === normalizedQuery) return 2;
  if (name.startsWith(normalizedQuery)) return 3;
  if (name.includes(normalizedQuery)) return 4;
  if (nativeName !== null && nativeName.includes(normalizedQuery)) return 5;
  return null;
}

/**
 * Deterministic search: filters to matches and orders by rank, breaking ties
 * by symbol so results are stable. An empty query returns the input unchanged
 * (an empty search is not an error and not a filter).
 */
export function searchSnapshots(
  snapshots: readonly InstrumentSnapshot[],
  query: string | undefined
): InstrumentSnapshot[] {
  const normalized = query === undefined ? "" : normalizeSearchText(query);
  if (normalized === "") {
    return [...snapshots];
  }

  const ranked: Array<{ snapshot: InstrumentSnapshot; rank: number }> = [];
  for (const snapshot of snapshots) {
    const rank = rankMatch(snapshot, normalized);
    if (rank !== null) {
      ranked.push({ snapshot, rank });
    }
  }

  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.snapshot.instrument.symbol.localeCompare(b.snapshot.instrument.symbol)
  );

  return ranked.map((entry) => entry.snapshot);
}
