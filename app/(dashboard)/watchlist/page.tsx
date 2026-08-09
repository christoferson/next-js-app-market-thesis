"use client";

import Link from "next/link";

import type { AssetType } from "@/lib/domain";
import { useWatchlist } from "@/lib/watchlist/use-watchlist";

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  stock: "Stock",
  etf: "ETF",
  index: "Index",
};

/**
 * The watchlist lives in localStorage, so this page must be a client
 * component. `useWatchlist` returns an empty list on the server, which keeps
 * hydration stable; saved entries appear once the store is read after mount.
 *
 * Entries store only the fields needed to recognise an instrument. The detail
 * link resolves live data, so nothing here is presented as market information.
 */
export default function WatchlistPage() {
  const { entries, remove } = useWatchlist();

  // Oldest first, so the list order is stable as items are added.
  const ordered = [...entries].sort((a, b) => a.addedAt.localeCompare(b.addedAt));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Watchlist
        </h1>
        <p className="text-sm text-stone-600">
          Saved in this browser only — not synced to an account.
        </p>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
          Your watchlist is empty. Add instruments from the Discover page.
        </p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((entry) => (
            <li
              key={entry.instrumentId}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-stone-200 bg-white p-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/discover/${entry.instrumentId}`}
                    className="rounded-sm font-semibold text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
                  >
                    {entry.symbol}
                  </Link>
                  <span className="rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] text-stone-600">
                    {ASSET_TYPE_LABEL[entry.assetType]}
                  </span>
                </div>
                <p className="text-sm text-stone-700">{entry.name}</p>
              </div>

              <button
                type="button"
                aria-label={`Remove ${entry.symbol} from watchlist`}
                onClick={() => remove(entry.instrumentId)}
                className="shrink-0 rounded-sm border border-stone-300 px-2 py-0.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        Saved names and symbols are stored as they appeared when you added them.
        Open an instrument to see its current details from the data source.
      </p>
    </div>
  );
}
