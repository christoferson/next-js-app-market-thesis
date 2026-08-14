import { z } from "zod";
import type { ThesisClaim } from "@/lib/thesis/types";
import type { EvidenceItem } from "./types";

/**
 * Versioned claim-evaluation prompt (C1). Bump EVAL_PROMPT_VERSION on ANY
 * change to prompt text or schema — the version is preserved on every
 * evaluation (SPEC Phase C provenance requirement).
 */
export const EVAL_PROMPT_VERSION = "claim-evaluation-v1";

export const CLASSIFICATIONS = [
  "STRONGLY_SUPPORTS",
  "MODERATELY_SUPPORTS",
  "NEUTRAL",
  "MODERATELY_CONTRADICTS",
  "STRONGLY_CONTRADICTS",
  "INSUFFICIENT_EVIDENCE",
] as const;

export const evaluationBaseSchema = z.object({
  evaluations: z.array(
    z.object({
      claimId: z.string(),
      classification: z.enum(CLASSIFICATIONS),
      rationale: z.string(),
      evidenceExcerpts: z.array(z.string()),
    })
  ),
});

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/** Structural validation rejects; verbose-but-valid output is clipped. */
export const evaluationOutputSchema = evaluationBaseSchema.transform(
  (output) => ({
    evaluations: output.evaluations.map((evaluation) => ({
      ...evaluation,
      rationale: clip(evaluation.rationale, 1_000),
      evidenceExcerpts: evaluation.evidenceExcerpts
        .slice(0, 4)
        .map((excerpt) => clip(excerpt, 500)),
    })),
  })
);

export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

export const evaluationJsonSchema: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
} = {
  type: "object",
  properties: {
    evaluations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claimId: { type: "string" },
          classification: { type: "string", enum: [...CLASSIFICATIONS] },
          rationale: { type: "string" },
          evidenceExcerpts: { type: "array", items: { type: "string" } },
        },
        required: [
          "claimId",
          "classification",
          "rationale",
          "evidenceExcerpts",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["evaluations"],
  additionalProperties: false,
};

export function buildEvaluationSystemPrompt(): string {
  return [
    "You are an evidence evaluator for an investment research tool. The",
    "user wrote an investment thesis with specific, falsifiable claims.",
    "You are given recent filing evidence about the company and must judge",
    "how the evidence bears on EACH claim.",
    "",
    "Classify every claim as exactly one of: STRONGLY_SUPPORTS,",
    "MODERATELY_SUPPORTS, NEUTRAL, MODERATELY_CONTRADICTS,",
    "STRONGLY_CONTRADICTS, INSUFFICIENT_EVIDENCE.",
    "",
    "Rules you must follow exactly:",
    "- Judge only from the evidence provided. If the evidence does not",
    "  address a claim, use INSUFFICIENT_EVIDENCE — never guess.",
    "- Ground every rationale in specific evidence; include short verbatim",
    "  excerpts or the specific values you relied on.",
    "- A contradiction is a reason for the user to REVIEW their thesis.",
    "  Never suggest buying, selling, or any action. Never predict prices.",
    "- Do not calculate new financial ratios; use values as given.",
    "- Use neutral research language throughout.",
    "- Numeric conventions: percentage values in claims are decimals",
    "  (0.15 means 15%).",
  ].join("\n");
}

export interface EvaluationPromptInput {
  companyLabel: string;
  claims: ThesisClaim[];
  evidence: EvidenceItem[];
}

export function buildEvaluationUserPrompt(
  input: EvaluationPromptInput
): string {
  const claimLines = input.claims.map((claim) =>
    [
      `Claim ${claim.id}:`,
      `  Statement: ${claim.statement}`,
      claim.metricDescription !== null
        ? `  Metric: ${claim.metricDescription}`
        : null,
      claim.baselineValue !== null
        ? `  Baseline: ${claim.baselineValue}`
        : null,
      claim.targetValue !== null ? `  Target: ${claim.targetValue}` : null,
      claim.invalidationValue !== null
        ? `  Invalidation threshold: ${claim.invalidationValue}`
        : null,
      claim.deadline !== null ? `  Deadline: ${claim.deadline}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
  );

  const evidenceLines = input.evidence.map((item, index) =>
    [
      `Evidence ${index + 1} [${item.kind}] — ${item.label}`,
      `  Source: ${item.source}${item.asOf !== null ? ` (as of ${item.asOf})` : ""}`,
      `  Content:`,
      item.content,
    ].join("\n")
  );

  return [
    `Company: ${input.companyLabel}`,
    "",
    "=== THESIS CLAIMS ===",
    ...claimLines,
    "",
    "=== FILING EVIDENCE ===",
    ...evidenceLines,
    "",
    "Evaluate each claim against the evidence using the report_evaluations",
    "tool. Return one evaluation per claim, using each claim's exact id.",
  ].join("\n");
}
