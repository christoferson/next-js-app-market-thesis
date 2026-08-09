import type { AssetType } from "@/lib/domain";

export const WATCHLIST_STORAGE_KEY = "market-thesis.watchlist.v1";

/**
 * One saved instrument: the stable ID plus minimal display fallback so the
 * watchlist page can render something if the instrument becomes unavailable.
 * Never store full snapshots, provider responses, or metric histories.
 */
export interface WatchlistEntry {
  instrumentId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  addedAt: string;
}

const ASSET_TYPES = new Set<string>(["stock", "etf", "index"]);

function isWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.instrumentId === "string" &&
    entry.instrumentId.length > 0 &&
    typeof entry.symbol === "string" &&
    typeof entry.name === "string" &&
    typeof entry.assetType === "string" &&
    ASSET_TYPES.has(entry.assetType) &&
    typeof entry.addedAt === "string"
  );
}

/**
 * Parse raw localStorage text into valid entries. Malformed JSON, non-array
 * payloads, invalid entries, and duplicate IDs are dropped silently — a
 * corrupted watchlist must never crash the application.
 */
export function parseWatchlist(rawText: string | null): WatchlistEntry[] {
  if (rawText === null || rawText === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const entries: WatchlistEntry[] = [];
  for (const candidate of parsed) {
    if (isWatchlistEntry(candidate) && !seen.has(candidate.instrumentId)) {
      seen.add(candidate.instrumentId);
      entries.push(candidate);
    }
  }
  return entries;
}

export function serializeWatchlist(entries: readonly WatchlistEntry[]): string {
  return JSON.stringify(entries);
}

export function addEntry(
  entries: readonly WatchlistEntry[],
  entry: WatchlistEntry
): WatchlistEntry[] {
  if (entries.some((e) => e.instrumentId === entry.instrumentId)) {
    return [...entries];
  }
  return [...entries, entry];
}

export function removeEntry(
  entries: readonly WatchlistEntry[],
  instrumentId: string
): WatchlistEntry[] {
  return entries.filter((e) => e.instrumentId !== instrumentId);
}

export function hasEntry(
  entries: readonly WatchlistEntry[],
  instrumentId: string
): boolean {
  return entries.some((e) => e.instrumentId === instrumentId);
}
