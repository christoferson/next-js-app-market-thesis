"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useId, useState } from "react";

import type { ClaimKind, ThesisClaim } from "@/lib/thesis/types";
import { SubjectPicker } from "@/components/shared/subject-picker";
import {
  CLAIM_IMPORTANCE_LABEL,
  CLAIM_IMPORTANCE_ORDER,
  CLAIM_KIND_LABEL,
  CLAIM_KIND_ORDER,
} from "./labels";

/**
 * The thesis writing form, used for both the first version and every revision.
 *
 * Two rules shape it. First, a revision never overwrites: revise mode submits a
 * new version and requires a note saying what changed, which is appended to the
 * permanent journal. Second, an empty optional field is sent as null — never as
 * an empty string and never as 0 — so an unquantified claim stays visibly
 * unquantified.
 *
 * Client-side validation mirrors the server's schema so a mistake is caught
 * before a request is made; the server stays the authority, and its per-field
 * errors are mapped back onto the same inputs.
 */

/* ------------------------------------------------------------------ limits */

const LIMITS = {
  subjectLabel: { min: 1, max: 200 },
  title: { min: 3, max: 200 },
  summary: { min: 20, max: 10_000 },
  edge: { min: 0, max: 5_000 },
  bearCase: { min: 0, max: 5_000 },
  timeHorizon: { min: 0, max: 100 },
  statement: { min: 5, max: 500 },
  metricDescription: { min: 0, max: 200 },
  revisionNote: { min: 5, max: 2_000 },
} as const;

const MAX_CLAIMS = 12;
const SUBJECT_REF_PATTERN =
  /^(demo|research|research-jp):[a-z0-9][a-z0-9-]{0,99}$/;
const DEADLINE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_HINT = "Percentages as decimals: 0.15 = 15%";

/* ------------------------------------------------------------------- props */

export interface ThesisFormInitialValues {
  title: string;
  summary: string;
  edge: string | null;
  bearCase: string | null;
  timeHorizon: string | null;
  claims: readonly ThesisClaim[];
}

/** A subject arrived at from elsewhere (a research page, a portfolio row). */
export interface ThesisFormInitialSubject {
  ref: string;
  label: string;
}

export type ThesisFormProps =
  | { mode: "create"; initialSubject?: ThesisFormInitialSubject | null }
  | { mode: "revise"; thesisId: string; initial: ThesisFormInitialValues };

/* ------------------------------------------------------------------ drafts */

interface ClaimDraft {
  /** Stable React key; also the claim id when revising an existing claim. */
  key: string;
  /** Present only for a claim carried over from an earlier version. */
  id: string | null;
  kind: ClaimKind;
  statement: string;
  metricDescription: string;
  baselineValue: string;
  targetValue: string;
  invalidationValue: string;
  deadline: string;
  importance: 1 | 2 | 3;
}

type NumericClaimField =
  | "baselineValue"
  | "targetValue"
  | "invalidationValue";

const NUMERIC_CLAIM_FIELDS: ReadonlyArray<{
  key: NumericClaimField;
  label: string;
}> = [
  { key: "baselineValue", label: "Baseline" },
  { key: "targetValue", label: "Target" },
  { key: "invalidationValue", label: "Invalidation value" },
];

function emptyClaimDraft(key: string): ClaimDraft {
  return {
    key,
    id: null,
    kind: "growth",
    statement: "",
    metricDescription: "",
    baselineValue: "",
    targetValue: "",
    invalidationValue: "",
    deadline: "",
    importance: 2,
  };
}

/** A missing number becomes an empty input, never a literal 0. */
function numberToDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

function claimDraftFrom(claim: ThesisClaim): ClaimDraft {
  return {
    key: claim.id,
    id: claim.id,
    kind: claim.kind,
    statement: claim.statement,
    metricDescription: claim.metricDescription ?? "",
    baselineValue: numberToDraft(claim.baselineValue),
    targetValue: numberToDraft(claim.targetValue),
    invalidationValue: numberToDraft(claim.invalidationValue),
    deadline: claim.deadline ?? "",
    importance: claim.importance,
  };
}

