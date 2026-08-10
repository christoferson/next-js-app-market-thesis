import "server-only";

import { MarketDataError } from "@/lib/market-data/errors";
import { fetchSubmissions } from "./edgar/client";
import { fetchFilingDocument } from "./edgar/documents";
import {
  RISK_FACTORS_BOUNDS,
  extractSection,
  htmlToText,
} from "./edgar/sections";
import { getAnalysisClient } from "./analysis/get-client";
import type { NarrativeComparison } from "./analysis/types";
import { getResearchCompany } from "./universe";

/**
 * R2 "What Changed?" narrative comparison: the two most recent 10-K risk-
 * factor sections, compared by the analysis model with citations.
 *
 * Results are cached in-memory per company: filings change rarely and each
 * analysis costs real money — one Bedrock call per company per server
 * lifetime (or until the cache rolls).
 */

export interface NarrativeComparisonResult {
  comparison: NarrativeComparison;
  sectionTitle: string;
  current: FilingRef;
  prior: FilingRef;
}

export interface FilingRef {
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  documentUrl: string;
}

export interface SectionUnavailableResult {
  unavailable: true;
  reason: string;
}

export type ComparisonOutcome =
  | NarrativeComparisonResult
  | SectionUnavailableResult;

const cache = new Map<string, ComparisonOutcome>();
const CACHE_MAX_ENTRIES = 32;

export async function compareRiskFactors(
  companyId: string
): Promise<ComparisonOutcome | null> {
  const company = getResearchCompany(companyId);
  if (company === null) return null;

  const cached = cache.get(companyId);
  if (cached !== undefined) return cached;

  const submissions = await fetchSubmissions(company.cik);
  const { recent } = submissions.filings;

  // The two most recent original 10-Ks (amendments change numbers more often
  // than narrative; keeping originals keeps period labels clean for v1).
  const tenKs: Array<{ index: number }> = [];
  for (let i = 0; i < recent.form.length && tenKs.length < 2; i += 1) {
    if (recent.form[i] === "10-K") tenKs.push({ index: i });
  }
  if (tenKs.length < 2) {
    return remember(companyId, {
      unavailable: true,
      reason:
        "EDGAR lists fewer than two 10-K filings for this company, so a year-over-year comparison is not possible.",
    });
  }

  const [currentRef, priorRef] = await Promise.all([
    toFilingRef(company.cik, recent, tenKs[0]!.index),
    toFilingRef(company.cik, recent, tenKs[1]!.index),
  ]);

  const [currentSection, priorSection] = await Promise.all([
    loadRiskFactors(currentRef),
    loadRiskFactors(priorRef),
  ]);

  if (currentSection === null || priorSection === null) {
    return remember(companyId, {
      unavailable: true,
      reason:
        "The risk-factors section could not be located in one of the filings, so the comparison is unavailable rather than approximated.",
    });
  }

  const client = getAnalysisClient();
  const comparison = await client.compareNarratives({
    companyName: company.name,
    sectionTitle: "Risk Factors (Item 1A)",
    currentPeriodLabel: periodLabel(currentRef),
    priorPeriodLabel: periodLabel(priorRef),
    currentText: currentSection,
    priorText: priorSection,
  });

  return remember(companyId, {
    comparison,
    sectionTitle: "Risk Factors (Item 1A)",
    current: currentRef,
    prior: priorRef,
  });
}

function remember(
  companyId: string,
  outcome: ComparisonOutcome
): ComparisonOutcome {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(companyId, outcome);
  return outcome;
}

interface RecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  primaryDocument: string[];
}

async function toFilingRef(
  cik: number,
  recent: RecentFilings,
  index: number
): Promise<FilingRef> {
  const accessionNumber = recent.accessionNumber[index];
  const filingDate = recent.filingDate[index];
  const primaryDocument = recent.primaryDocument[index];
  if (
    accessionNumber === undefined ||
    filingDate === undefined ||
    primaryDocument === undefined
  ) {
    throw new MarketDataError(
      "PROVIDER_INVALID_RESPONSE",
      "The EDGAR filing index entry was incomplete."
    );
  }
  const accessionPath = accessionNumber.replaceAll("-", "");
  return {
    accessionNumber,
    filingDate,
    reportDate:
      recent.reportDate[index] === "" ? null : (recent.reportDate[index] ?? null),
    documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/${primaryDocument}`,
  };
}

async function loadRiskFactors(ref: FilingRef): Promise<string | null> {
  const html = await fetchFilingDocument(ref.documentUrl);
  const plain = htmlToText(html);
  const section = extractSection(plain, RISK_FACTORS_BOUNDS);
  return section?.text ?? null;
}

function periodLabel(ref: FilingRef): string {
  return ref.reportDate !== null
    ? `fiscal year ended ${ref.reportDate}`
    : `filed ${ref.filingDate}`;
}
