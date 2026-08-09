import { z } from "zod";

/**
 * D1 query contract for GET /api/discovery/instruments.
 *
 * Policy (documented in PROGRESS.md): invalid values are rejected with a
 * structured 400 — not clamped. Unknown query parameters are ignored.
 */
export const discoveryQuerySchema = z.object({
  assetType: z.enum(["stock", "etf", "index"]).default("stock"),
  market: z.enum(["US", "JP"]).optional(),
  /**
   * Trimmed free-text search. An empty query means "no search filter".
   * Trim before the length check so surrounding whitespace never causes a
   * rejection the UI's own URL state (which trims first) would not produce.
   */
  query: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(100))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** D4: return sorting, currently supported for indices only. */
  sortField: z
    .enum(["oneMonthReturn", "yearToDateReturn", "oneYearReturn"])
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
});

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

export interface QueryValidationFailure {
  ok: false;
  message: string;
  details: Record<string, string[]>;
}

export interface QueryValidationSuccess {
  ok: true;
  query: DiscoveryQuery;
}

export type QueryValidationResult =
  | QueryValidationSuccess
  | QueryValidationFailure;

/** Parse URL search params into a validated discovery query. */
export function parseDiscoveryQuery(
  searchParams: URLSearchParams
): QueryValidationResult {
  const raw: Record<string, string> = {};
  for (const key of [
    "assetType",
    "market",
    "query",
    "page",
    "pageSize",
    "sortField",
    "sortDirection",
  ] as const) {
    const value = searchParams.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }

  const result = discoveryQuerySchema.safeParse(raw);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "query";
      (details[field] ??= []).push(issue.message);
    }
    return {
      ok: false,
      message: "One or more query parameters are invalid.",
      details,
    };
  }

  // Sorting is index-only in D4: reject rather than silently ignore, so a
  // client cannot believe an unsupported sort was applied (SPEC §13.2).
  if (
    result.data.sortField !== undefined &&
    result.data.assetType !== "index"
  ) {
    return {
      ok: false,
      message: "Sorting is currently supported only for indices.",
      details: { sortField: ["Unsupported for this asset type"] },
    };
  }

  return { ok: true, query: result.data };
}
