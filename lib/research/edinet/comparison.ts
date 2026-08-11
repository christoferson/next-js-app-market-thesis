import "server-only";

import { getAnalysisClient } from "@/lib/research/analysis/get-client";
import type { NarrativeComparison } from "@/lib/research/analysis/types";
import {
  ANNUAL_REPORT_DOC_TYPE,
  redactUrl,
} from "./client";
import { listCompanyFilings, type StoredFiling } from "./store";
import {
  getJapanResearchCompany,
  type JapanResearchCompany,
} from "./universe";

/**
 * R3 cross-lingual "What Changed?": compares the two most recent annual
 * reports' 事業等のリスク sections. Filing text is Japanese; the analysis
 * output is English and labeled translation-assisted. Reuses the R2
 * analysis facade unchanged — the prompt already carries the section
 * title, and the model handles Japanese input natively.
 */

export interface JapanFilingRef {
  docId: string;
  submitDate: string;
  periodEnd: string | null;
  /** EDINET's viewer URL for the filing (no API key involved). */
  viewerUrl: string;
}

export interface JapanComparisonResult {
  comparison: NarrativeComparison;
  sectionTitle: string;
  crossLingualNote: string;
  current: JapanFilingRef;
  prior: JapanFilingRef;
}

export interface JapanComparisonUnavailable {
  unavailable: true;
  reason: string;
}

export type JapanComparisonOutcome =
  | JapanComparisonResult
  | JapanComparisonUnavailable;

const cache = new Map<string, JapanComparisonOutcome>();
const CACHE_MAX_ENTRIES = 32;

export const CROSS_LINGUAL_NOTE =
  "The source filings are in Japanese; findings and quotes below are " +
  "AI-assisted translations. Verify against the linked original documents.";

function toRef(filing: StoredFiling): JapanFilingRef {
  return {
    docId: filing.docId,
    submitDate: filing.submitDate,
    periodEnd: filing.periodEnd,
    viewerUrl: `https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?${filing.docId}`,
  };
}

export async function compareJapanRiskFactors(
  companyId: string
): Promise<JapanComparisonOutcome | null> {
  const company = getJapanResearchCompany(companyId);
  if (company === null) return null;

  const cached = cache.get(companyId);
  if (cached !== undefined) return cached;

  const filings = listCompanyFilings(
    company.edinetCode,
    ANNUAL_REPORT_DOC_TYPE,
    2
  );

  if (filings.length < 2) {
    return remember(companyId, {
      unavailable: true,
      reason:
        "Fewer than two annual reports are in the local filing store for this company. Run the EDINET sync for the relevant filing windows first (see README).",
    });
  }

  const [current, prior] = filings as [StoredFiling, StoredFiling];
  if (current.riskText === null || prior.riskText === null) {
    return remember(companyId, {
      unavailable: true,
      reason:
        "The business-risk section could not be extracted from one of the stored filings, so the comparison is unavailable rather than approximated.",
    });
  }

  const client = getAnalysisClient();
  const comparison = await client.compareNarratives({
    companyName: `${company.name} (${company.nativeName})`,
    sectionTitle:
      "Business Risks (事業等のリスク) — Japanese source text; respond in English",
    currentPeriodLabel: periodLabel(current),
    priorPeriodLabel: periodLabel(prior),
    currentText: current.riskText,
    priorText: prior.riskText,
  });

  return remember(companyId, {
    comparison,
    sectionTitle: "Business Risks (事業等のリスク)",
    crossLingualNote: CROSS_LINGUAL_NOTE,
    current: toRef(current),
    prior: toRef(prior),
  });
}

function remember(
  companyId: string,
  outcome: JapanComparisonOutcome
): JapanComparisonOutcome {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(companyId, outcome);
  return outcome;
}

function periodLabel(filing: StoredFiling): string {
  return filing.periodEnd !== null
    ? `fiscal year ended ${filing.periodEnd}`
    : `submitted ${filing.submitDate}`;
}

export { redactUrl };

/** Company + stored-filing summary for the JP research page. */
export interface JapanCompanyResearch {
  company: JapanResearchCompany;
  filings: Array<{
    docId: string;
    docTypeCode: string;
    docDescription: string | null;
    submitDate: string;
    periodEnd: string | null;
    hasRiskText: boolean;
    viewerUrl: string;
  }>;
}

export function getJapanCompanyResearch(
  companyId: string
): JapanCompanyResearch | null {
  const company = getJapanResearchCompany(companyId);
  if (company === null) return null;

  const annual = listCompanyFilings(company.edinetCode, "120", 10);
  const semiannual = listCompanyFilings(company.edinetCode, "160", 10);
  const filings = [...annual, ...semiannual]
    .sort((a, b) => (a.submitDate < b.submitDate ? 1 : -1))
    .map((f) => ({
      docId: f.docId,
      docTypeCode: f.docTypeCode,
      docDescription: f.docDescription,
      submitDate: f.submitDate,
      periodEnd: f.periodEnd,
      hasRiskText: f.riskText !== null,
      viewerUrl: `https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?${f.docId}`,
    }));

  return { company, filings };
}
