/**
 * Contradiction Engine domain (Phase C, milestone C1).
 *
 * Product rules (SPEC §25 Phase C / §24.5):
 * - Evidence is compared against the user's thesis claims; each evaluation
 *   is classified on a fixed scale and must preserve the claim, the
 *   evidence, its date and source, the classification, and the model +
 *   prompt version that produced it.
 * - A contradiction triggers REVIEW, never an automatic action. No output
 *   may suggest selling or buying.
 * - Users can override any classification; overrides are preserved next to
 *   the AI classification (never replacing it) and recorded in the journal.
 */

export type EvidenceClassification =
  | "STRONGLY_SUPPORTS"
  | "MODERATELY_SUPPORTS"
  | "NEUTRAL"
  | "MODERATELY_CONTRADICTS"
  | "STRONGLY_CONTRADICTS"
  | "INSUFFICIENT_EVIDENCE";

export interface EvidenceItem {
  /** "numeric-change" (deterministic, from XBRL) or "narrative" (filing text). */
  kind: "numeric-change" | "narrative";
  /** Human-readable description, e.g. "Revenue FY2025 vs FY2024". */
  label: string;
  /** The evidence content given to the evaluator. */
  content: string;
  /** ISO date the evidence is as of (filing/report date). */
  asOf: string | null;
  /** Citation: accession number, EDINET docId, or document URL. */
  source: string;
  sourceUrl: string | null;
}

export interface ClaimEvaluation {
  id: string;
  thesisId: string;
  /** Version of the thesis whose claims were evaluated. */
  thesisVersion: number;
  claimId: string;
  claimStatement: string;

  classification: EvidenceClassification;
  /** Neutral explanation grounded in the evidence. */
  rationale: string;
  /** Verbatim quotes/values supporting the rationale. */
  evidenceExcerpts: string[];

  /** Provenance of the evidence set (labels + sources, serialized). */
  evidenceSummary: string;
  evidenceAsOf: string | null;

  modelId: string;
  promptVersion: string;
  createdAt: string;

  /** User override, preserved alongside — never replacing — the AI result. */
  userOverride: EvidenceClassification | null;
  userOverrideNote: string | null;
  userOverrideAt: string | null;
}

export interface EvaluationRun {
  id: string;
  thesisId: string;
  thesisVersion: number;
  createdAt: string;
  evidenceCount: number;
  evaluations: ClaimEvaluation[];
}
