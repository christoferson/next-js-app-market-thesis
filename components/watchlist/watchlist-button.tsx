"use client";

import type { AssetType } from "@/lib/domain";
import { useWatchlist } from "@/lib/watchlist/use-watchlist";

export interface WatchlistButtonProps {
  instrumentId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  /** Compact rendering for table rows and cards. */
  size?: "row" | "detail";
}

/**
 * Add/remove toggle for the browser-local watchlist. Text label carries the
 * state — never color alone. Safe during hydration: the server snapshot is
 * an empty watchlist, so the initial render is always "Add".
 */
export function WatchlistButton({
  instrumentId,
  symbol,
  name,
  assetType,
  size = "row",
}: WatchlistButtonProps) {
  const { add, remove, isSaved } = useWatchlist();
  const saved = isSaved(instrumentId);

  const label = saved
    ? `Remove ${symbol} from watchlist`
    : `Add ${symbol} to watchlist`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      onClick={() =>
        saved
          ? remove(instrumentId)
          : add({ instrumentId, symbol, name, assetType })
      }
      className={
        size === "detail"
          ? "rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
          : "rounded-sm border border-stone-300 px-2 py-0.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      }
    >
      {saved ? "Saved ✓" : "Watchlist"}
    </button>
  );
}
