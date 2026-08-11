"use client";

import { useState } from "react";

import { formatDate } from "@/lib/format";
import type {
  ChangeType,
  ComparisonFinding,
  FindingClassification,
  NarrativeComparison,
} from "@/lib/research/analysis/types";

/**
 * "What Changed" narrative comparison: the AI-assisted section shared by the
 * US (SEC EDGAR, R2) and Japanese (EDINET, R3) research pages.
 *
 * The comparison is a real model invocation with a real cost, so it never runs
 * on page load — the user asks for it explicitly, and the browser then calls
 * the server route that owns the analysis. Nothing here knows about Bedrock,
 * AWS, or prompts; it renders whatever the server reports, including the
 * classification of every statement (SPEC §24.3).
 *
 * The two markets differ only in wording, endpoint, and the shape of a filing
 * reference. Those are props and a tolerant reader rather than a second copy
 * of this component, so a change to the analysis UI cannot drift between
 * markets. Every prop defaults to the US behaviour.
 */

/* ---------------------------------------------------------- API envelope */

/**
 * The route's payload shape. Declared locally rather than imported: the
 * comparison services are server-only, and an HTTP response is an external
 * boundary for the browser too — it is validated below, not trusted.
 *
 * A filing reference is identified differently per market (EDGAR accession
 * number and document URL; EDINET document ID and viewer URL), so each is
 * read into one display-ready shape instead of being handled downstream.
 */
interface NormalizedFilingRef {
  /** Absolute URL of the original document on the regulator's site. */
  url: string;
  /** Human period description, e.g. "year ended Mar 31, 2025". */
  periodLabel: string;
}

interface ComparisonPayload {
  comparison: NarrativeComparison;
  sectionTitle: string;
  /** Present for cross-lingual comparisons (Japanese source, English output). */
  crossLingualNote: string | null;
  current: NormalizedFilingRef;
  prior: NormalizedFilingRef;
}

interface UnavailablePayload {
  unavailable: true;
  reason: string;
}

