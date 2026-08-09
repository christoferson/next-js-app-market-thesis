import type { DataProvenance, MetricValue } from "@/lib/domain";

/**
 * Fixed demo dates. Demo data is deterministic and never advances with the
 * current date. The UI must present this as demo data, not current prices.
 */
export const DEMO_AS_OF_DATE = "2026-08-07";
export const DEMO_AS_OF_TIMESTAMP = "2026-08-07T20:00:00.000Z";

export const DEMO_PROVENANCE: DataProvenance = {
  provider: "demo",
  fetchedAt: DEMO_AS_OF_TIMESTAMP,
  asOf: DEMO_AS_OF_DATE,
  isDemo: true,
  isDelayed: false,
  warnings: ["Demo data — not current market information."],
};

/** A metric with a known demo value. */
export function demoMetric(
  value: number,
  period?: MetricValue["period"]
): MetricValue {
  return { value, origin: "demo", period: period ?? "TTM", asOf: DEMO_AS_OF_DATE };
}

/** A metric that is intentionally unavailable. Missing data is null, never 0. */
export function missingMetric(unavailableReason: string): MetricValue {
  return { value: null, origin: "demo", unavailableReason };
}
