"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  WATCHLIST_STORAGE_KEY,
  parseWatchlist,
  serializeWatchlist,
  addEntry,
  removeEntry,
  hasEntry,
  type WatchlistEntry,
} from "./storage";

/**
 * Browser-local watchlist state shared across components via a module-level
 * store synced to localStorage. Server snapshot is always the empty list, so
 * server and first client render agree and hydration stays stable; entries
 * appear after mount.
 */

let cachedRaw: string | null = null;
let cachedEntries: WatchlistEntry[] = [];
const listeners = new Set<() => void>();

function readEntries(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
  } catch {
    return cachedEntries;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedEntries = parseWatchlist(raw);
  }
  return cachedEntries;
}

function writeEntries(entries: WatchlistEntry[]): void {
  try {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      serializeWatchlist(entries)
    );
  } catch {
    // Storage may be unavailable (private mode, quota). Keep in-memory state.
  }
  cachedRaw = serializeWatchlist(entries);
  cachedEntries = entries;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === WATCHLIST_STORAGE_KEY) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: WatchlistEntry[] = [];

export function useWatchlist() {
  const entries = useSyncExternalStore(subscribe, readEntries, () => EMPTY);

  const add = useCallback((entry: Omit<WatchlistEntry, "addedAt">) => {
    writeEntries(
      addEntry(readEntries(), { ...entry, addedAt: new Date().toISOString() })
    );
  }, []);

  const remove = useCallback((instrumentId: string) => {
    writeEntries(removeEntry(readEntries(), instrumentId));
  }, []);

  const isSaved = useCallback(
    (instrumentId: string) => hasEntry(entries, instrumentId),
    [entries]
  );

  return { entries, add, remove, isSaved };
}
