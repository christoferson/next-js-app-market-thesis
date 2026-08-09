import { NextRequest, NextResponse } from "next/server";
import { parseDiscoveryQuery } from "@/lib/validation/discovery-query";
import { listDiscoveryInstruments } from "@/lib/discovery/service";
import { MarketDataError } from "@/lib/market-data/errors";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseDiscoveryQuery(request.nextUrl.searchParams);

  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: parsed.message,
          retryable: false,
          details: parsed.details,
        },
      },
      { status: 400 }
    );
  }

  try {
    const { query } = parsed;
    const { result, summary, meta } = await listDiscoveryInstruments(query, {
      indexSort:
        query.sortField !== undefined
          ? {
              field: query.sortField,
              direction: query.sortDirection ?? "desc",
            }
          : null,
    });

    return NextResponse.json({
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasNextPage: result.hasNextPage,
      },
      summary,
      meta,
    });
  } catch (error) {
    // Never leak stack traces or internal details to the browser.
    const isConfig =
      error instanceof MarketDataError &&
      error.code === "PROVIDER_NOT_CONFIGURED";

    console.error("GET /api/discovery/instruments failed:", error);

    return NextResponse.json(
      {
        error: {
          code: isConfig ? "PROVIDER_NOT_CONFIGURED" : "INTERNAL_ERROR",
          message: isConfig
            ? "The market-data provider is not configured correctly."
            : "An unexpected error occurred while loading instruments.",
          retryable: !isConfig,
          details: {},
        },
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
