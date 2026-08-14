/**
 * Investment Thesis Journal domain (Phase T, milestone T1).
 *
 * Product rules (SPEC §25 Phase T / §24.5):
 * - A thesis is the user's reasoning, preserved faithfully: revisions never
 *   overwrite — every version is kept, the original forever.
 * - Claims are measurable where possible: baseline, target, invalidation
 *   threshold, deadline — so Phase C can later test them against evidence.
 * - A thesis links to an instrument by stable ID (demo instrument or
 *   research company); price performance and thesis health stay separate.
 * - Deterministic only in T1: no AI drafting, no scoring of theses.
 */

export type ThesisStatus = "active" | "invalidated" | "realized" | "abandoned";

export type ClaimKind =
  | "growth"
  | "profitability"
  | "capital-allocation"
  | "competitive-position"
  | "valuation"
  | "other";

export interface ThesisClaim {
  id: string;
  kind: ClaimKind;
  /** The falsifiable statement, e.g. "Operating margin reaches 15% by FY2027". */
  statement: string;
  /** Metric context, free text in T1 (e.g. "operating margin, TTM"). */
  metricDescription: string | null;
  /** Decimal/ratio conventions follow house rules. Null = not quantified. */
  baselineValue: number | null;
  targetValue: number | null;
  /** Value at which the claim should be considered broken. */
  invalidationValue: number | null;
  /** ISO date by which the claim should have played out. */
  deadline: string | null;
  /** 1 (minor) – 3 (load-bearing for the thesis). */
  importance: 1 | 2 | 3;
}

export interface ThesisVersion {
  version: number;
  createdAt: string;

  title: string;
  /** Why the business is attractive — the core narrative. */
  summary: string;
  /** What the market may be underestimating. */
  edge: string | null;
  /** The strongest argument against — required thinking, optional field. */
  bearCase: string | null;
  /** Expected holding horizon, free text ("3-5 years"). */
  timeHorizon: string | null;

  claims: ThesisClaim[];
}

export interface Thesis {
  id: string;
  /** Stable instrument/company reference, e.g. "demo:stock-us-northstar-software" or "research:aapl" or "research-jp:toyota". */
  subjectRef: string;
  subjectLabel: string;
  status: ThesisStatus;
  createdAt: string;
  updatedAt: string;

  /** Latest version (denormalized for listing). */
  currentVersion: number;
}

export interface ThesisWithHistory extends Thesis {
  versions: ThesisVersion[];
}

export type JournalEntryKind =
  | "created"
  | "revised"
  | "note"
  | "status-changed";

/** Append-only decision journal — entries are never edited or deleted. */
export interface JournalEntry {
  id: string;
  thesisId: string;
  kind: JournalEntryKind;
  createdAt: string;
  text: string;
  /** Version the entry refers to, when applicable. */
  version: number | null;
}
