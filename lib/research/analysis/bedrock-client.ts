import "server-only";

import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import {
  AnalysisError,
  type AnalysisClient,
  type NarrativeComparison,
  type NarrativeComparisonRequest,
} from "./types";
import {
  PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
  comparisonJsonSchema,
  comparisonOutputSchema,
} from "./prompt";

/**
 * Bedrock implementation of the AnalysisClient facade.
 *
 * Credentials come from the standard AWS chain (AWS_PROFILE locally; an ECS
 * task role in deployment) — no keys in application config. The model runs
 * behind the same facade the rest of the app uses, so replacing Bedrock
 * with the first-party API later is a factory change only.
 */

const DEFAULT_MODEL_ID = "anthropic.claude-sonnet-5";
// Generous headroom: adaptive thinking shares this budget with the tool
// call, and a starved budget truncates the structured output mid-object.
const MAX_OUTPUT_TOKENS = 32_000;
const REQUEST_TIMEOUT_MS = 300_000;

export function createBedrockAnalysisClient(): AnalysisClient {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const modelId = process.env.RESEARCH_ANALYSIS_MODEL_ID ?? DEFAULT_MODEL_ID;

  const client = new AnthropicBedrockMantle({
    awsRegion: region,
    timeout: REQUEST_TIMEOUT_MS,
  });

  return {
    id: "bedrock",
    modelId,

    async compareNarratives(
      request: NarrativeComparisonRequest
    ): Promise<NarrativeComparison> {
      let response;
      try {
        response = await client.messages.create({
          model: modelId,
          max_tokens: MAX_OUTPUT_TOKENS,
          thinking: { type: "adaptive" },
          system: buildSystemPrompt(),
          tools: [
            // Bedrock rejects `strict: true` on tools ("Extra inputs are
            // not permitted", verified 2026-08-10); forced tool_choice plus
            // Zod validation below provides the schema guarantee instead.
            {
              name: "report_comparison",
              description:
                "Report the material changes between the two filing sections.",
              input_schema: comparisonJsonSchema,
            },
          ],
          tool_choice: { type: "tool", name: "report_comparison" },
          messages: [{ role: "user", content: buildUserPrompt(request) }],
        });
      } catch (error: unknown) {
        throw toAnalysisError(error);
      }

      if (response.stop_reason === "refusal") {
        throw new AnalysisError(
          "ANALYSIS_REFUSED",
          "The analysis model declined this comparison request."
        );
      }
      if (response.stop_reason === "max_tokens") {
        // A truncated tool call would fail schema validation with a
        // misleading message — surface the real cause instead.
        throw new AnalysisError(
          "ANALYSIS_INVALID_RESPONSE",
          "The analysis response was truncated before completion (output token limit reached)."
        );
      }

      const toolUse = response.content.find(
        (block) => block.type === "tool_use"
      );
      if (toolUse === undefined || toolUse.type !== "tool_use") {
        throw new AnalysisError(
          "ANALYSIS_INVALID_RESPONSE",
          "The analysis model did not return a structured comparison."
        );
      }

      const parsed = comparisonOutputSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        throw new AnalysisError(
          "ANALYSIS_INVALID_RESPONSE",
          "The analysis response did not match the expected schema."
        );
      }

      return {
        findings: parsed.data.findings,
        overallSummary: parsed.data.overallSummary,
        modelId,
        promptVersion: PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
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
    "The analysis request failed.",
    true
  );
}
