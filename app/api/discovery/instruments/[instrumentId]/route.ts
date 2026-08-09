import { NextRequest, NextResponse } from "next/server";
import { getDiscoveryInstrument } from "@/lib/discovery/service";
import { MarketDataError } from "@/lib/market-data/errors";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ instrumentId: string }> }
): Promise<NextResponse> {
  const { instrumentId } = await context.params;

  try {
    const snapshot = await getDiscoveryInstrument(instrumentId);

    if (snapshot === null) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "No instrument exists with this ID.",
            retryable: false,
            details: {},
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: snapshot });
  } catch (error) {
    if (error instanceof MarketDataError && error.code === "INVALID_REQUEST") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: error.message,
            retryable: false,
            details: {},
          },
        },
        { status: 400 }
      );
    }

    console.error("GET /api/discovery/instruments/[id] failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while loading the instrument.",
          retryable: true,
          details: {},
        },
      },
      { status: 500 }
    );
  }
}
