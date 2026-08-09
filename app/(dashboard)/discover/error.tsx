"use client";

import { useEffect } from "react";

/**
 * Route error boundary. The user sees a readable sentence and a retry control;
 * diagnostic detail stays in the server/browser console, never on screen.
 */
export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Discover route error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Discover
        </h1>
        <p className="text-sm text-stone-600">
          Find research candidates across US and Japanese markets.
        </p>
      </div>

      <div
        role="alert"
        className="space-y-3 rounded-md border border-stone-300 bg-white p-6"
      >
        <h2 className="text-sm font-semibold text-stone-900">
          Something went wrong while loading discovery data.
        </h2>
        <p className="text-sm text-stone-600">
          No instrument data could be loaded. Nothing here reflects current
          market information.
        </p>
        <p className="text-sm text-stone-600">
          Your filters and watchlist have not been lost. Retrying reloads this
          page with the same selections.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