/* ---------------------------------------------------------------- requests */

interface ClaimPayload {
  id?: string;
  kind: ClaimKind;
  statement: string;
  metricDescription: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  invalidationValue: number | null;
  deadline: string | null;
  importance: 1 | 2 | 3;
}

interface ThesisBodyPayload {
  title: string;
  summary: string;
  edge: string | null;
  bearCase: string | null;
  timeHorizon: string | null;
  claims: ClaimPayload[];
}

/** Field errors are keyed the way the API reports them: "title", "claims.0.statement". */
type FieldErrors = Record<string, string>;

function optionalText(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Blank means "not quantified". Anything unparseable is reported, not coerced. */
function parseOptionalNumber(raw: string): {
  value: number | null;
  error: string | null;
} {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, error: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: "Enter a number, or leave this empty." };
  }
  return { value: parsed, error: null };
}

function lengthError(
  raw: string,
  limits: { min: number; max: number },
  required: boolean
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return required ? "This field is required." : null;
  }
  if (trimmed.length < limits.min) {
    return `Write at least ${limits.min} characters.`;
  }
  if (trimmed.length > limits.max) {
    return `Keep this to ${limits.max} characters or fewer.`;
  }
  return null;
}

/* ------------------------------------------------------------- API reading */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** The API's readable message; internals are never surfaced. */
function errorMessageFrom(payload: unknown): string | null {
  const message = asRecord(asRecord(payload)?.error)?.message;
  return typeof message === "string" && message !== "" ? message : null;
}

/**
 * `details` maps a field path to its messages. The first message per field is
 * shown inline; a path the form does not render still reaches the user through
 * the error block above the buttons.
 */
function fieldErrorsFrom(payload: unknown): FieldErrors {
  const details = asRecord(asRecord(asRecord(payload)?.error)?.details);
  if (details === null) return {};

  const mapped: FieldErrors = {};
  for (const [path, messages] of Object.entries(details)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === "string" && first !== "") {
      mapped[path] = first;
    }
  }
  return mapped;
}