type OutcomePayload = ComparisonPayload | UnavailablePayload;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asOptionalDate(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Reads either market's filing reference. EDGAR reports `documentUrl` with a
 * `filingDate`/`reportDate` pair; EDINET reports `viewerUrl` with a
 * `submitDate`/`periodEnd` pair. Anything else is rejected rather than
 * rendered as a link to nowhere.
 */
function readFilingRef(value: unknown): NormalizedFilingRef | null {
  const candidate = asRecord(value);
  if (candidate === null) return null;

  const url =
    typeof candidate.documentUrl === "string"
      ? candidate.documentUrl
      : typeof candidate.viewerUrl === "string"
        ? candidate.viewerUrl
        : null;
  if (url === null) return null;

  const period =
    asOptionalDate(candidate.reportDate) ?? asOptionalDate(candidate.periodEnd);
  if (period !== null) {
    return { url, periodLabel: `year ended ${formatDate(period)}` };
  }

  const filed =
    asOptionalDate(candidate.filingDate) ?? asOptionalDate(candidate.submitDate);
  if (filed === null) return null;
  return { url, periodLabel: `filed ${formatDate(filed)}` };
}

const CLASSIFICATIONS: readonly FindingClassification[] = [
  "REPORTED_FACT",
  "MANAGEMENT_CLAIM",
  "AI_INTERPRETATION",
];
const CHANGE_TYPES: readonly ChangeType[] = ["added", "removed", "modified"];

function isFinding(value: unknown): value is ComparisonFinding {
  const candidate = asRecord(value);
  if (candidate === null) return false;
  const { classification, changeType, summary } = candidate;
  return (
    typeof classification === "string" &&
    CLASSIFICATIONS.includes(classification as FindingClassification) &&
    typeof changeType === "string" &&
    CHANGE_TYPES.includes(changeType as ChangeType) &&
    typeof summary === "string"
  );
}

function isComparison(value: unknown): value is NarrativeComparison {
  const candidate = asRecord(value);
  return (
    candidate !== null &&
    Array.isArray(candidate.findings) &&
    candidate.findings.every(isFinding) &&
    typeof candidate.overallSummary === "string" &&
    typeof candidate.modelId === "string" &&
    typeof candidate.promptVersion === "string" &&
    typeof candidate.generatedAt === "string"
  );
}

function readOutcome(value: unknown): OutcomePayload | null {
  const envelope = asRecord(value);
  const data = asRecord(envelope?.data);
  if (data === null) return null;

  if (data.unavailable === true) {
    return typeof data.reason === "string"
      ? { unavailable: true, reason: data.reason }
      : null;
  }

  const current = readFilingRef(data.current);
  const prior = readFilingRef(data.prior);

  if (
    isComparison(data.comparison) &&
    typeof data.sectionTitle === "string" &&
    current !== null &&
    prior !== null
  ) {
    return {
      comparison: data.comparison,
      sectionTitle: data.sectionTitle,
      crossLingualNote:
        typeof data.crossLingualNote === "string" ? data.crossLingualNote : null,
      current,
      prior,
    };
  }

  return null;
}

interface RouteFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Read the route's readable error; never surface raw internals. */
function readFailure(value: unknown): RouteFailure | null {
  const error = asRecord(asRecord(value)?.error);
  if (error === null || typeof error.message !== "string") return null;
  return {
    code: typeof error.code === "string" ? error.code : "UNKNOWN",
    message: error.message,
    retryable: error.retryable === true,
  };
}

/* -------------------------------------------------------------- labelling */

const CLASSIFICATION_LABEL: Record<FindingClassification, string> = {
  REPORTED_FACT: "REPORTED FACT",
  MANAGEMENT_CLAIM: "MANAGEMENT CLAIM",
  AI_INTERPRETATION: "AI INTERPRETATION",
};

/**
 * Every badge shares one neutral palette; the border treatment differs so the
 * three kinds remain distinguishable without relying on colour, and the label
 * text alone is always sufficient.
 */
const CLASSIFICATION_BORDER: Record<FindingClassification, string> = {
  REPORTED_FACT: "border-solid border-stone-400 bg-stone-100",
  MANAGEMENT_CLAIM: "border-dashed border-stone-400 bg-white",
  AI_INTERPRETATION: "border-dotted border-stone-400 bg-stone-50",
};

const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
};

/* ----------------------------------------------------------------- styles */

const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const SECTION_HEADING_CLASS = "text-base font-semibold text-stone-900";
const BADGE_BASE_CLASS =
  "inline-block rounded-sm border px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-700 uppercase";
const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON_CLASS =
  "rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const EXTERNAL_LINK_CLASS =
  "rounded-sm text-stone-700 underline decoration-stone-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

const DEFAULT_HEADING = "What Changed — Risk Factors";

const DEFAULT_BUTTON_LABEL = "Compare latest risk factors";

const DEFAULT_EXPLANATION =
  "AI-assisted comparison of the risk-factor sections in the two most recent " +
  "annual reports. Deterministic financial figures are in the table above; " +
  "this analyzes narrative text.";

const DEFAULT_COST_NOTE =
  "Uses an AI model via AWS Bedrock. Takes up to a minute.";

const DEFAULT_LOADING_NOTE = "Comparing filings — this can take a minute…";

/** Suffix on a filing link, naming the site the link actually opens. */
const DEFAULT_SOURCE_LABEL = "sec.gov";

const DISCLAIMER =
  "AI-generated comparison. Classifications distinguish reported facts, " +
  "management statements, and AI interpretation. This is not financial " +
  "advice — verify against the linked filings.";

/* --------------------------------------------------------------- subviews */

function ClassificationBadge({
  classification,
}: {
  classification: FindingClassification;
}) {
  return (
    <span
      className={`${BADGE_BASE_CLASS} ${CLASSIFICATION_BORDER[classification]}`}
    >
      {CLASSIFICATION_LABEL[classification]}
    </span>
  );
}

