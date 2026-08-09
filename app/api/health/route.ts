import { NextResponse } from "next/server";

export function GET(): NextResponse {
  // Deliberately minimal: no secrets, no environment dump, no internal paths.
  return NextResponse.json({
    status: "ok",
    app: "Market Thesis",
    provider: process.env.MARKET_DATA_PROVIDER ?? "demo",
    timestamp: new Date().toISOString(),
  });
}
