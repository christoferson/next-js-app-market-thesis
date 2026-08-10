/**
 * AI analysis facade (R2). The application depends only on this interface —
 * the transport (Bedrock today; the first-party Anthropic API, a different
 * region, or a mock later) is an implementation detail behind the factory,
 * so swapping mechanisms is a config change, not a refactor.
 *
 * SPEC rules this boundary enforces:
 * - AI compares and classifies NARRATIVE text only. It never calculates
 *   financial metrics or scores (SPEC §2.2) — those remain deterministic.
 * - Every output is labeled REPORTED FACT / MANAGEMENT CLAIM /
 *   AI INTERPRETATION (SPEC §24.3) and carries model + prompt version.
 */

export type FindingClassification =
  | "REPORTED_FACT"
  | "MANAGEMENT_CLAIM"
  | "AI_INTERPRETATION";

export type ChangeType = "added" | "removed" | "modified";

export interface ComparisonFinding {
  classification: FindingClassification;
  changeType: ChangeType;
  /** One-sentence neutral description of the change. */
  summary: string;
  /** Short verbatim quote from the current filing, when applicable. */
  currentEvidence: string | null;
  /** Short verbatim quote from the prior filing, when applicable. */
  priorEvidence: string | null;
}

export interface NarrativeComparisonRequest {
  companyName: string;
  sectionTitle: string;
  currentPeriodLabel: string;
  priorPeriodLabel: string;
  currentText: string;
  priorText: string;
}

export interface NarrativeComparison {
  findings: ComparisonFinding[];
  /** Two-to-three sentence neutral overview. AI INTERPRETATION by nature. */
  overallSummary: string;

  /** Provenance: which model and prompt produced this analysis. */
  modelId: string;
  promptVersion: string;
  generatedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AnalysisClient {
  /** Implementation identifier, e.g. "bedrock". Safe to display. */
  readonly id: string;
  /** Model identifier used for provenance display. */
  readonly modelId: string;

  compareNarratives(
    request: NarrativeComparisonRequest
  ): Promise<NarrativeComparison>;
}

export class AnalysisError extends Error {
  readonly code:
    | "ANALYSIS_NOT_CONFIGURED"
    | "ANALYSIS_UNAVAILABLE"
    | "ANALYSIS_INVALID_RESPONSE"
    | "ANALYSIS_REFUSED";
  readonly retryable: boolean;

  constructor(
    code: AnalysisError["code"],
    message: string,
    retryable = false
  ) {
    super(message);
    this.name = "AnalysisError";
    this.code = code;
    this.retryable = retryable;
  }
}