function Evidence({ label, quote }: { label: string; quote: string }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-[11px] font-medium text-stone-600">
        {label}
      </figcaption>
      <blockquote className="border-l-2 border-stone-300 pl-3 text-xs leading-relaxed text-stone-700 italic">
        {quote}
      </blockquote>
    </figure>
  );
}

function FindingItem({ finding }: { finding: ComparisonFinding }) {
  const currentQuote = finding.currentEvidence?.trim() ?? "";
  const priorQuote = finding.priorEvidence?.trim() ?? "";

  return (
    <li className="space-y-2 border-t border-stone-200 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <ClassificationBadge classification={finding.classification} />
        <span className="text-xs font-medium text-stone-700">
          {CHANGE_TYPE_LABEL[finding.changeType]}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-stone-800">
        {finding.summary}
      </p>
      {currentQuote === "" && priorQuote === "" ? null : (
        <div className="space-y-2">
          {priorQuote === "" ? null : (
            <Evidence label="Prior filing:" quote={priorQuote} />
          )}
          {currentQuote === "" ? null : (
            <Evidence label="Current filing:" quote={currentQuote} />
          )}
        </div>
      )}
    </li>
  );
}

function FilingReferences({
  current,
  prior,
  sourceLabel,
}: {
  current: NormalizedFilingRef;
  prior: NormalizedFilingRef;
  sourceLabel: string;
}) {
  return (
    <p className="text-xs leading-relaxed text-stone-600">
      {"Comparing "}
      <a
        href={prior.url}
        target="_blank"
        rel="noopener noreferrer"
        className={EXTERNAL_LINK_CLASS}
      >
        {`${prior.periodLabel} (${sourceLabel})`}
      </a>
      {" → "}
      <a
        href={current.url}
        target="_blank"
        rel="noopener noreferrer"
        className={EXTERNAL_LINK_CLASS}
      >
        {`${current.periodLabel} (${sourceLabel})`}
      </a>
    </p>
  );
}

