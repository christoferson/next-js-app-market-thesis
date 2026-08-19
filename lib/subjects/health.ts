import "server-only";

import { listTheses, getThesis } from "@/lib/thesis/store";
import { listEvaluationRuns } from "@/lib/contradiction/store";
import type { ThesisStatus } from "@/lib/thesis/types";

/**
 * Thesis-health read model (cross-phase integration, SPEC §25 "thesis
 * health by position"). Joins a subject to its theses and the latest
 * evidence-check outcome, for display on portfolio rows and research pages.
 *
 * Health here is DESCRIPTIVE state (what exists, what the last check said),
 * never a judgment: price performance and thesis health stay separate, and
 * a contradiction reads as "review", not an instruction.
 */

export interface SubjectThesisHealth {
  subjectRef: string;
  /** Theses for this subject, most recently updated first. */
  theses: Array<{
    thesisId: string;
    title: string;
    status: ThesisStatus;
    currentVersion: number;
    updatedAt: string;
    lastCheck: {
      runId: string;
      checkedAt: string;
      claimCount: number;
      contradictedCount: number;
      supportedCount: number;
      insufficientCount: number;
      /** True when any user override exists in the latest run. */
      hasOverrides: boolean;
    } | null;
  }>;
}

/** Health for a single subject. Subjects without theses return empty. */
export function getSubjectThesisHealth(
  subjectRef: string
): SubjectThesisHealth {
  const theses = listTheses().filter(
    (thesis) => thesis.subjectRef === subjectRef
  );

  return {
    subjectRef,
    theses: theses.map((thesis) => {
      const withHistory = getThesis(thesis.id);
      const currentTitle =
        withHistory?.versions[withHistory.versions.length - 1]?.title ??
        "(untitled)";

      const runs = listEvaluationRuns(thesis.id);
      const latest = runs[0];

      return {
        thesisId: thesis.id,
        title: currentTitle,
        status: thesis.status,
        currentVersion: thesis.currentVersion,
        updatedAt: thesis.updatedAt,
        lastCheck:
          latest === undefined
            ? null
            : {
                runId: latest.runId,
                checkedAt: latest.createdAt,
                claimCount: latest.evaluations.length,
                contradictedCount: latest.evaluations.filter((evaluation) =>
                  effectiveClassification(evaluation).includes("CONTRADICTS")
                ).length,
                supportedCount: latest.evaluations.filter((evaluation) =>
                  effectiveClassification(evaluation).includes("SUPPORTS")
                ).length,
                insufficientCount: latest.evaluations.filter(
                  (evaluation) =>
                    effectiveClassification(evaluation) ===
                    "INSUFFICIENT_EVIDENCE"
                ).length,
                hasOverrides: latest.evaluations.some(
                  (evaluation) => evaluation.userOverride !== null
                ),
              },
      };
    }),
  };
}

/**
 * The user's override, when present, is the effective reading for summary
 * counts — the AI classification remains preserved and visible on the
 * evaluation itself.
 */
function effectiveClassification(evaluation: {
  classification: string;
  userOverride: string | null;
}): string {
  return evaluation.userOverride ?? evaluation.classification;
}

/** Batch health lookup keyed by subjectRef (for the portfolio table). */
export function getThesisHealthBySubject(
  subjectRefs: readonly string[]
): Map<string, SubjectThesisHealth> {
  const result = new Map<string, SubjectThesisHealth>();
  for (const ref of new Set(subjectRefs)) {
    result.set(ref, getSubjectThesisHealth(ref));
  }
  return result;
}
