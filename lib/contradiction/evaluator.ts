import "server-only";

import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { AnalysisError } from "@/lib/research/analysis/types";
import type { ThesisClaim } from "@/lib/thesis/types";
import type { EvidenceItem } from "./types";
import {
  EVAL_PROMPT_VERSION,
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  evaluationJsonSchema,
  evaluationOutputSchema,
  type EvaluationOutput,
} from "./prompt";

/**
 * Claim evaluator (C1) — Bedrock behind the same swap-friendly shape as the
 * R2 analysis client: config-selected transport, structured output via a
 * forced tool call validated by Zod, full provenance on every result.
 */

const DEFAULT_MODEL_ID = "anthropic.claude-sonnet-5";
const MAX_OUTPUT_TOKENS = 32_000;
const REQUEST_TIMEOUT_MS = 300_000;

export interface EvaluatorResult {
  output: EvaluationOutput;
  modelId: string;
  promptVersion: string;
  generatedAt: string;
}

export interface ClaimEvaluator {
  readonly id: string;
  readonly modelId: string;
  evaluateClaims(input: {
    companyLabel: string;
    claims: ThesisClaim[];
    evidence: EvidenceItem[];
  }): Promise<EvaluatorResult>;
}

export function getClaimEvaluator(): ClaimEvaluator {
  const configured = process.env.RESEARCH_ANALYSIS_PROVIDER ?? "bedrock";
  if (configured === "off") {
    throw new AnalysisError(
      "ANALYSIS_NOT_CONFIGURED",
      "Runtime AI analysis is disabled (RESEARCH_ANALYSIS_PROVIDER=off)."
    );
  }
  if (configured !== "bedrock") {
    throw new AnalysisError(
      "ANALYSIS_NOT_CONFIGURED",
      `Unsupported RESEARCH_ANALYSIS_PROVIDER "${configured}". Supported: bedrock, off.`
    );
  }
  return createBedrockEvaluator();
}

function createBedrockEvaluator(): ClaimEvaluator {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const modelId = process.env.RESEARCH_ANALYSIS_MODEL_ID ?? DEFAULT_MODEL_ID;
  const client = new AnthropicBedrockMantle({
    awsRegion: region,
    timeout: REQUEST_TIMEOUT_MS,
  });

  return {
    id: "bedrock",
    modelId,

    async evaluateClaims(input): Promise<EvaluatorResult> {
      let response;
      try {
        response = await client.messages.create({
          model: modelId,
          max_tokens: MAX_OUTPUT_TOKENS,
          thinking: { type: "adaptive" },
          system: buildEvaluationSystemPrompt(),
          tools: [
            // Bedrock rejects `strict: true`; forced tool_choice + Zod
            // validation below provides the schema guarantee (same finding
            // as R2, verified live 2026-08-10).
            {
              name: "report_evaluations",
              description:
                "Report the evaluation of each thesis claim against the evidence.",
              input_schema: evaluationJsonSchema,
            },
          ],
          tool_choice: { type: "tool", name: "report_evaluations" },
          messages: [
            { role: "user", content: buildEvaluationUserPrompt(input) },
          ],
        });
      } catch (error: unknown) {
        throw toAnalysisError(error);
      }

      if (response.stop_reason === "refusal") {
        throw new AnalysisError(
          "ANALYSIS_REFUSED",
          "The analysis model declined this evaluation request."
        );
      }
      if (response.stop_reason === "max_tokens") {
        throw new AnalysisError(
          "ANALYSIS_INVALID_RESPONSE",
          "The evaluation response was truncated before completion (output token limit reached)."
        );
      }

      const toolUse = response.content.find(
        (block) => block.type === "tool_use"
      );
      if (toolUse === undefined || toolUse.type !== "tool_use") {
        throw new AnalysisError(
          "ANALYSIS_INVALID_RESPONSE",
          "The analysis model did not return structured evaluations."
        );
      }

      const parsed = evaluationOutputSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        // Log the SHAPE of the failure (issue paths, not content) so a
        // schema drift is diagnosable without exposing filing text.
        console.error(
          "Evaluation schema mismatch:",
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.code}`)
            .join("; ")
        );
        throw new AnalysisError(
          "ANALYSIS_INVALID_RESPONSE",
          "The evaluation response did not match the expected schema."
        );
      }

      return {
        output: parsed.data,
        modelId,
        promptVersion: EVAL_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
      };
    },
  };
}

function toAnalysisError(error: unknown): AnalysisError {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : null;

  if (status === 429 || (status !== null && status >= 500)) {
    return new AnalysisError(
      "ANALYSIS_UNAVAILABLE",
      "The analysis service is temporarily unavailable. Please retry shortly.",
      true
    );
  }
  if (status === 401 || status === 403) {
    return new AnalysisError(
      "ANALYSIS_NOT_CONFIGURED",
      "The analysis service credentials are not configured correctly."
    );
  }
  return new AnalysisError(
    "ANALYSIS_UNAVAILABLE",
    "The evaluation request failed.",
    true
  );
}