function createdThesisIdFrom(payload: unknown): string | null {
  const id = asRecord(asRecord(payload)?.data)?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

/* ----------------------------------------------------------------- styling */

const INPUT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";
const NUMBER_INPUT_CLASS = `${INPUT_CLASS} tabular-nums`;
const TEXTAREA_CLASS = `${INPUT_CLASS} leading-relaxed`;
const SELECT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:border-stone-400 disabled:bg-stone-500";
const SECONDARY_BUTTON_CLASS =
  "rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:text-stone-500";
const SMALL_BUTTON_CLASS =
  "shrink-0 rounded-sm border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-700 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:text-stone-500";
const LABEL_CLASS = "block text-sm font-medium text-stone-800";
const SMALL_LABEL_CLASS = "block text-xs font-medium text-stone-700";
const HINT_CLASS = "text-[11px] leading-relaxed text-stone-600";
const ERROR_CLASS = "text-[11px] font-medium text-stone-800";
const SECTION_CLASS = "space-y-4 rounded-md border border-stone-200 bg-white p-5";
const OPTIONAL_CLASS = "ml-1 font-normal text-stone-500";

/* ------------------------------------------------------------ field pieces */

type FieldKind = "text" | "textarea" | "date" | "decimal";

/**
 * One labelled control with its hint and inline error. Defined at module level
 * so its identity is stable across renders — a component redefined during
 * render would remount the input and drop focus on every keystroke.
 */
function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  kind = "text",
  rows = 4,
  required = false,
  small = false,
  disabled = false,
}: {
  id: string;
  label: string;
  hint: string | null;
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  kind?: FieldKind;
  rows?: number;
  required?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [
    hint === null ? null : hintId,
    error === undefined ? null : errorId,
  ]
    .filter((candidate): candidate is string => candidate !== null)
    .join(" ");

  const shared = {
    id,
    value,
    disabled,
    "aria-describedby": describedBy === "" ? undefined : describedBy,
    "aria-invalid": error === undefined ? undefined : (true as const),
    ...(required ? { required: true } : {}),
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className={small ? SMALL_LABEL_CLASS : LABEL_CLASS}>
        {label}
        {required ? null : <span className={OPTIONAL_CLASS}>(optional)</span>}
      </label>

      {kind === "textarea" ? (
        <textarea
          {...shared}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      ) : (
        <input
          {...shared}
          type={kind === "date" ? "date" : "text"}
          {...(kind === "decimal" ? { inputMode: "decimal" as const } : {})}
          onChange={(event) => onChange(event.target.value)}
          className={kind === "decimal" ? NUMBER_INPUT_CLASS : INPUT_CLASS}
        />
      )}

      {hint === null ? null : (
        <p id={hintId} className={HINT_CLASS}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className={ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={SMALL_LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const CLAIM_KIND_OPTIONS = CLAIM_KIND_ORDER.map((kind) => ({
  value: kind,
  label: CLAIM_KIND_LABEL[kind],
}));

const CLAIM_IMPORTANCE_OPTIONS = CLAIM_IMPORTANCE_ORDER.map((level) => ({
  value: String(level),
  label: `${level} ${CLAIM_IMPORTANCE_LABEL[level]}`,
}));

/** One claim's fields. Module-level for the same focus reason as `Field`. */
function ClaimFieldset({
  index,
  claim,
  idPrefix,
  fieldErrors,
  canRemove,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  claim: ClaimDraft;
  idPrefix: string;
  fieldErrors: FieldErrors;
  canRemove: boolean;
  disabled: boolean;
  onChange: (patch: Partial<ClaimDraft>) => void;
  onRemove: () => void;
}) {
  const path = `claims.${index}`;
  const id = (name: string) => `${idPrefix}-${path}-${name}`;

  return (
    <fieldset className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      {/* A legend must be the fieldset's first child, so the remove button
          follows it rather than sharing a wrapper with it. */}
      <legend className="text-sm font-semibold text-stone-900">
        {`Claim ${index + 1}`}
      </legend>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove || disabled}
          className={SMALL_BUTTON_CLASS}
        >
          {`Remove claim ${index + 1}`}
        </button>
      </div>

      <Field
        id={id("statement")}
        label="Measurable claim"
        hint="State it so future evidence can prove it wrong."
        value={claim.statement}
        onChange={(statement) => onChange({ statement })}
        error={fieldErrors[`${path}.statement`]}
        kind="textarea"
        rows={3}
        required
        small
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id={id("kind")}
          label="Kind"
          value={claim.kind}
          options={CLAIM_KIND_OPTIONS}
          disabled={disabled}
          onChange={(raw) => {
            const kind = CLAIM_KIND_ORDER.find((candidate) => candidate === raw);
            if (kind !== undefined) onChange({ kind });
          }}
        />
        <SelectField
          id={id("importance")}
          label="Importance"
          value={String(claim.importance)}
          options={CLAIM_IMPORTANCE_OPTIONS}
          disabled={disabled}
          onChange={(raw) => {
            const importance = CLAIM_IMPORTANCE_ORDER.find(
              (candidate) => String(candidate) === raw
            );
            if (importance !== undefined) onChange({ importance });
          }}
        />
      </div>

      <Field
        id={id("metricDescription")}
        label="Metric"
        hint="What is being measured, e.g. operating margin, TTM."
        value={claim.metricDescription}
        onChange={(metricDescription) => onChange({ metricDescription })}
        error={fieldErrors[`${path}.metricDescription`]}
        small
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {NUMERIC_CLAIM_FIELDS.map((numeric) => (
          <Field
            key={numeric.key}
            id={id(numeric.key)}
            label={numeric.label}
            hint={NUMERIC_HINT}
            value={claim[numeric.key]}
            onChange={(next) => onChange({ [numeric.key]: next })}
            error={fieldErrors[`${path}.${numeric.key}`]}
            kind="decimal"
            small
            disabled={disabled}
          />
        ))}
      </div>

      <div className="sm:max-w-xs">
        <Field
          id={id("deadline")}
          label="Deadline"
          hint="When the claim should have played out."
          value={claim.deadline}
          onChange={(deadline) => onChange({ deadline })}
          error={fieldErrors[`${path}.deadline`]}
          kind="date"
          small
          disabled={disabled}
        />
      </div>
    </fieldset>
  );
}

/* --------------------------------------------------------------- component */

export function ThesisForm(props: ThesisFormProps) {
  const router = useRouter();
  const idPrefix = useId();
  const isRevision = props.mode === "revise";
  const initial = props.mode === "revise" ? props.initial : null;

  const initialSubject =
    props.mode === "create" ? (props.initialSubject ?? null) : null;
  const [subjectRef, setSubjectRef] = useState(initialSubject?.ref ?? "");
  const [subjectLabel, setSubjectLabel] = useState(
    initialSubject?.label ?? ""
  );

  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [edge, setEdge] = useState(initial?.edge ?? "");
  const [bearCase, setBearCase] = useState(initial?.bearCase ?? "");
  const [timeHorizon, setTimeHorizon] = useState(initial?.timeHorizon ?? "");
  const [revisionNote, setRevisionNote] = useState("");

  const [claims, setClaims] = useState<ClaimDraft[]>(() =>
    initial === null || initial.claims.length === 0
      ? [emptyClaimDraft("claim-1")]
      : initial.claims.map(claimDraftFrom)
  );
  // Keys stay unique across additions and removals, so they come from a
  // counter rather than from the array index.
  const [nextClaimKey, setNextClaimKey] = useState(1);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function fieldId(name: string): string {
    return `${idPrefix}-${name}`;
  }

  function updateClaim(key: string, patch: Partial<ClaimDraft>) {
    setClaims((current) =>
      current.map((claim) => (claim.key === key ? { ...claim, ...patch } : claim))
    );
  }

  function addClaim() {
    if (claims.length >= MAX_CLAIMS) return;
    setClaims((current) => [
      ...current,
      emptyClaimDraft(`new-claim-${nextClaimKey}`),
    ]);
    setNextClaimKey((value) => value + 1);
  }

  function removeClaim(key: string) {
    if (claims.length <= 1) return;
    setClaims((current) => current.filter((claim) => claim.key !== key));
    // Claim errors are keyed by position, so they no longer point at the right
    // claim once one is removed.
    setFieldErrors({});
  }

  /**
   * Validates the draft and builds the request body. Returns null when anything
   * is invalid, having recorded the per-field messages.
   */
  function buildBody(): ThesisBodyPayload | null {
    const errors: FieldErrors = {};

    const titleError = lengthError(title, LIMITS.title, true);
    if (titleError !== null) errors.title = titleError;

    const summaryError = lengthError(summary, LIMITS.summary, true);
    if (summaryError !== null) errors.summary = summaryError;

    const edgeError = lengthError(edge, LIMITS.edge, false);
    if (edgeError !== null) errors.edge = edgeError;

    const bearCaseError = lengthError(bearCase, LIMITS.bearCase, false);
    if (bearCaseError !== null) errors.bearCase = bearCaseError;

    const horizonError = lengthError(timeHorizon, LIMITS.timeHorizon, false);
    if (horizonError !== null) errors.timeHorizon = horizonError;

    if (isRevision) {
      const noteError = lengthError(revisionNote, LIMITS.revisionNote, true);
      if (noteError !== null) errors.revisionNote = noteError;
    }

    const claimPayloads: ClaimPayload[] = claims.map((claim, index) => {
      const statementError = lengthError(claim.statement, LIMITS.statement, true);
      if (statementError !== null) {
        errors[`claims.${index}.statement`] = statementError;
      }

      const metricError = lengthError(
        claim.metricDescription,
        LIMITS.metricDescription,
        false
      );
      if (metricError !== null) {
        errors[`claims.${index}.metricDescription`] = metricError;
      }

      const baseline = parseOptionalNumber(claim.baselineValue);
      if (baseline.error !== null) {
        errors[`claims.${index}.baselineValue`] = baseline.error;
      }
      const target = parseOptionalNumber(claim.targetValue);
      if (target.error !== null) {
        errors[`claims.${index}.targetValue`] = target.error;
      }
      const invalidation = parseOptionalNumber(claim.invalidationValue);
      if (invalidation.error !== null) {
        errors[`claims.${index}.invalidationValue`] = invalidation.error;
      }

      const deadline = optionalText(claim.deadline);
      if (deadline !== null && !DEADLINE_PATTERN.test(deadline)) {
        errors[`claims.${index}.deadline`] = "Use a date in the form YYYY-MM-DD.";
      }

      return {
        ...(claim.id === null ? {} : { id: claim.id }),
        kind: claim.kind,
        statement: claim.statement.trim(),
        metricDescription: optionalText(claim.metricDescription),
        baselineValue: baseline.value,
        targetValue: target.value,
        invalidationValue: invalidation.value,
        deadline,
        importance: claim.importance,
      };
    });

    if (props.mode === "create") {
      const trimmedRef = subjectRef.trim();
      if (trimmedRef === "") {
        errors.subjectRef = "Choose what this thesis is about.";
      } else if (!SUBJECT_REF_PATTERN.test(trimmedRef)) {
        errors.subjectRef =
          "Use a reference of the form demo:identifier, research:identifier or research-jp:identifier.";
      }
      const labelError = lengthError(subjectLabel, LIMITS.subjectLabel, true);
      if (labelError !== null) errors.subjectLabel = labelError;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Some fields need attention before this thesis can be saved.");
      return null;
    }

    setFieldErrors({});
    setFormError(null);
    return {
      title: title.trim(),
      summary: summary.trim(),
      edge: optionalText(edge),
      bearCase: optionalText(bearCase),
      timeHorizon: optionalText(timeHorizon),
      claims: claimPayloads,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const body = buildBody();
    if (body === null) return;

    const url =
      props.mode === "create" ? "/api/thesis" : `/api/thesis/${props.thesisId}`;
    const requestBody =
      props.mode === "create"
        ? {
            subjectRef: subjectRef.trim(),
            subjectLabel: subjectLabel.trim(),
            ...body,
          }
        : {
            action: "revise",
            payload: { ...body, revisionNote: revisionNote.trim() },
          };

    setIsSubmitting(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload: unknown = await response.json().catch((): unknown => null);

      if (!response.ok) {
        setFieldErrors(fieldErrorsFrom(payload));
        setFormError(
          errorMessageFrom(payload) ??
            "The thesis could not be saved. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      const thesisId =
        props.mode === "create" ? createdThesisIdFrom(payload) : props.thesisId;
      if (thesisId === null) {
        setFormError(
          "The thesis was saved, but could not be opened. Open it from the Theses list."
        );
        setIsSubmitting(false);
        return;
      }

      // The detail page is server-rendered from the store, so the router cache
      // is refreshed rather than trusted after a write.
      router.push(`/theses/${thesisId}`);
      router.refresh();
    } catch {
      setFormError(
        "The thesis could not be saved because the request failed. Check your connection and try again."
      );
      setIsSubmitting(false);
    }
  }

  const cancelHref =
    props.mode === "create" ? "/theses" : `/theses/${props.thesisId}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {props.mode === "create" ? (
        <fieldset className={SECTION_CLASS}>
          <legend className="text-base font-semibold text-stone-900">
            Subject
          </legend>
          <p className="text-sm text-stone-600">
            What this thesis is about. The subject is fixed once the thesis is
            written, so every later version describes the same holding.
          </p>

          <div className="sm:max-w-lg">
            <SubjectPicker
              id={fieldId("subjectRef")}
              label="Subject"
              hint="Research companies and demo instruments this application already knows."
              value={subjectRef}
              error={fieldErrors.subjectRef ?? fieldErrors.subjectLabel}
              disabled={isSubmitting}
              onChange={(subject) => {
                setSubjectRef(subject?.ref ?? "");
                setSubjectLabel(subject?.label ?? "");
              }}
            />
          </div>
        </fieldset>
      ) : null}

      <fieldset className={SECTION_CLASS}>
        <legend className="text-base font-semibold text-stone-900">
          Reasoning
        </legend>

        <Field
          id={fieldId("title")}
          label="Title"
          hint="A short description of the reasoning, not a verdict."
          value={title}
          onChange={setTitle}
          error={fieldErrors.title}
          required
          disabled={isSubmitting}
        />

        <Field
          id={fieldId("summary")}
          label="Why is this business attractive?"
          hint="At least 20 characters. This is the core of the thesis."
          value={summary}
          onChange={setSummary}
          error={fieldErrors.summary}
          kind="textarea"
          rows={7}
          required
          disabled={isSubmitting}
        />

        <Field
          id={fieldId("edge")}
          label="What might the market be underestimating?"
          hint="If nothing comes to mind, that is itself worth knowing."
          value={edge}
          onChange={setEdge}
          error={fieldErrors.edge}
          kind="textarea"
          disabled={isSubmitting}
        />

        <Field
          id={fieldId("bearCase")}
          label="What is the strongest argument against?"
          hint="Write the case you would find hardest to answer."
          value={bearCase}
          onChange={setBearCase}
          error={fieldErrors.bearCase}
          kind="textarea"
          disabled={isSubmitting}
        />

        <Field
          id={fieldId("timeHorizon")}
          label="Time horizon"
          hint="e.g. 3–5 years"
          value={timeHorizon}
          onChange={setTimeHorizon}
          error={fieldErrors.timeHorizon}
          disabled={isSubmitting}
        />
      </fieldset>

      <div className={SECTION_CLASS}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-stone-900">Claims</h2>
          <p className="text-xs text-stone-600">
            {`${claims.length} of ${MAX_CLAIMS}`}
          </p>
        </div>
        <p className="text-sm text-stone-600">
          {`At least one claim, up to ${MAX_CLAIMS}. A claim is something evidence can later confirm or contradict.`}
        </p>

        {claims.map((claim, index) => (
          <ClaimFieldset
            key={claim.key}
            index={index}
            claim={claim}
            idPrefix={idPrefix}
            fieldErrors={fieldErrors}
            canRemove={claims.length > 1}
            disabled={isSubmitting}
            onChange={(patch) => updateClaim(claim.key, patch)}
            onRemove={() => removeClaim(claim.key)}
          />
        ))}

        <button
          type="button"
          onClick={addClaim}
          disabled={claims.length >= MAX_CLAIMS || isSubmitting}
          className={SECONDARY_BUTTON_CLASS}
        >
          Add claim
        </button>
        {claims.length >= MAX_CLAIMS ? (
          <p className={HINT_CLASS}>
            {`A thesis holds at most ${MAX_CLAIMS} claims.`}
          </p>
        ) : null}
      </div>

      {props.mode === "revise" ? (
        <fieldset className={SECTION_CLASS}>
          <legend className="text-base font-semibold text-stone-900">
            Revision
          </legend>
          <p className="text-sm text-stone-600">
            Saving creates a new version. Every earlier version is kept exactly
            as written, and this note is appended to the journal permanently.
          </p>
          <Field
            id={fieldId("revisionNote")}
            label="What changed and why?"
            hint="At least 5 characters. This cannot be edited or deleted later."
            value={revisionNote}
            onChange={setRevisionNote}
            error={fieldErrors.revisionNote}
            kind="textarea"
            required
            disabled={isSubmitting}
          />
        </fieldset>
      ) : null}

      {formError === null ? null : (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-stone-400 bg-stone-50 p-4"
        >
          <p className="text-sm font-medium text-stone-900">{formError}</p>
          <p className="text-xs text-stone-700">
            Nothing was saved. Correct the fields above and submit again.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isRevision
            ? isSubmitting
              ? "Saving revision…"
              : "Save revision"
            : isSubmitting
              ? "Saving thesis…"
              : "Save thesis"}
        </button>
        <Link
          href={cancelHref}
          className="rounded-sm text-sm text-stone-600 transition-colors motion-reduce:transition-none hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
