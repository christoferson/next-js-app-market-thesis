"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { formatDate } from "@/lib/format";
import type {
  ClaimEvaluation,
  EvidenceClassification,
} from "@/lib/contradiction/types";
import {
  CLASSIFICATION_DESCRIPTIONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_ORDER,
} from "./labels";

/**
 * Evidence Check (C1): the thesis's own claims held up against the most recent
 * filing evidence.
 *
 * Two product rules shape everything here. First, a check is a real model call
 * with a real cost, so it only ever runs when the user asks for it. Second, a
 * contradiction is a reason to REVIEW the thesis — never a suggestion to trade
 * (SPEC §24.5). The copy says "review" and nothing stronger, and the AI
 * classification is always shown even when the user has overridden it, so the
 * disagreement itself stays part of the record.
 */

/* ------------------------------------------------------- external payloads */

/**
 * The evaluation runs the server page already read from the store. The store's
 * row shape is a plain object, so it crosses the server/client boundary as-is;
 * it is declared here rather than imported because the store module is
 * server-only.
 */
export interface EvidenceRun {
  runId: string;
  createdAt: string;
  thesisVersion: number;
  evaluations: ClaimEvaluation[];
}

/** A run as displayed: the evidence count is known only for a fresh check. */
interface RunView extends EvidenceRun {
  evidenceCount: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isClassification(value: unknown): value is EvidenceClassification {
  return (
    typeof value === "string" &&
    CLASSIFICATION_ORDER.includes(value as EvidenceClassification)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** An HTTP response is an external boundary for the browser too: validate it. */
function readEvaluation(value: unknown): ClaimEvaluation | null {
  const candidate = asRecord(value);
  if (candidate === null) return null;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.thesisId !== "string" ||
    typeof candidate.thesisVersion !== "number" ||
    typeof candidate.claimId !== "string" ||
    typeof candidate.claimStatement !== "string" ||
    !isClassification(candidate.classification) ||
    typeof candidate.rationale !== "string" ||
    !isStringArray(candidate.evidenceExcerpts) ||
    typeof candidate.evidenceSummary !== "string" ||
    typeof candidate.modelId !== "string" ||
    typeof candidate.promptVersion !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    thesisId: candidate.thesisId,
    thesisVersion: candidate.thesisVersion,
    claimId: candidate.claimId,
    claimStatement: candidate.claimStatement,
    classification: candidate.classification,
    rationale: candidate.rationale,
    evidenceExcerpts: candidate.evidenceExcerpts,
    evidenceSummary: candidate.evidenceSummary,
    evidenceAsOf: asOptionalString(candidate.evidenceAsOf),
    modelId: candidate.modelId,
    promptVersion: candidate.promptVersion,
    createdAt: candidate.createdAt,
    userOverride: isClassification(candidate.userOverride)
      ? candidate.userOverride
      : null,
    userOverrideNote: asOptionalString(candidate.userOverrideNote),
    userOverrideAt: asOptionalString(candidate.userOverrideAt),
  };
}

interface UnavailableOutcome {
  unavailable: true;
  reason: string;
}

type CheckOutcome = RunView | UnavailableOutcome;

function readOutcome(payload: unknown): CheckOutcome | null {
  const data = asRecord(asRecord(payload)?.data);
  if (data === null) return null;

  if (data.unavailable === true) {
    return typeof data.reason === "string" && data.reason !== ""
      ? { unavailable: true, reason: data.reason }
      : null;
  }

  if (
    typeof data.runId !== "string" ||
    typeof data.createdAt !== "string" ||
    typeof data.thesisVersion !== "number" ||
    typeof data.evidenceCount !== "number" ||
    !Array.isArray(data.evaluations)
  ) {
    return null;
  }

  const evaluations: ClaimEvaluation[] = [];
  for (const raw of data.evaluations) {
    const evaluation = readEvaluation(raw);
    if (evaluation === null) return null;
    evaluations.push(evaluation);
  }

  return {
    runId: data.runId,
    createdAt: data.createdAt,
    thesisVersion: data.thesisVersion,
    evidenceCount: data.evidenceCount,
    evaluations,
  };
}

interface RouteFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Read the route's readable error; never surface raw internals. */
function readFailure(payload: unknown): RouteFailure | null {
  const error = asRecord(asRecord(payload)?.error);
  if (error === null || typeof error.message !== "string") return null;
  return {
    code: typeof error.code === "string" ? error.code : "UNKNOWN",
    message: error.message,
    retryable: error.retryable === true,
  };
}

/* ------------------------------------------------------------------- copy */

const HEADING = "Evidence Check";

const EXPLANATION =
  "Compares this thesis's claims against the most recent filing evidence " +
  "(annual XBRL figures and risk sections). A contradiction is a reason to " +
  "review the thesis — it is never a recommendation to act.";

const DISABLED_NOTE = "AI evidence checking is disabled in this deployment.";

const BUTTON_LABEL = "Check claims against latest filings";

const COST_NOTE = "Uses an AI model via AWS Bedrock. Takes up to a minute.";

const LOADING_NOTE =
  "Checking claims against the latest filings — this can take a minute…";

const RUN_FOOTER =
  "Evaluations are AI-generated from the cited filings and may be wrong. " +
  "They are preserved with model and prompt version for accountability. " +
  "Review — this is not advice to buy or sell.";

const EMPTY_NOTE =
  "No evidence check has been run for this thesis yet.";

const OVERRIDE_SUMMARY = "Disagree with this assessment?";

const OVERRIDE_HINT =
  "Your override is kept next to the AI classification, never in place of it, " +
  "so both readings stay on the record.";

const OVERRIDE_NOTE_MINIMUM = 5;
const OVERRIDE_NOTE_MAXIMUM = 2_000;

/* ----------------------------------------------------------------- styles */

const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const SECTION_HEADING_CLASS = "text-base font-semibold text-stone-900";
const SUB_HEADING_CLASS = "text-sm font-semibold text-stone-900";
const MUTED_CLASS = "text-sm leading-relaxed text-stone-600";
const META_CLASS = "text-[11px] leading-relaxed text-stone-600";
const PROSE_CLASS = "text-sm leading-relaxed text-stone-800";
const BADGE_BASE_CLASS =
  "inline-block rounded-sm border px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-800 uppercase";
const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:border-stone-400 disabled:bg-stone-500";
const SECONDARY_BUTTON_CLASS =
  "rounded-sm border border-stone-400 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:opacity-60";
const SELECT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const TEXTAREA_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm leading-relaxed text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";
const LABEL_CLASS = "block text-xs font-medium text-stone-700";
const HINT_CLASS = "text-[11px] leading-relaxed text-stone-600";
const ERROR_CLASS = "text-[11px] font-medium text-stone-800";
const DETAILS_CLASS = "rounded-md border border-stone-200 bg-white";
const SUMMARY_CLASS =
  "cursor-pointer rounded-sm px-3 py-2 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

/**
 * Badges are distinguished by border treatment and weight, never by colour
 * alone: the label text always says what the classification is. Contradictions
 * carry a subtle warm border so they are easy to find on a long page, which is
 * an emphasis on "read this", not a signal to trade.
 */
const CLASSIFICATION_BADGE_CLASS: Record<EvidenceClassification, string> = {
  STRONGLY_SUPPORTS: "border-solid border-stone-500 bg-stone-100 font-semibold",
  MODERATELY_SUPPORTS: "border-solid border-stone-300 bg-white",
  NEUTRAL: "border-dashed border-stone-400 bg-white",
  MODERATELY_CONTRADICTS: "border-solid border-amber-400 bg-amber-50",
  STRONGLY_CONTRADICTS:
    "border-solid border-amber-500 bg-amber-50 font-semibold",
  INSUFFICIENT_EVIDENCE: "border-dotted border-stone-400 bg-stone-50",
};

/* --------------------------------------------------------------- subviews */

function ClassificationBadge({
  classification,
}: {
  classification: EvidenceClassification;
}) {
  return (
    <span
      className={`${BADGE_BASE_CLASS} ${CLASSIFICATION_BADGE_CLASS[classification]}`}
    >
      {CLASSIFICATION_LABELS[classification]}
    </span>
  );
}

function ClassificationLegend() {
  return (
    <details className={DETAILS_CLASS}>
      <summary className={SUMMARY_CLASS}>
        What the classifications mean
      </summary>
      <dl className="space-y-2 border-t border-stone-200 px-3 py-3">
        {CLASSIFICATION_ORDER.map((classification) => (
          <div key={classification} className="space-y-0.5">
            <dt>
              <ClassificationBadge classification={classification} />
            </dt>
            <dd className="text-xs leading-relaxed text-stone-700">
              {CLASSIFICATION_DESCRIPTIONS[classification]}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function OverrideForm({
  evaluation,
  onRecorded,
  thesisId,
}: {
  evaluation: ClaimEvaluation;
  onRecorded: (updated: ClaimEvaluation) => void;
  thesisId: string;
}) {
  const idPrefix = useId();
  const [classification, setClassification] = useState<EvidenceClassification>(
    evaluation.userOverride ?? evaluation.classification
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const trimmed = note.trim();
    if (trimmed.length < OVERRIDE_NOTE_MINIMUM) {
      setError(
        `Write at least ${OVERRIDE_NOTE_MINIMUM} characters explaining why you disagree.`
      );
      return;
    }
    if (trimmed.length > OVERRIDE_NOTE_MAXIMUM) {
      setError(`Keep this to ${OVERRIDE_NOTE_MAXIMUM} characters or fewer.`);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/thesis/${encodeURIComponent(thesisId)}/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "override",
            evaluationId: evaluation.id,
            classification,
            note: trimmed,
          }),
        }
      );
      // A non-JSON body (proxy error page, truncated response) must not throw.
      const payload: unknown = await response
        .json()
        .catch((): unknown => null);

      if (!response.ok) {
        setError(
          readFailure(payload)?.message ??
            "The override could not be saved. Please try again."
        );
        return;
      }

      const updated = readEvaluation(asRecord(payload)?.data);
      if (updated === null) {
        setError(
          "The override returned an unexpected response. Reload the page to see whether it was saved."
        );
        return;
      }

      setNote("");
      onRecorded(updated);
    } catch {
      setError(
        "The override could not be saved because the request failed. Check your connection and try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <details className={DETAILS_CLASS}>
      <summary className={SUMMARY_CLASS}>{OVERRIDE_SUMMARY}</summary>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-3 border-t border-stone-200 px-3 py-3"
      >
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-classification`} className={LABEL_CLASS}>
            Your reading of the evidence
          </label>
          <select
            id={`${idPrefix}-classification`}
            value={classification}
            disabled={isSaving}
            onChange={(event) => {
              const selected = CLASSIFICATION_ORDER.find(
                (candidate) => candidate === event.target.value
              );
              if (selected !== undefined) setClassification(selected);
            }}
            className={SELECT_CLASS}
          >
            {CLASSIFICATION_ORDER.map((candidate) => (
              <option key={candidate} value={candidate}>
                {`${CLASSIFICATION_LABELS[candidate]} — ${CLASSIFICATION_DESCRIPTIONS[candidate]}`}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-note`} className={LABEL_CLASS}>
            Why do you read it differently?
          </label>
          <textarea
            id={`${idPrefix}-note`}
            rows={3}
            value={note}
            disabled={isSaving}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby={
              error === null
                ? `${idPrefix}-hint`
                : `${idPrefix}-hint ${idPrefix}-error`
            }
            aria-invalid={error === null ? undefined : true}
            className={TEXTAREA_CLASS}
          />
          <p id={`${idPrefix}-hint`} className={HINT_CLASS}>
            {OVERRIDE_HINT}
          </p>
          {error === null ? null : (
            <p id={`${idPrefix}-error`} className={ERROR_CLASS}>
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className={SECONDARY_BUTTON_CLASS}
        >
          {isSaving ? "Recording override…" : "Record override"}
        </button>
      </form>
    </details>
  );
}

function EvaluationItem({
  evaluation,
  onRecorded,
  readOnly,
  thesisId,
}: {
  evaluation: ClaimEvaluation;
  onRecorded: (updated: ClaimEvaluation) => void;
  readOnly: boolean;
  thesisId: string;
}) {
  const excerpts = evaluation.evidenceExcerpts.filter(
    (excerpt) => excerpt.trim() !== ""
  );

  return (
    <li className="space-y-2 border-t border-stone-200 pt-3 first:border-t-0 first:pt-0">
      <h4 className={SUB_HEADING_CLASS}>{evaluation.claimStatement}</h4>

      <div className="flex flex-wrap items-center gap-2">
        <ClassificationBadge classification={evaluation.classification} />
        {evaluation.userOverride === null ? null : (
          <>
            <span className="text-xs text-stone-600">→</span>
            <ClassificationBadge classification={evaluation.userOverride} />
          </>
        )}
      </div>

      {/*
        An override never hides the AI reading: both are named on one line, so
        the record shows what the model said and what the user decided.
      */}
      {evaluation.userOverride === null ? null : (
        <div className="space-y-1 border-l-2 border-stone-300 pl-3">
          <p className={META_CLASS}>
            {`AI: ${CLASSIFICATION_LABELS[evaluation.classification]} · Your override: ${CLASSIFICATION_LABELS[evaluation.userOverride]} (${formatDate(evaluation.userOverrideAt)})`}
          </p>
          {evaluation.userOverrideNote === null ? null : (
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-stone-800">
              {evaluation.userOverrideNote}
            </p>
          )}
        </div>
      )}

      <p className={PROSE_CLASS}>{evaluation.rationale}</p>

      {excerpts.length === 0 ? null : (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-stone-600">
            From the filings:
          </p>
          {excerpts.map((excerpt, index) => (
            <blockquote
              // Excerpts have no identifier of their own; order is the identity.
              key={`${evaluation.id}-excerpt-${index}`}
              className="border-l-2 border-stone-300 pl-3 text-xs leading-relaxed text-stone-700 italic"
            >
              {excerpt}
            </blockquote>
          ))}
        </div>
      )}

      <p className={META_CLASS}>
        {`Evidence: ${evaluation.evidenceSummary}`}
        {evaluation.evidenceAsOf === null
          ? null
          : ` · as of ${formatDate(evaluation.evidenceAsOf)}`}
      </p>

      {readOnly ? null : (
        <OverrideForm
          evaluation={evaluation}
          onRecorded={onRecorded}
          thesisId={thesisId}
        />
      )}
    </li>
  );
}

/**
 * The store preserves each run's evidence summary but not its item count, so a
 * count is reported only when it is actually known: from a fresh check, or from
 * the "; "-joined summary the run was stored with.
 */
function evidenceCountOf(run: RunView): number | null {
  if (run.evidenceCount !== null) return run.evidenceCount;

  const summary = run.evaluations[0]?.evidenceSummary.trim() ?? "";
  if (summary === "") return null;
  return summary.split("; ").length;
}

function runMetaLine(run: RunView): string {
  const first = run.evaluations[0];
  const count = evidenceCountOf(run);

  return [
    `Checked ${formatDate(run.createdAt)}`,
    `thesis v${run.thesisVersion}`,
    count === null ? null : `${count} evidence item${count === 1 ? "" : "s"}`,
    first?.modelId,
    first === undefined ? null : `prompt ${first.promptVersion}`,
  ]
    .filter((part): part is string => part !== null && part !== undefined)
    .join(" · ");
}

function RunBody({
  onRecorded,
  readOnly,
  run,
  thesisId,
}: {
  onRecorded: (runId: string, updated: ClaimEvaluation) => void;
  readOnly: boolean;
  run: RunView;
  thesisId: string;
}) {
  return (
    <div className="space-y-3">
      <p className={META_CLASS}>{runMetaLine(run)}</p>

      {run.evaluations.length === 0 ? (
        <p className={MUTED_CLASS}>
          This check recorded no claim evaluations — the thesis version had no
          claims to check.
        </p>
      ) : (
        <ul className="space-y-3">
          {run.evaluations.map((evaluation) => (
            <EvaluationItem
              key={evaluation.id}
              evaluation={evaluation}
              onRecorded={(updated) => onRecorded(run.runId, updated)}
              readOnly={readOnly}
              thesisId={thesisId}
            />
          ))}
        </ul>
      )}

      <p className="border-t border-stone-200 pt-3 text-xs leading-relaxed text-stone-600">
        {RUN_FOOTER}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- component */

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; failure: RouteFailure }
  | { status: "unavailable"; reason: string };

export interface EvidenceCheckSectionProps {
  thesisId: string;
  /** Past runs read from the evaluation store, newest first. */
  initialRuns: readonly EvidenceRun[];
  /** False when this deployment has runtime AI switched off. */
  analysisEnabled: boolean;
}

export function EvidenceCheckSection({
  thesisId,
  initialRuns,
  analysisEnabled,
}: EvidenceCheckSectionProps) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunView[]>(() =>
    initialRuns.map((run) => ({ ...run, evidenceCount: null }))
  );
  const [state, setState] = useState<RequestState>({ status: "idle" });

  const [latest, ...earlier] = runs;

  function applyOverride(runId: string, updated: ClaimEvaluation): void {
    setRuns((current) =>
      current.map((run) =>
        run.runId === runId
          ? {
              ...run,
              evaluations: run.evaluations.map((evaluation) =>
                evaluation.id === updated.id ? updated : evaluation
              ),
            }
          : run
      )
    );
  }

  async function runCheck(): Promise<void> {
    setState({ status: "loading" });

    try {
      const response = await fetch(
        `/api/thesis/${encodeURIComponent(thesisId)}/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run" }),
        }
      );
      const payload: unknown = await response
        .json()
        .catch((): unknown => null);

      if (!response.ok) {
        setState({
          status: "error",
          failure:
            readFailure(payload) ?? {
              code: "UNKNOWN",
              message:
                "The evidence check could not be completed. Please try again.",
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
              "The evidence check returned an unexpected response. Please try again.",
            retryable: true,
          },
        });
        return;
      }

      if ("unavailable" in outcome) {
        setState({ status: "unavailable", reason: outcome.reason });
        return;
      }

      setRuns((current) => [outcome, ...current]);
      setState({ status: "idle" });
      // A completed check appends a journal entry server-side; refreshing lets
      // the journal section below show it without a manual reload.
      router.refresh();
    } catch {
      setState({
        status: "error",
        failure: {
          code: "NETWORK",
          message:
            "The evidence check could not be reached. Check your connection and try again.",
          retryable: true,
        },
      });
    }
  }

  // A deployment without AI configured cannot succeed on retry; every other
  // failure can, so the retry control is offered.
  const canRetry =
    state.status === "error" && state.failure.code !== "ANALYSIS_NOT_CONFIGURED";

  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>{HEADING}</h2>
      <p className={MUTED_CLASS}>{EXPLANATION}</p>

      {!analysisEnabled ? (
        <p className={PROSE_CLASS}>{DISABLED_NOTE}</p>
      ) : state.status === "loading" ? (
        <div className="space-y-2">
          <button type="button" disabled className={PRIMARY_BUTTON_CLASS}>
            {BUTTON_LABEL}
          </button>
          <p role="status" className="text-sm text-stone-700">
            {LOADING_NOTE}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void runCheck()}
            className={PRIMARY_BUTTON_CLASS}
          >
            {BUTTON_LABEL}
          </button>
          <p className="text-xs text-stone-600">{COST_NOTE}</p>
        </div>
      )}

      {state.status === "error" ? (
        <div className="space-y-3 rounded-md border border-stone-300 bg-stone-50 p-4">
          <p className={PROSE_CLASS}>{state.failure.message}</p>
          {canRetry ? (
            <button
              type="button"
              onClick={() => void runCheck()}
              className={SECONDARY_BUTTON_CLASS}
            >
              Retry evidence check
            </button>
          ) : null}
        </div>
      ) : null}

      {/*
        An unavailable outcome is a fact about the evidence, not a failure:
        it is reported plainly, with no retry pressure.
      */}
      {state.status === "unavailable" ? (
        <div className="rounded-md border border-stone-300 bg-stone-50 p-4">
          <p className={PROSE_CLASS}>{state.reason}</p>
        </div>
      ) : null}

      {latest === undefined ? (
        <p className={MUTED_CLASS}>{EMPTY_NOTE}</p>
      ) : (
        <div className="space-y-3">
          <h3 className={SUB_HEADING_CLASS}>Latest check</h3>
          <RunBody
            run={latest}
            thesisId={thesisId}
            readOnly={!analysisEnabled}
            onRecorded={applyOverride}
          />
        </div>
      )}

      <ClassificationLegend />

      {earlier.length === 0 ? null : (
        <div className="space-y-2">
          <h3 className={SUB_HEADING_CLASS}>Earlier checks</h3>
          {earlier.map((run) => (
            <details key={run.runId} className={DETAILS_CLASS}>
              <summary className={SUMMARY_CLASS}>
                {`Checked ${formatDate(run.createdAt)} · thesis v${run.thesisVersion}`}
              </summary>
              <div className="border-t border-stone-200 px-3 py-3">
                {/* Earlier runs are history: read-only, shown as recorded. */}
                <RunBody
                  run={run}
                  thesisId={thesisId}
                  readOnly
                  onRecorded={applyOverride}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
