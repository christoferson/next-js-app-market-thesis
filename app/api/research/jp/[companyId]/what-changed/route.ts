import { NextResponse } from "next/server";

import { MarketDataError } from "@/lib/market-data/errors";
import { AnalysisError } from "@/lib/research/analysis/types";
import { compareJapanRiskFactors } from "@/lib/research/edinet/comparison";

/**
 * R3 Japanese "What Changed?" narrative comparison, on demand.
 *
 * The Japanese counterpart of the US route: same envelope, same failure
 * mapping, same on-demand contract. Each uncached comparison is a real model
 * invocation with a real cost, so this is never called during page rendering;
 * the browser asks for it after an explicit user action, and
 * `compareJapanRiskFactors` caches its outcome per company.
 */
export const dynamic = "force-dynamic";

/**
 * Failure semantics per analysis code. A misconfiguration is 501 (the server
 * cannot do this at all), a transient or declined analysis is 503, and a
 * malformed model response is 500 — never a 200 with an empty comparison.
 */
const ANALYSIS_STATUS: Record<AnalysisError["code"], number> = {
  ANALYSIS_NOT_CONFIGURED: 501,
  ANALYSIS_UNAVAILABLE: 503,
  ANALYSIS_REFUSED: 503,
  ANALYSIS_INVALID_RESPONSE: 500,
};

/**
 * The configuration detail (which provider setting is off, which credential
 * failed) stays server-side; the browser gets the actionable statement only.
 */
const NOT_CONFIGURED_MESSAGE =
  "Runtime AI analysis is disabled. This deployment is not configured for " +
  "AI-assisted filing comparison.";

function errorResponse(
  code: string,
  message: string,
  retryable: boolean,
  status: number
): NextResponse {
  return NextResponse.json(
    { error: { code, message, retryable, details: {} } },
    { status }
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ companyId: string }> }
): Promise<NextResponse> {
  const { companyId } = await context.params;
  // ?regenerate=1 forces a fresh model run; prior results are kept.
  const regenerate =
    new URL(request.url).searchParams.get("regenerate") === "1";

  try {
    const outcome = await compareJapanRiskFactors(companyId, { regenerate });

    if (outcome === null) {
      return errorResponse(
        "NOT_FOUND",
        "No Japanese research company exists with this ID.",
        false,
        404
      );
    }

    return NextResponse.json({ data: outcome });
  } catch (error) {
    if (error instanceof AnalysisError) {
      // Log the code, not the request payload or credentials.
      console.error(
        `GET /api/research/jp/[companyId]/what-changed analysis failed (${error.code}):`,
        error.message
      );
      return errorResponse(
        error.code,
        error.code === "ANALYSIS_NOT_CONFIGURED"
          ? NOT_CONFIGURED_MESSAGE
          : error.message,
        error.retryable,
        ANALYSIS_STATUS[error.code]
      );
    }

    if (error instanceof MarketDataError) {
      console.error(
        `GET /api/research/jp/[companyId]/what-changed filing read failed (${error.code}):`,
        error.message
      );
      // The filings could not be read, so the upstream source is at fault.
      return errorResponse(error.code, error.message, error.retryable, 502);
    }

    console.error(
      "GET /api/research/jp/[companyId]/what-changed failed:",
      error
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while comparing the filings.",
      true,
      500
    );
  }
}
