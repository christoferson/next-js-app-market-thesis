import { z } from "zod";

/**
 * POST /api/discovery/screen request contract (SPEC §13.3).
 * `.strict()` objects reject unknown filters and unknown top-level fields —
 * clients cannot smuggle unsupported filters or score overrides.
 */
export const screenRequestSchema = z
  .object({
    assetType: z.literal("stock"),
    market: z.enum(["US", "JP"]).optional(),
    query: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(100))
      .optional(),
    strategyId: z.literal("quality-reasonable-price-v1"),
    filters: z
      .object({
        minimumMarketCap: z.number().nonnegative().optional(),
        minimumRevenueGrowth: z.number().min(-1).max(10).optional(),
        maximumPeRatio: z.number().positive().max(10000).optional(),
        minimumFreeCashFlowYield: z.number().min(-1).max(1).optional(),
        maximumDebtToEquity: z.number().nonnegative().max(1000).optional(),
        positiveFreeCashFlowOnly: z.boolean().optional(),
      })
      .strict()
      .default({}),
    sort: z
      .object({
        field: z.enum(["strategyScore", "marketCap"]),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .default({ field: "strategyScore", direction: "desc" }),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ScreenRequest = z.infer<typeof screenRequestSchema>;

export interface ScreenValidationFailure {
  ok: false;
  message: string;
  details: Record<string, string[]>;
}

export type ScreenValidationResult =
  | { ok: true; request: ScreenRequest }
  | ScreenValidationFailure;

export function parseScreenRequest(body: unknown): ScreenValidationResult {
  const result = screenRequestSchema.safeParse(body);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "request";
      (details[field] ??= []).push(issue.message);
    }
    return {
      ok: false,
      message: "The screen request is invalid.",
      details,
    };
  }
  return { ok: true, request: result.data };
}
