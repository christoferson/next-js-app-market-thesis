import { MISSING_DISPLAY } from "@/lib/format";
import type { EvidenceClassification } from "@/lib/contradiction/types";
import type {
  ClaimKind,
  JournalEntryKind,
  ThesisStatus,
} from "@/lib/thesis/types";

/**
 * Display vocabulary for the thesis journal, shared by the server-rendered
 * pages and the client forms so a status or claim kind can never be worded two
 * different ways.
 *
 * The language describes reasoning, never a recommendation: a thesis records
 * why a decision was made and what would change it.
 */

export const THESIS_STATUS_LABEL: Record<ThesisStatus, string> = {
  active: "Active",
  invalidated: "Invalidated",
  realized: "Realized",
  abandoned: "Abandoned",
};

/** What the user is saying about the thesis by choosing a status. */
export const THESIS_STATUS_DESCRIPTION: Record<ThesisStatus, string> = {
  active: "Still the reasoning you hold.",
  invalidated: "The facts changed and the reasoning no longer holds.",
  realized: "The reasoning played out.",
  abandoned: "Set aside without being tested.",
};

export const THESIS_STATUS_ORDER: readonly ThesisStatus[] = [
  "active",
  "invalidated",
  "realized",
  "abandoned",
];

export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  growth: "Growth",
  profitability: "Profitability",
  "capital-allocation": "Capital allocation",
  "competitive-position": "Competitive position",
  valuation: "Valuation",
  other: "Other",
};

export const CLAIM_KIND_ORDER: readonly ClaimKind[] = [
  "growth",
  "profitability",
  "capital-allocation",
  "competitive-position",
  "valuation",
  "other",
];

export const CLAIM_IMPORTANCE_LABEL: Record<1 | 2 | 3, string> = {
  1: "Minor",
  2: "Significant",
  3: "Load-bearing",
};

export const CLAIM_IMPORTANCE_ORDER: readonly (1 | 2 | 3)[] = [1, 2, 3];

export const JOURNAL_KIND_LABEL: Record<JournalEntryKind, string> = {
  created: "Created",
  revised: "Revised",
  note: "Note",
  "status-changed": "Status changed",
};

/**
 * Evidence-check vocabulary (C1). A classification says how the filing
 * evidence bears on a claim — nothing more. It is never a signal to act: a
 * contradiction is a reason to reread the thesis and decide for yourself.
 */
export const CLASSIFICATION_LABELS: Record<EvidenceClassification, string> = {
  STRONGLY_SUPPORTS: "Strongly supports",
  MODERATELY_SUPPORTS: "Moderately supports",
  NEUTRAL: "Neutral",
  MODERATELY_CONTRADICTS: "Moderately contradicts",
  STRONGLY_CONTRADICTS: "Strongly contradicts",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

/** One-line meanings, shown as a legend beside the classifications. */
export const CLASSIFICATION_DESCRIPTIONS: Record<
  EvidenceClassification,
  string
> = {
  STRONGLY_SUPPORTS: "The evidence clearly matches what the claim expected.",
  MODERATELY_SUPPORTS: "The evidence leans towards the claim.",
  NEUTRAL: "The evidence bears on the claim without favouring either way.",
  MODERATELY_CONTRADICTS:
    "The evidence points against the claim — worth reviewing.",
  STRONGLY_CONTRADICTS:
    "The evidence clearly runs against the claim — worth reviewing closely.",
  INSUFFICIENT_EVIDENCE: "The filings do not say enough to judge this claim.",
};

/** Fixed order for legends and the override selector. */
export const CLASSIFICATION_ORDER: readonly EvidenceClassification[] = [
  "STRONGLY_SUPPORTS",
  "MODERATELY_SUPPORTS",
  "NEUTRAL",
  "MODERATELY_CONTRADICTS",
  "STRONGLY_CONTRADICTS",
  "INSUFFICIENT_EVIDENCE",
];

/** Subject scopes a thesis can point at, in the order the form offers them. */
export const SUBJECT_SCOPES = ["demo", "research", "research-jp"] as const;

export type SubjectScope = (typeof SUBJECT_SCOPES)[number];

export const SUBJECT_SCOPE_LABEL: Record<SubjectScope, string> = {
  demo: "Demo instrument",
  research: "US research company",
  "research-jp": "JP research company",
};

/**
 * Where a subject reference can be opened in this application. Returns null for
 * anything unrecognized rather than guessing at a route that would 404.
 */
export function subjectHref(subjectRef: string): string | null {
  const separator = subjectRef.indexOf(":");
  if (separator < 1) return null;

  const scope = subjectRef.slice(0, separator);
  const id = subjectRef.slice(separator + 1);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return null;

  switch (scope) {
    case "demo":
      return `/discover/${id}`;
    case "research":
      return `/research/${id}`;
    case "research-jp":
      return `/research/jp/${id}`;
    default:
      return null;
  }
}

/**
 * Claim values are shown exactly as the user entered them — a decimal stays a
 * decimal, because the claim's own wording says what the number means. Missing
 * values display as an em dash, never as zero.
 */
export function formatClaimValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING_DISPLAY;
  return String(value);
}
