import { NextRequest, NextResponse } from "next/server";
import { parseScreenRequest } from "@/lib/validation/screen-request";
import { screenStocks } from "@/lib/screener/screen";
import { MarketDataError } from "@/lib/market-data/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.", {});
  }

  const parsed = parseScreenRequest(body);
  if (!parsed.ok) {
    return invalidRequest(parsed.message, parsed.details);
  }

  try {
    const { result, summary, meta } = await screenStocks(parsed.request);

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
    if (error instanceof MarketDataError && error.code === "INVALID_REQUEST") {
      return invalidRequest(error.message, {});
    }
    console.error("POST /api/discovery/screen failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while screening.",
          retryable: true,
          details: {},
        },
      },
      { status: 500 }
    );
  }
}

function invalidRequest(
  message: string,
  details: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      error: { code: "INVALID_REQUEST", message, retryable: false, details },
    },
    { status: 400 }
  );
}