function ComparisonResult({
  outcome,
  sourceLabel,
}: {
  outcome: ComparisonPayload;
  sourceLabel: string;
}) {
  const { comparison } = outcome;

  return (
    <div className="space-y-4">
      <FilingReferences
        current={outcome.current}
        prior={outcome.prior}
        sourceLabel={sourceLabel}
      />

      {/*
        The cross-lingual caveat comes from the server with the analysis, so it
        appears above the findings it applies to and only when it applies.
      */}
      {outcome.crossLingualNote === null ? null : (
        <p className="text-xs leading-relaxed text-stone-700">
          {outcome.crossLingualNote}
        </p>
      )}

      <div className="space-y-2">
        <span className={`${BADGE_BASE_CLASS} ${CLASSIFICATION_BORDER.AI_INTERPRETATION}`}>
          {CLASSIFICATION_LABEL.AI_INTERPRETATION}
        </span>
        <p className="text-sm leading-relaxed text-stone-800">
          {comparison.overallSummary}
        </p>
      </div>

      {comparison.findings.length === 0 ? (
        <p className="text-sm text-stone-700">
          No material changes were reported for this section.
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-900">
            {`Findings (${comparison.findings.length})`}
          </h3>
          <ul className="space-y-3">
            {comparison.findings.map((finding, index) => (
              <FindingItem
                // Findings have no stable identifier; order is the identity.
                key={`${finding.classification}-${index}`}
                finding={finding}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1 border-t border-stone-200 pt-3">
        <p className="text-[11px] text-stone-600">
          {`Generated by ${comparison.modelId} via Bedrock · prompt ${comparison.promptVersion} · ${formatDate(comparison.generatedAt)}`}
        </p>
        <p className="text-xs leading-relaxed text-stone-600">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- component */

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; failure: RouteFailure }
  | { status: "ok"; outcome: OutcomePayload };

export interface WhatChangedSectionProps {
  companyId: string;
  /**
   * Route that owns the comparison, as a template containing `{companyId}`.
   * Defaults to the US route; the JP page passes the EDINET route.
   */
  endpointTemplate?: string;
  heading?: string;
  explanation?: string;
  buttonLabel?: string;
  costNote?: string;
  loadingNote?: string;
  sourceLabel?: string;
  /** Optional market-specific note shown before the comparison is requested. */
  extraNote?: string;
}

export function WhatChangedSection({
  companyId,
  endpointTemplate = "/api/research/{companyId}/what-changed",
  heading = DEFAULT_HEADING,
  explanation = DEFAULT_EXPLANATION,
  buttonLabel = DEFAULT_BUTTON_LABEL,
  costNote = DEFAULT_COST_NOTE,
  loadingNote = DEFAULT_LOADING_NOTE,
  sourceLabel = DEFAULT_SOURCE_LABEL,
  extraNote,
}: WhatChangedSectionProps) {
  const [state, setState] = useState<RequestState>({ status: "idle" });

  async function requestComparison(): Promise<void> {
    setState({ status: "loading" });

    try {
      const response = await fetch(
        endpointTemplate.replace(
          "{companyId}",
          encodeURIComponent(companyId)
        ),
        { headers: { Accept: "application/json" } }
      );
      // A non-JSON body (proxy error page, truncated response) must not throw.
      const payload: unknown = await response
        .json()
        .catch((): unknown => null);

      if (!response.ok) {
        setState({
          status: "error",
          failure:
            readFailure(payload) ??
            {
              code: "UNKNOWN",
              message:
                "The comparison could not be completed. Please try again.",
              retryable: true,
            },
        });
        return;
      }

      const outcome = readOutcome(payload);
      if (outcome === null) {
        setState({
          status: "error",
          failure: {
            code: "INVALID_RESPONSE",
            message:
              "The comparison returned an unexpected response. Please try again.",
            retryable: true,
          },
        });
        return;
      }

      setState({ status: "ok", outcome });
    } catch {
      setState({
        status: "error",
        failure: {
          code: "NETWORK",
          message:
            "The comparison could not be reached. Check your connection and try again.",
          retryable: true,
        },
      });
    }
  }

  // A deployment without AI configured cannot succeed on retry; every other
  // failure can, so the retry control is offered.
  const canRetry =
    state.status === "error" &&
    !(state.failure.code === "ANALYSIS_NOT_CONFIGURED" && !state.failure.retryable);

  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>{heading}</h2>
      <p className="text-sm leading-relaxed text-stone-600">{explanation}</p>
      {extraNote === undefined ? null : (
        <p className="text-sm leading-relaxed text-stone-600">{extraNote}</p>
      )}

      {state.status === "idle" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void requestComparison()}
            className={PRIMARY_BUTTON_CLASS}
          >
            {buttonLabel}
          </button>
          <p className="text-xs text-stone-600">{costNote}</p>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="space-y-2">
          <button type="button" disabled className={PRIMARY_BUTTON_CLASS}>
            {buttonLabel}
          </button>
          <p role="status" className="text-sm text-stone-700">
            {loadingNote}
          </p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="space-y-3 rounded-md border border-stone-300 bg-stone-50 p-4">
          <p className="text-sm leading-relaxed text-stone-800">
            {state.failure.message}
          </p>
          {canRetry ? (
            <button
              type="button"
              onClick={() => void requestComparison()}
              className={SECONDARY_BUTTON_CLASS}
            >
              Retry comparison
            </button>
          ) : null}
        </div>
      ) : null}

      {state.status === "ok" ? (
        "unavailable" in state.outcome ? (
          <p className="text-sm leading-relaxed text-stone-700">
            {state.outcome.reason}
          </p>
        ) : (
          <ComparisonResult
            outcome={state.outcome}
            sourceLabel={sourceLabel}
          />
        )
      ) : null}
    </section>
  );
}
