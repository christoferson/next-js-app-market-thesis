import { z } from "zod";

/**
 * Runtime schemas for SEC EDGAR responses (external data is unknown until
 * validated). Only the fields R1 uses are validated; unknown fields pass
 * through unread. Sources: data.sec.gov submissions + XBRL companyfacts.
 */

/** submissions/CIK##########.json — recent filings are parallel arrays. */
export const submissionsSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string(),
  fiscalYearEnd: z.string().nullish(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      form: z.array(z.string()),
      filingDate: z.array(z.string()),
      reportDate: z.array(z.string()),
      primaryDocument: z.array(z.string()),
      primaryDocDescription: z.array(z.string()).optional(),
      items: z.array(z.string()).optional(),
    }),
  }),
});

export type EdgarSubmissions = z.infer<typeof submissionsSchema>;

/** One XBRL fact within companyfacts units. */
export const xbrlFactSchema = z.object({
  /** Period start (duration concepts only). */
  start: z.string().optional(),
  /** Period end (all concepts). */
  end: z.string(),
  val: z.number(),
  accn: z.string(),
  /** Filing-context fiscal year/period — NOT the fact's own period. */
  fy: z.number().nullish(),
  fp: z.string().nullish(),
  form: z.string(),
  filed: z.string(),
  frame: z.string().optional(),
});

export type XbrlFact = z.infer<typeof xbrlFactSchema>;

export const xbrlConceptSchema = z.object({
  label: z.string().nullish(),
  description: z.string().nullish(),
  units: z.record(z.string(), z.array(xbrlFactSchema)),
});

export type XbrlConcept = z.infer<typeof xbrlConceptSchema>;

/** companyfacts/CIK##########.json — validated lazily per concept. */
export const companyFactsSchema = z.object({
  cik: z.number(),
  entityName: z.string(),
  facts: z.object({
    "us-gaap": z.record(z.string(), z.unknown()).optional(),
    "ifrs-full": z.record(z.string(), z.unknown()).optional(),
    dei: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type EdgarCompanyFacts = z.infer<typeof companyFactsSchema>;

/**
 * Validate a single concept out of companyfacts. Returns null when the
 * concept is absent (never reported) or fails validation.
 */
export function parseConcept(
  facts: EdgarCompanyFacts,
  taxonomy: "us-gaap" | "ifrs-full",
  tag: string
): XbrlConcept | null {
  const raw = facts.facts[taxonomy]?.[tag];
  if (raw === undefined) return null;
  const result = xbrlConceptSchema.safeParse(raw);
  return result.success ? result.data : null;
}
