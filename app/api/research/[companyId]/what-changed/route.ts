import { NextResponse } from "next/server";

import { MarketDataError } from "@/lib/market-data/errors";
import { AnalysisError } from "@/lib/research/analysis/types";
import { compareRiskFactors } from "@/lib/research/comparison";

/**
 * R2 "What Changed?" narrative comparison, on demand.
 *
 * This endpoint is deliberately NOT called during page rendering: each
 * uncached comparison is a real model invocation with a real cost, so the
 * browser asks for it only after an explicit user action. Repeat requests are
 * cheap — `compareRiskFactors` caches its outcome per company.
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
  _request: Request,
  context: { params: Promise<{ companyId: string }> }
): Promise<NextResponse> {
  const { companyId } = await context.params;

  try {
    const outcome = await compareRiskFactors(companyId);

    if (outcome === null) {
      return errorResponse(
        "NOT_FOUND",
        "No research company exists with this ID.",
        false,
        404
      );
    }

    return NextResponse.json({ data: outcome });
  } catch (error) {
    if (error instanceof AnalysisError) {
      // Log the code, not the request payload or credentials.
      console.error(
        `GET /api/research/[companyId]/what-changed analysis failed (${error.code}):`,
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
        `GET /api/research/[companyId]/what-changed filing fetch failed (${error.code}):`,
        error.message
      );
      // The filings could not be read, so the upstream source is at fault.
      return errorResponse(error.code, error.message, error.retryable, 502);
    }

    console.error("GET /api/research/[companyId]/what-changed failed:", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while comparing the filings.",
      true,
      500
    );
  }
}
