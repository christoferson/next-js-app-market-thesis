import { z } from "zod";

/**
 * Thesis API request contracts (T1). Strict objects — unknown fields
 * rejected. Numeric claim fields follow house conventions (decimals for
 * percentages); nulls are explicit, matching missing-data rules.
 */

const claimBaseShape = {
  kind: z.enum([
    "growth",
    "profitability",
    "capital-allocation",
    "competitive-position",
    "valuation",
    "other",
  ]),
  statement: z.string().trim().min(5).max(500),
  metricDescription: z.string().trim().max(200).nullable(),
  baselineValue: z.number().finite().nullable(),
  targetValue: z.number().finite().nullable(),
  invalidationValue: z.number().finite().nullable(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date (YYYY-MM-DD).")
    // Phase C will compare deadlines to evidence dates, so impossible
    // calendar dates (2027-02-30) must not slip through the regex.
    // Format failures are the regex's job — skip them here so each
    // problem yields exactly one message.
    .refine(
      (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
        const parsed = new Date(`${value}T00:00:00Z`);
        return (
          !Number.isNaN(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value
        );
      },
      { message: "This is not a real calendar date." }
    )
    .nullable(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
};

/** Create: claims never carry ids — the store assigns them. */
const newClaimSchema = z.object(claimBaseShape).strict();

/** Revise: an id marks a carried-over claim (continuity for Phase C). */
const revisedClaimSchema = z
  .object({ id: z.string().uuid().optional(), ...claimBaseShape })
  .strict();

function thesisBodyShape<TClaim extends z.ZodType>(claimSchema: TClaim) {
  return {
    title: z.string().trim().min(3).max(200),
    summary: z.string().trim().min(20).max(10_000),
    edge: z.string().trim().max(5_000).nullable(),
    bearCase: z.string().trim().max(5_000).nullable(),
    timeHorizon: z.string().trim().max(100).nullable(),
    claims: z.array(claimSchema).min(1).max(12),
  };
}

export const createThesisSchema = z
  .object({
    subjectRef: z
      .string()
      .regex(
        /^(demo|research|research-jp):[a-z0-9][a-z0-9-]{0,99}$/,
        "subjectRef must be scope:id (demo:, research:, research-jp:)."
      ),
    subjectLabel: z.string().trim().min(1).max(200),
    ...thesisBodyShape(newClaimSchema),
  })
  .strict();

export const reviseThesisSchema = z
  .object({
    ...thesisBodyShape(revisedClaimSchema),
    revisionNote: z.string().trim().min(5).max(2_000),
  })
  .strict();

export const statusChangeSchema = z
  .object({
    status: z.enum(["active", "invalidated", "realized", "abandoned"]),
    note: z.string().trim().min(5).max(2_000),
  })
  .strict();

export const noteSchema = z
  .object({
    text: z.string().trim().min(1).max(5_000),
  })
  .strict();

export type CreateThesisRequest = z.infer<typeof createThesisSchema>;
export type ReviseThesisRequest = z.infer<typeof reviseThesisSchema>;

export interface ThesisValidationFailure {
  ok: false;
  message: string;
  details: Record<string, string[]>;
}

export function toValidationFailure(
  error: z.ZodError
): ThesisValidationFailure {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    (details[field] ??= []).push(issue.message);
  }
  return {
    ok: false,
    message: "The thesis request is invalid.",
    details,
  };
}
