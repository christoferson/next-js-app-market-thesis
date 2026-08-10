import type { EdgarCompanyFacts, XbrlFact } from "./schemas";
import { parseConcept } from "./schemas";

/**
 * Pure XBRL fact selection (R1).
 *
 * Pitfalls this module exists to handle (verified against live EDGAR data
 * during evaluation — see docs/references/sec-edgar/):
 * - `fy`/`fp` describe the FILING, not the fact's period: the same FY2024
 *   revenue appears again as the comparative in the FY2025 10-K. Facts must
 *   be grouped by their own (start, end) and deduped by latest `filed`.
 * - Concept drift: revenue moved between tags over time, so callers pass an
 *   ordered tag-fallback list and we record which tag supplied the value.
 * - A missing concept is null, never zero.
 */

export interface SelectedFact {
  value: number;
  unit: string;
  periodStart: string | null;
  periodEnd: string;
  accessionNumber: string;
  form: string;
  filedDate: string;
  /** The taxonomy tag that actually supplied this value. */
  sourceTag: string;
}

/** An annual (10-K) series for one concept, most recent period first. */
export interface AnnualSeries {
  facts: SelectedFact[];
  sourceTag: string;
}

const ANNUAL_FORMS = new Set(["10-K", "10-K/A"]);

/** Approximate duration in days; annual durations are ~350–380 days. */
function durationDays(fact: XbrlFact): number | null {
  if (fact.start === undefined) return null;
  const start = Date.parse(fact.start);
  const end = Date.parse(fact.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return (end - start) / 86_400_000;
}

function isAnnualDuration(fact: XbrlFact): boolean {
  const days = durationDays(fact);
  return days !== null && days >= 340 && days <= 400;
}

/**
 * Dedupe facts sharing the same period, keeping the most recently filed
 * (amendments and later comparatives restate earlier values).
 */
function dedupeByPeriod(facts: readonly XbrlFact[]): XbrlFact[] {
  const byPeriod = new Map<string, XbrlFact>();
  for (const fact of facts) {
    const key = `${fact.start ?? ""}|${fact.end}`;
    const existing = byPeriod.get(key);
    if (existing === undefined || fact.filed > existing.filed) {
      byPeriod.set(key, fact);
    }
  }
  return [...byPeriod.values()];
}

export interface SelectAnnualOptions {
  /** Ordered tag preferences; the first tag with usable data wins. */
  tags: readonly string[];
  taxonomy?: "us-gaap" | "ifrs-full";
  /** Preferred unit keys, in order. Defaults to USD-style units. */
  units?: readonly string[];
  /** Instant concepts (balance-sheet items) have no start date. */
  kind: "duration" | "instant";
  /** Maximum periods returned (most recent first). */
  limit?: number;
}

const DEFAULT_UNITS = ["USD", "USD/shares", "shares", "pure"];

/**
 * Select an annual series for a concept with tag fallback. Returns null when
 * no listed tag has usable annual data — absence of data is null, never 0.
 */
export function selectAnnualSeries(
  companyFacts: EdgarCompanyFacts,
  options: SelectAnnualOptions
): AnnualSeries | null {
  const taxonomy = options.taxonomy ?? "us-gaap";
  const units = options.units ?? DEFAULT_UNITS;
  const limit = options.limit ?? 6;

  for (const tag of options.tags) {
    const concept = parseConcept(companyFacts, taxonomy, tag);
    if (concept === null) continue;

    const unitKey = units.find((u) => concept.units[u] !== undefined);
    if (unitKey === undefined) continue;
    const rawFacts = concept.units[unitKey] ?? [];

    const annualFacts = rawFacts.filter((fact) => {
      if (!ANNUAL_FORMS.has(fact.form)) return false;
      if (!Number.isFinite(fact.val)) return false;
      return options.kind === "duration"
        ? isAnnualDuration(fact)
        : fact.start === undefined;
    });

    // Instant facts from 10-Ks include comparative balance-sheet dates from
    // prior filings; durations repeat as comparatives too. Both cases dedupe
    // the same way: one fact per (start, end) period, latest `filed` wins,
    // so amendments and later comparatives restate earlier values.
    const deduped = dedupeByPeriod(annualFacts)
      .sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0))
      .slice(0, limit);

    if (deduped.length > 0) {
      return {
        sourceTag: tag,
        facts: deduped.map((fact) => ({
          value: fact.val,
          unit: unitKey,
          periodStart: fact.start ?? null,
          periodEnd: fact.end,
          accessionNumber: fact.accn,
          form: fact.form,
          filedDate: fact.filed,
          sourceTag: tag,
        })),
      };
    }
  }

  return null;
}
