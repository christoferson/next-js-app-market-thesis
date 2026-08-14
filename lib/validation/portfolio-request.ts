import { z } from "zod";

/**
 * Portfolio API contracts (P1). Strict objects; kind-specific field rules
 * enforced with refinements so a dividend can't carry a price and a buy
 * can't omit quantity. Real calendar dates required (same rationale as
 * thesis deadlines).
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date (YYYY-MM-DD).")
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
  );

const baseTransaction = z
  .object({
    subjectRef: z
      .string()
      .regex(
        /^(demo|research|research-jp):[a-z0-9][a-z0-9-]{0,99}$/,
        "subjectRef must be scope:id (demo:, research:, research-jp:)."
      ),
    subjectLabel: z.string().trim().min(1).max(200),
    currency: z.enum(["USD", "JPY"]),
    kind: z.enum(["buy", "sell", "dividend"]),
    date: isoDate,
    quantity: z.number().finite().positive().nullable(),
    price: z.number().finite().nonnegative().nullable(),
    amount: z.number().finite().positive().nullable(),
    fee: z.number().finite().nonnegative().default(0),
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

export const createTransactionSchema = baseTransaction.superRefine(
  (transaction, context) => {
    if (transaction.kind === "buy" || transaction.kind === "sell") {
      if (transaction.quantity === null) {
        context.addIssue({
          code: "custom",
          path: ["quantity"],
          message: "Buys and sells require a share quantity.",
        });
      }
      if (transaction.price === null) {
        context.addIssue({
          code: "custom",
          path: ["price"],
          message: "Buys and sells require a per-share price.",
        });
      }
      if (transaction.amount !== null) {
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Buys and sells must not carry a cash amount (derived).",
        });
      }
    } else {
      if (transaction.amount === null) {
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Dividends require the cash amount received.",
        });
      }
      if (transaction.quantity !== null || transaction.price !== null) {
        context.addIssue({
          code: "custom",
          path: ["quantity"],
          message: "Dividends must not carry share quantity or price.",
        });
      }
    }
  }
);

export const createPriceMarkSchema = z
  .object({
    subjectRef: z
      .string()
      .regex(/^(demo|research|research-jp):[a-z0-9][a-z0-9-]{0,99}$/),
    currency: z.enum(["USD", "JPY"]),
    price: z.number().finite().positive(),
    asOf: isoDate,
  })
  .strict();

export type CreateTransactionRequest = z.infer<typeof createTransactionSchema>;
export type CreatePriceMarkRequest = z.infer<typeof createPriceMarkSchema>;

export function zodDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    (details[field] ??= []).push(issue.message);
  }
  return details;
}
