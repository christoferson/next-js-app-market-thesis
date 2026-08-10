"use client";

import { useEffect } from "react";

/**
 * Route error boundary for a company research page. Expected EDGAR outages are
 * handled inline by the page itself; this covers everything unforeseen. The
 * user sees a readable sentence and a retry control — diagnostics stay in the
 * console.
 */
export default function CompanyResearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Research route error:", error);
  }, [error]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
        Research
      </h1>

      <div
        role="alert"
        className="space-y-3 rounded-md border border-stone-300 bg-white p-6"
      >
        <h2 className="text-sm font-semibold text-stone-900">
          Filing data could not be loaded from SEC EDGAR.
        </h2>
        <p className="text-sm leading-relaxed text-stone-600">
          Your other work is unaffected. Nothing was loaded, so no figures on
          this page describe any company.
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
