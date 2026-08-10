import "server-only";

import { fetchCompanyFacts, fetchSubmissions } from "./edgar/client";
import { buildAnnualChanges, type FinancialLineChange } from "./changes";
import {
  getResearchCompany,
  type ResearchCompany,
} from "./universe";

/**
 * R1 research service: filing timeline + deterministic annual change table
 * for a curated universe of real US filers. Data is REAL (SEC filings),
 * unlike Discovery's fictional demo market data — the UI labels this.
 */

export interface FilingSummary {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  primaryDocument: string;
  description: string | null;
  /** 8-K item codes when present (e.g. "2.02,9.01"). */
  items: string | null;
  /** Direct citation link to the primary document on sec.gov. */
  documentUrl: string;
}

export interface CompanyResearch {
  company: ResearchCompany;
  entityName: string;
  fiscalYearEnd: string | null;
  filings: FilingSummary[];
  changes: FinancialLineChange[];
  /** When this data was fetched from EDGAR (server time, ISO). */
  fetchedAt: string;
}

const TIMELINE_FORMS = new Set([
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  "8-K",
  "8-K/A",
]);
const TIMELINE_LIMIT = 40;

function documentUrl(
  cik: number,
  accessionNumber: string,
  primaryDocument: string
): string {
  const accessionPath = accessionNumber.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/${primaryDocument}`;
}

export async function getCompanyResearch(
  companyId: string
): Promise<CompanyResearch | null> {
  const company = getResearchCompany(companyId);
  if (company === null) return null;

  const [submissions, companyFacts] = await Promise.all([
    fetchSubmissions(company.cik),
    fetchCompanyFacts(company.cik),
  ]);

  const { recent } = submissions.filings;
  const filings: FilingSummary[] = [];
  for (
    let index = 0;
    index < recent.form.length && filings.length < TIMELINE_LIMIT;
    index += 1
  ) {
    const form = recent.form[index];
    if (form === undefined || !TIMELINE_FORMS.has(form)) continue;

    const accessionNumber = recent.accessionNumber[index];
    const filingDate = recent.filingDate[index];
    const primaryDocument = recent.primaryDocument[index];
    if (
      accessionNumber === undefined ||
      filingDate === undefined ||
      primaryDocument === undefined
    ) {
      continue;
    }

    filings.push({
      accessionNumber,
      form,
      filingDate,
      reportDate:
        recent.reportDate[index] === "" ? null : (recent.reportDate[index] ?? null),
      primaryDocument,
      description: recent.primaryDocDescription?.[index] ?? null,
      items: recent.items?.[index] === "" ? null : (recent.items?.[index] ?? null),
      documentUrl: documentUrl(company.cik, accessionNumber, primaryDocument),
    });
  }

  return {
    company,
    entityName: companyFacts.entityName,
    fiscalYearEnd: submissions.fiscalYearEnd ?? null,
    filings,
    changes: buildAnnualChanges(companyFacts),
    fetchedAt: new Date().toISOString(),
  };
}
