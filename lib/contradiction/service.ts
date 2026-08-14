import "server-only";

import { MarketDataError } from "@/lib/market-data/errors";
import { getThesis, appendNote } from "@/lib/thesis/store";
import { gatherEvidence } from "./evidence";
import { getClaimEvaluator } from "./evaluator";
import { insertEvaluationRun, listEvaluationRuns } from "./store";
import type { ClaimEvaluation } from "./types";

/**
 * Contradiction Engine orchestration (C1): thesis → evidence → evaluation →
 * stored results. On-demand only (each run costs a model call). A run is
 * recorded in the thesis journal so the decision record stays complete.
 */

export interface CheckResult {
  runId: string;
  createdAt: string;
  thesisVersion: number;
  evidenceCount: number;
  evaluations: ClaimEvaluation[];
}

export interface CheckUnavailable {
  unavailable: true;
  reason: string;
}

export type CheckOutcome = CheckResult | CheckUnavailable;

export async function checkThesisAgainstEvidence(
  thesisId: string
): Promise<CheckOutcome | null> {
  const thesis = getThesis(thesisId);
  if (thesis === null) return null;

  const currentVersion = thesis.versions[thesis.versions.length - 1];
  if (currentVersion === undefined) {
    throw new MarketDataError("INTERNAL_ERROR", "The thesis has no versions.");
  }

  const bundle = await gatherEvidence(thesis.subjectRef);
  if (bundle.unsupported) {
    return { unavailable: true, reason: bundle.unsupportedReason ?? "Unsupported subject." };
  }
  if (bundle.items.length === 0) {
    return {
      unavailable: true,
      reason:
        "No filing evidence is available for this subject yet. For Japanese subjects, run the EDINET sync first; for US subjects, EDGAR may be temporarily unavailable.",
    };
  }

  const evaluator = getClaimEvaluator();
  const result = await evaluator.evaluateClaims({
    companyLabel: thesis.subjectLabel,
    claims: currentVersion.claims,
    evidence: bundle.items,
  });

  // Map returned evaluations back to real claims; the model must address
  // each claim by its exact id — unknown ids are dropped, missing claims
  // become explicit INSUFFICIENT_EVIDENCE rows (never silently absent).
  const byClaimId = new Map(
    result.output.evaluations.map((evaluation) => [
      evaluation.claimId,
      evaluation,
    ])
  );

  const evidenceSummary = bundle.items
    .map((item) => `${item.label} [${item.source}]`)
    .join("; ");
  const evidenceAsOf =
    bundle.items
      .map((item) => item.asOf)
      .filter((asOf): asOf is string => asOf !== null)
      .sort()
      .pop() ?? null;

  const rows = currentVersion.claims.map((claim) => {
    const evaluation = byClaimId.get(claim.id);
    return {
      thesisId,
      thesisVersion: currentVersion.version,
      claimId: claim.id,
      claimStatement: claim.statement,
      classification: evaluation?.classification ?? ("INSUFFICIENT_EVIDENCE" as const),
      rationale:
        evaluation?.rationale ??
        "The model did not address this claim; treated as insufficient evidence.",
      evidenceExcerpts: evaluation?.evidenceExcerpts ?? [],
      evidenceSummary,
      evidenceAsOf,
      modelId: result.modelId,
      promptVersion: result.promptVersion,
    };
  });

  const { runId, createdAt } = insertEvaluationRun(rows);

  // The decision journal records that a check happened (not its verdicts —
  // those live in the evaluation history with full provenance).
  const contradictions = rows.filter((row) =>
    row.classification.includes("CONTRADICTS")
  ).length;
  appendNote(
    thesisId,
    `Evidence check run against ${bundle.items.length} evidence item(s). ` +
      `${contradictions} claim(s) classified as contradicted — ` +
      (contradictions > 0
        ? "review recommended."
        : "no contradictions flagged.")
  );

  const stored = listEvaluationRuns(thesisId).find((run) => run.runId === runId);
  return {
    runId,
    createdAt,
    thesisVersion: currentVersion.version,
    evidenceCount: bundle.items.length,
    evaluations: stored?.evaluations ?? [],
  };
}
