import "server-only";

import { AnalysisError, type AnalysisClient } from "./types";
import { createBedrockAnalysisClient } from "./bedrock-client";

/**
 * Analysis-client factory — the swap point for the AI transport.
 * `RESEARCH_ANALYSIS_PROVIDER` selects the implementation (default
 * "bedrock"); "off" disables runtime AI explicitly. Adding a first-party
 * Anthropic API implementation later means one new branch here, nothing
 * else changes.
 */
export function getAnalysisClient(): AnalysisClient {
  const configured = process.env.RESEARCH_ANALYSIS_PROVIDER ?? "bedrock";

  if (configured === "bedrock") {
    return createBedrockAnalysisClient();
  }
  if (configured === "off") {
    throw new AnalysisError(
      "ANALYSIS_NOT_CONFIGURED",
      "Runtime AI analysis is disabled (RESEARCH_ANALYSIS_PROVIDER=off)."
    );
  }
  throw new AnalysisError(
    "ANALYSIS_NOT_CONFIGURED",
    `Unsupported RESEARCH_ANALYSIS_PROVIDER "${configured}". Supported: bedrock, off.`
  );
}

export function isAnalysisEnabled(): boolean {
  return (process.env.RESEARCH_ANALYSIS_PROVIDER ?? "bedrock") !== "off";
}
