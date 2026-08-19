"use client";

import { useEffect, useState } from "react";

/**
 * Choosing what a record is about (cross-phase integration).
 *
 * Theses, transactions and price marks all point at a subject by its
 * `scope:id` reference. Typing that reference by hand let a thesis and a
 * position for the same company drift apart over a single character, so every
 * form picks from the registry instead — the label and the native currency then
 * come from the same place the subject's own page does.
 *
 * The list is fetched once per browser session and shared by every picker on
 * the page. If the request fails the reference can still be typed, so the form
 * keeps working offline rather than becoming unusable.
 */

export interface PickedSubject {
  /** Full reference, e.g. "research:msft". */
  ref: string;
  label: string;
  /**
   * Native currency, or null when the reference was typed in the fallback: an
   * unknown subject has no currency to offer, and the form keeps its own.
   */
  currency: "USD" | "JPY" | null;
}

interface SubjectOption {
  ref: string;
  label: string;
  currency: "USD" | "JPY";
  groupLabel: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; options: readonly SubjectOption[] }
  /** The list could not be read; the reference is typed instead. */
  | { kind: "fallback" };

const EMPTY_OPTION_LABEL = "Select an instrument or company…";
const LOADING_LABEL = "Loading subjects…";

const LABEL_CLASS = "block text-xs font-medium text-stone-700";
const HINT_CLASS = "text-[11px] leading-relaxed text-stone-600";
const ERROR_CLASS = "text-[11px] font-medium text-stone-800";
const SELECT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:text-stone-500";
const INPUT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";

/* -------------------------------------------------------------- API reading */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * `GET /api/subjects` replies with `{ data: Subject[] }`. Entries missing a
 * reference, a label or a supported currency are skipped rather than shown as a
 * blank option.
 */
function optionsFrom(payload: unknown): SubjectOption[] {
  const data = asRecord(payload)?.data;
  if (!Array.isArray(data)) return [];

  const options: SubjectOption[] = [];
  for (const entry of data) {
    const record = asRecord(entry);
    if (record === null) continue;

    const { ref, label, currency, groupLabel } = record;
    if (typeof ref !== "string" || ref === "") continue;
    if (typeof label !== "string" || label === "") continue;
    if (currency !== "USD" && currency !== "JPY") continue;

    options.push({
      ref,
      label,
      currency,
      groupLabel:
        typeof groupLabel === "string" && groupLabel !== ""
          ? groupLabel
          : "Other subjects",
    });
  }
  return options;
}

/**
 * One request per browser session, shared by every picker on the page. A
 * failure is not cached, so a later mount can try again.
 */
let cachedRequest: Promise<readonly SubjectOption[]> | null = null;

function loadSubjectOptions(): Promise<readonly SubjectOption[]> {
  if (cachedRequest === null) {
    cachedRequest = fetch("/api/subjects", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`/api/subjects responded ${response.status}`);
        }
        const payload: unknown = await response.json();
        const options = optionsFrom(payload);
        if (options.length === 0) {
          throw new Error("/api/subjects returned no usable subjects");
        }
        return options;
      })
      .catch((error: unknown) => {
        cachedRequest = null;
        throw error;
      });
  }
  return cachedRequest;
}

/** Groups in the order the registry reported them, so the list is stable. */
function groupOptions(
  options: readonly SubjectOption[]
): ReadonlyArray<{ groupLabel: string; options: readonly SubjectOption[] }> {
  const groups: Array<{ groupLabel: string; options: SubjectOption[] }> = [];
  for (const option of options) {
    const existing = groups.find(
      (group) => group.groupLabel === option.groupLabel
    );
    if (existing === undefined) {
      groups.push({ groupLabel: option.groupLabel, options: [option] });
    } else {
      existing.options.push(option);
    }
  }
  return groups;
}

/* --------------------------------------------------------------- component */

export function SubjectPicker({
  id,
  value,
  onChange,
  label = "Subject",
  hint = null,
  error,
  disabled = false,
}: {
  id: string;
  /** The selected reference, or "" for nothing chosen yet. */
  value: string;
  /** Called with the chosen subject, or null when the choice is cleared. */
  onChange: (subject: PickedSubject | null) => void;
  label?: string;
  hint?: string | null;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Only used by the typed fallback; the select reads `value` directly.
  const [typedRef, setTypedRef] = useState(value);
  const [typedLabel, setTypedLabel] = useState("");

  useEffect(() => {
    let active = true;
    loadSubjectOptions().then(
      (options) => {
        if (active) setState({ kind: "ready", options });
      },
      () => {
        if (active) setState({ kind: "fallback" });
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [
    hint === null ? null : hintId,
    error === undefined ? null : errorId,
  ]
    .filter((candidate): candidate is string => candidate !== null)
    .join(" ");
  const describedByAttribute = describedBy === "" ? undefined : describedBy;

  function messages() {
    return (
      <>
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
      </>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className={LABEL_CLASS}>
          {label}
        </label>
        <select
          id={id}
          value=""
          disabled
          aria-describedby={describedByAttribute}
          className={SELECT_CLASS}
        >
          <option value="">{LOADING_LABEL}</option>
        </select>
        {messages()}
      </div>
    );
  }

  if (state.kind === "fallback") {
    const emit = (nextRef: string, nextLabel: string) => {
      const trimmedRef = nextRef.trim();
      const trimmedLabel = nextLabel.trim();
      onChange(
        trimmedRef === ""
          ? null
          : {
              ref: trimmedRef,
              // An unnamed subject reads as its reference rather than as blank.
              label: trimmedLabel === "" ? trimmedRef : trimmedLabel,
              currency: null,
            }
      );
    };

    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={id} className={LABEL_CLASS}>
            Subject reference (scope:id)
          </label>
          <input
            id={id}
            type="text"
            value={typedRef}
            disabled={disabled}
            aria-describedby={describedByAttribute}
            aria-invalid={error === undefined ? undefined : true}
            onChange={(event) => {
              setTypedRef(event.target.value);
              emit(event.target.value, typedLabel);
            }}
            className={INPUT_CLASS}
          />
          <p className={HINT_CLASS}>
            The subject list could not be loaded, so the reference is typed
            here: demo:, research: or research-jp: followed by the identifier.
          </p>
          {messages()}
        </div>

        <div className="space-y-1">
          <label htmlFor={`${id}-label`} className={LABEL_CLASS}>
            Subject label
          </label>
          <input
            id={`${id}-label`}
            type="text"
            value={typedLabel}
            disabled={disabled}
            onChange={(event) => {
              setTypedLabel(event.target.value);
              emit(typedRef, event.target.value);
            }}
            className={INPUT_CLASS}
          />
        </div>
      </div>
    );
  }

  const { options } = state;
  const isKnown = value === "" || options.some((option) => option.ref === value);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={describedByAttribute}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => {
          const next = event.target.value;
          const option = options.find((candidate) => candidate.ref === next);
          onChange(
            option === undefined
              ? null
              : {
                  ref: option.ref,
                  label: option.label,
                  currency: option.currency,
                }
          );
        }}
        className={SELECT_CLASS}
      >
        <option value="">{EMPTY_OPTION_LABEL}</option>
        {/* A reference the registry does not know is kept rather than silently
            swapped for the first option in the list. */}
        {isKnown ? null : <option value={value}>{value}</option>}
        {groupOptions(options).map((group) => (
          <optgroup key={group.groupLabel} label={group.groupLabel}>
            {group.options.map((option) => (
              <option key={option.ref} value={option.ref}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {messages()}
    </div>
  );
}
