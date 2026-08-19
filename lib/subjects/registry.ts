import "server-only";

import { getDemoSnapshots } from "@/data/demo";
import {
  RESEARCH_UNIVERSE,
  getResearchCompany,
} from "@/lib/research/universe";
import {
  JAPAN_RESEARCH_UNIVERSE,
  getJapanResearchCompany,
} from "@/lib/research/edinet/universe";

/**
 * Unified subject registry (cross-phase integration).
 *
 * Theses, transactions, and price marks all reference subjects by
 * `scope:id` strings. This module is the single source of truth for which
 * subjects exist, their display labels, native currencies, and page routes
 * — so forms can offer a picker instead of free text, and a typo like
 * "research:mfst" can be rejected at the boundary instead of creating a
 * silently unlinked record.
 */

export type SubjectScope = "demo" | "research" | "research-jp";

export interface Subject {
  /** Full reference, e.g. "research:msft". */
  ref: string;
  scope: SubjectScope;
  id: string;
  /** Display label, e.g. "Microsoft Corporation (MSFT)". */
  label: string;
  /** Short symbol/ticker for compact display. */
  symbol: string;
  /** Native trading currency (demo instruments and JP are known; US research is USD). */
  currency: "USD" | "JPY";
  /** App route for the subject's own page. */
  href: string;
  /** Grouping label for pickers. */
  groupLabel: string;
}

let cached: Subject[] | null = null;

/** All known subjects, stable order: US research, JP research, demo. */
export function listSubjects(): Subject[] {
  if (cached !== null) return cached;

  const subjects: Subject[] = [];

  for (const company of RESEARCH_UNIVERSE) {
    subjects.push({
      ref: `research:${company.id}`,
      scope: "research",
      id: company.id,
      label: `${company.name} (${company.ticker})`,
      symbol: company.ticker,
      currency: "USD",
      href: `/research/${company.id}`,
      groupLabel: "US research companies",
    });
  }

  for (const company of JAPAN_RESEARCH_UNIVERSE) {
    subjects.push({
      ref: `research-jp:${company.id}`,
      scope: "research-jp",
      id: company.id,
      label: `${company.name} (${company.ticker})`,
      symbol: company.ticker,
      currency: "JPY",
      href: `/research/jp/${company.id}`,
      groupLabel: "Japanese research companies",
    });
  }

  for (const snapshot of getDemoSnapshots()) {
    const { instrument } = snapshot;
    subjects.push({
      ref: `demo:${instrument.id}`,
      scope: "demo",
      id: instrument.id,
      label: `${instrument.name} (${instrument.symbol})`,
      symbol: instrument.symbol,
      currency: instrument.currency,
      href: `/discover/${instrument.id}`,
      groupLabel: "Demo instruments",
    });
  }

  cached = subjects;
  return subjects;
}

/** Resolve a subject reference; unknown refs return null. */
export function resolveSubject(ref: string): Subject | null {
  const colon = ref.indexOf(":");
  if (colon === -1) return null;
  const scope = ref.slice(0, colon);
  const id = ref.slice(colon + 1);

  // Fast paths avoid building the full list for single lookups.
  if (scope === "research") {
    const company = getResearchCompany(id);
    if (company === null) return null;
    return listSubjects().find((s) => s.ref === ref) ?? null;
  }
  if (scope === "research-jp") {
    const company = getJapanResearchCompany(id);
    if (company === null) return null;
    return listSubjects().find((s) => s.ref === ref) ?? null;
  }
  if (scope === "demo") {
    return listSubjects().find((s) => s.ref === ref) ?? null;
  }
  return null;
}

/** Route for a subject ref, or null when unknown. */
export function subjectHref(ref: string): string | null {
  return resolveSubject(ref)?.href ?? null;
}
