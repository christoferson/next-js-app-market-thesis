"use client";

import {
  ERROR_CLASS,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  NUMBER_INPUT_CLASS,
  SELECT_CLASS,
} from "./labels";

/**
 * The labelled controls shared by the portfolio forms.
 *
 * Defined at module level (not inside the forms) so their identity is stable
 * across renders — a component redefined during render remounts its input and
 * drops focus on every keystroke.
 */

export type FieldKind = "text" | "date" | "decimal";

export function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  kind = "text",
  required = false,
  disabled = false,
  placeholder,
}: {
  id: string;
  label: string;
  hint: string | null;
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  kind?: FieldKind;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [
    hint === null ? null : hintId,
    error === undefined ? null : errorId,
  ]
    .filter((candidate): candidate is string => candidate !== null)
    .join(" ");

  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {required ? null : (
          <span className="ml-1 font-normal text-stone-500">(optional)</span>
        )}
      </label>
      <input
        id={id}
        type={kind === "date" ? "date" : "text"}
        value={value}
        disabled={disabled}
        {...(kind === "decimal" ? { inputMode: "decimal" as const } : {})}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(required ? { required: true } : {})}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => onChange(event.target.value)}
        className={kind === "decimal" ? NUMBER_INPUT_CLASS : INPUT_CLASS}
      />
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

export function SelectField({
  id,
  label,
  hint,
  value,
  options,
  onChange,
  error,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string | null;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const resolvedHint = hint ?? null;
  const describedBy = [
    resolvedHint === null ? null : hintId,
    error === undefined ? null : errorId,
  ]
    .filter((candidate): candidate is string => candidate !== null)
    .join(" ");

  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {resolvedHint === null ? null : (
        <p id={hintId} className={HINT_CLASS}>
          {resolvedHint}
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
