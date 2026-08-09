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
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
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
  for (const key of ["assetType", "market", "page", "pageSize"] as const) {
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

  return { ok: true, query: result.data };
}
