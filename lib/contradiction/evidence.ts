import "server-only";

import type { EvidenceItem } from "./types";
import { getResearchCompany } from "@/lib/research/universe";
import { fetchCompanyFacts, fetchSubmissions } from "@/lib/research/edgar/client";
import { buildAnnualChanges } from "@/lib/research/changes";
import { fetchFilingDocument } from "@/lib/research/edgar/documents";
import {
  RISK_FACTORS_BOUNDS,
  extractSection,
  htmlToText,
} from "@/lib/research/edgar/sections";
import { getJapanResearchCompany } from "@/lib/research/edinet/universe";
import { listCompanyFilings } from "@/lib/research/edinet/store";
import { formatCompactNumber } from "@/lib/format";

/**
 * Evidence gathering (C1): assemble the newest filing evidence for a thesis
 * subject from the existing R1–R3 pipelines. Deterministic numeric changes
 * come from XBRL; narrative comes from risk sections. The engine never
 * fabricates evidence — an unavailable source yields fewer items, and zero
 * items yields an honest "insufficient evidence" outcome upstream.
 */

const MAX_NARRATIVE_CHARS = 60_000;

export interface EvidenceBundle {
  items: EvidenceItem[];
  subjectKind: "research" | "research-jp" | "demo" | "unknown";
  /** True when the subject can never produce evidence in C1 (demo subjects). */
  unsupported: boolean;
  unsupportedReason: string | null;
}

export async function gatherEvidence(subjectRef: string): Promise<EvidenceBundle> {
  const [scope, id] = splitRef(subjectRef);

  if (scope === "research") {
    return { items: await gatherUsEvidence(id), subjectKind: "research", unsupported: false, unsupportedReason: null };
  }
  if (scope === "research-jp") {
    return { items: gatherJapanEvidence(id), subjectKind: "research-jp", unsupported: false, unsupportedReason: null };
  }
  if (scope === "demo") {
    return {
      items: [],
      subjectKind: "demo",
      unsupported: true,
      unsupportedReason:
        "This thesis is about a fictional demo instrument, which has no real filings. Evidence checking works for research subjects (research: or research-jp:).",
    };
  }
  return {
    items: [],
    subjectKind: "unknown",
    unsupported: true,
    unsupportedReason: "The thesis subject reference is not recognized.",
  };
}

function splitRef(subjectRef: string): [string, string] {
  const colon = subjectRef.indexOf(":");
  if (colon === -1) return ["", subjectRef];
  return [subjectRef.slice(0, colon), subjectRef.slice(colon + 1)];
}

/** US: deterministic annual changes + latest risk-factors narrative. */
async function gatherUsEvidence(companyId: string): Promise<EvidenceItem[]> {
  const company = getResearchCompany(companyId);
  if (company === null) return [];

  const items: EvidenceItem[] = [];

  const facts = await fetchCompanyFacts(company.cik);
  const changes = buildAnnualChanges(facts);
  for (const change of changes) {
    if (change.current === null || change.prior === null) continue;
    const direction =
      change.absoluteChange === null
        ? "unchanged"
        : change.absoluteChange > 0
          ? "increased"
          : change.absoluteChange < 0
            ? "decreased"
            : "unchanged";
    const relative =
      change.relativeChange === null
        ? ""
        : ` (${(change.relativeChange * 100).toFixed(1)}% ${direction})`;
    items.push({
      kind: "numeric-change",
      label: `${change.label}: latest vs prior fiscal year`,
      content:
        `${change.label} ${direction} from ${formatCompactNumber(change.prior.value)} ` +
        `(period ending ${change.prior.periodEnd}) to ${formatCompactNumber(change.current.value)} ` +
        `(period ending ${change.current.periodEnd})${relative}. ` +
        `Values from XBRL tag ${change.current.sourceTag}.`,
      asOf: change.current.periodEnd,
      source: `EDGAR ${change.current.form} ${change.current.accessionNumber}`,
      sourceUrl: null,
    });
  }

  // Latest 10-K risk-factors narrative (may be unavailable — that's fine).
  try {
    const submissions = await fetchSubmissions(company.cik);
    const { recent } = submissions.filings;
    for (let i = 0; i < recent.form.length; i += 1) {
      if (recent.form[i] !== "10-K") continue;
      const accession = recent.accessionNumber[i];
      const primaryDoc = recent.primaryDocument[i];
      const reportDate = recent.reportDate[i];
      if (accession === undefined || primaryDoc === undefined) break;

      const url = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accession.replaceAll("-", "")}/${primaryDoc}`;
      const html = await fetchFilingDocument(url);
      const section = extractSection(htmlToText(html), RISK_FACTORS_BOUNDS);
      if (section !== null) {
        items.push({
          kind: "narrative",
          label: "Risk Factors (Item 1A), latest 10-K",
          content: section.text.slice(0, MAX_NARRATIVE_CHARS),
          asOf: reportDate === "" ? null : (reportDate ?? null),
          source: `EDGAR 10-K ${accession}`,
          sourceUrl: url,
        });
      }
      break;
    }
  } catch {
    // Narrative evidence is best-effort; numeric evidence stands alone.
  }

  return items;
}

/** Japan: latest stored annual-report risk narrative (local EDINET store). */
function gatherJapanEvidence(companyId: string): EvidenceItem[] {
  const company = getJapanResearchCompany(companyId);
  if (company === null) return [];

  const filings = listCompanyFilings(company.edinetCode, "120", 1);
  const latest = filings[0];
  if (latest === undefined || latest.riskText === null) return [];

  return [
    {
      kind: "narrative",
      label: "Business Risks (事業等のリスク), latest annual report",
      content: latest.riskText.slice(0, MAX_NARRATIVE_CHARS),
      asOf: latest.periodEnd,
      source: `EDINET ${latest.docId}`,
      sourceUrl: `https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?${latest.docId}`,
    },
  ];
}
