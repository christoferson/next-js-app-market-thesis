import { z } from "zod";
import type { NarrativeComparisonRequest } from "./types";

/**
 * Versioned prompt for filing-narrative comparison (R2). Bump PROMPT_VERSION
 * on ANY change to the prompt text or output schema — the version is stored
 * on every analysis for provenance (SPEC §24.3 / Phase C requirements).
 */
export const PROMPT_VERSION = "narrative-comparison-v2";

/** Hard cap per section so a single request stays well-bounded in cost. */
export const MAX_SECTION_CHARS = 120_000;

/**
 * Base structural schema — plain z.object so tests can introspect .shape
 * and cross-check it against the wire JSON Schema below.
 */
export const comparisonBaseSchema = z.object({
  findings: z.array(
    z.object({
      classification: z.enum([
        "REPORTED_FACT",
        "MANAGEMENT_CLAIM",
        "AI_INTERPRETATION",
      ]),
      changeType: z.enum(["added", "removed", "modified"]),
      summary: z.string(),
      currentEvidence: z.string().nullable(),
      priorEvidence: z.string().nullable(),
    })
  ),
  overallSummary: z.string(),
});

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/**
 * Validation + length handling: the model is INSTRUCTED to stay brief, but
 * a valid-yet-verbose response is a PAID call — over-long strings and extra
 * findings are clipped after structural validation rather than rejected.
 * Structural problems (wrong enums, missing fields) still reject.
 */
export const comparisonOutputSchema = comparisonBaseSchema.transform(
  (output) => ({
    findings: output.findings.slice(0, 15).map((finding) => ({
      ...finding,
      summary: clip(finding.summary, 500),
      currentEvidence:
        finding.currentEvidence === null
          ? null
          : clip(finding.currentEvidence, 600),
      priorEvidence:
        finding.priorEvidence === null
          ? null
          : clip(finding.priorEvidence, 600),
    })),
    overallSummary: clip(output.overallSummary, 1200),
  })
);

export type ComparisonOutput = z.infer<typeof comparisonOutputSchema>;

/** JSON Schema for the model's structured-output tool (strict mode). */
export const comparisonJsonSchema: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
} = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          classification: {
            type: "string",
            enum: ["REPORTED_FACT", "MANAGEMENT_CLAIM", "AI_INTERPRETATION"],
          },
          changeType: {
            type: "string",
            enum: ["added", "removed", "modified"],
          },
          summary: { type: "string" },
          currentEvidence: { type: ["string", "null"] },
          priorEvidence: { type: ["string", "null"] },
        },
        required: [
          "classification",
          "changeType",
          "summary",
          "currentEvidence",
          "priorEvidence",
        ],
        additionalProperties: false,
      },
    },
    overallSummary: { type: "string" },
  },
  required: ["findings", "overallSummary"],
  additionalProperties: false,
};

export function buildSystemPrompt(): string {
  return [
    "You are a filing-comparison analyst for an investment research tool.",
    "You compare two versions of the same section from a company's SEC",
    "filings and identify what materially changed.",
    "",
    "Rules you must follow exactly:",
    "- Classify every finding: REPORTED_FACT for values or events directly",
    "  stated in the filing text; MANAGEMENT_CLAIM for management's",
    "  explanations, expectations, or characterizations; AI_INTERPRETATION",
    "  for conclusions you draw by comparing the two texts.",
    "- Quote short verbatim evidence from the filings whenever possible.",
    "- Use neutral research language. Never use words like buy, sell,",
    "  bullish, bearish, guaranteed, opportunity, or predict price moves.",
    "- A change is a change, not advice. Describe what differs; do not",
    "  assess whether it is good or bad for investors.",
    "- Do not calculate financial ratios or scores.",
    "- If the sections are substantially identical, return few or no",
    "  findings and say so in the overall summary.",
    "- Report at most 15 of the most material changes.",
    "- Keep each finding summary to one or two sentences. Keep each",
    "  evidence quote under 60 words. Keep the overall summary under",
    "  four sentences.",
  ].join("\n");
}

export function buildUserPrompt(request: NarrativeComparisonRequest): string {
  const clip = (text: string) =>
    text.length > MAX_SECTION_CHARS ? text.slice(0, MAX_SECTION_CHARS) : text;

  return [
    `Company: ${request.companyName}`,
    `Section: ${request.sectionTitle}`,
    "",
    `=== PRIOR FILING (${request.priorPeriodLabel}) ===`,
    clip(request.priorText),
    "",
    `=== CURRENT FILING (${request.currentPeriodLabel}) ===`,
    clip(request.currentText),
    "",
    "Compare the two versions of this section and report the material",
    "changes using the report_comparison tool.",
  ].join("\n");
}
