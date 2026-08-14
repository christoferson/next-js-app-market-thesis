"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Field, SelectField } from "./fields";
import { postPortfolio, type FieldErrors } from "./api";
import {
  CURRENCY_LABEL,
  PRIMARY_BUTTON_CLASS,
  SECTION_CLASS,
} from "./labels";

/**
 * Recording a price the user looked up. No live prices exist in this
 * deployment, so a mark is the only thing that can value an open position —
 * and it is only ever shown with the date it was observed.
 *
 * The subject comes from a list of the open positions rather than from a typed
 * reference: a mark for a holding you do not have would value nothing, and the
 * currency then follows the position instead of being asked for twice.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PriceMarkOption {
  subjectRef: string;
  subjectLabel: string;
  currency: "USD" | "JPY";
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function PriceMarkForm({
  positions,
}: {
  positions: readonly PriceMarkOption[];
}) {
  const router = useRouter();
  const idPrefix = useId();

  const first = positions[0];
  const [subjectRef, setSubjectRef] = useState(first?.subjectRef ?? "");
  const [price, setPrice] = useState("");
  const [asOf, setAsOf] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected =
    positions.find((position) => position.subjectRef === subjectRef) ?? first;

  const options = positions.map((position) => ({
    value: position.subjectRef,
    label: `${position.subjectLabel} — ${CURRENCY_LABEL[position.currency]}`,
  }));

  function fieldId(name: string): string {
    return `${idPrefix}-${name}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || selected === undefined) return;

    const errors: FieldErrors = {};

    const trimmedPrice = price.trim();
    const parsedPrice = trimmedPrice === "" ? Number.NaN : Number(trimmedPrice);
    if (trimmedPrice === "") {
      errors.price = "This field is required.";
    } else if (!Number.isFinite(parsedPrice)) {
      errors.price = "Enter a number.";
    } else if (parsedPrice <= 0) {
      errors.price = "Enter a price greater than zero.";
    }

    const trimmedAsOf = asOf.trim();
    if (trimmedAsOf === "") {
      errors.asOf = "This field is required.";
    } else if (!isRealDate(trimmedAsOf)) {
      errors.asOf = "Use a real calendar date in the form YYYY-MM-DD.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Some fields need attention before this mark can be saved.");
      setSavedMessage(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSavedMessage(null);
    setIsSubmitting(true);

    const result = await postPortfolio(
      "add-mark",
      {
        subjectRef: selected.subjectRef,
        currency: selected.currency,
        price: parsedPrice,
        asOf: trimmedAsOf,
      },
      "The price mark could not be saved."
    );
    setIsSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      setFormError(result.message);
      return;
    }

    setPrice("");
    setSavedMessage(
      `Mark recorded for ${selected.subjectLabel}, as of ${trimmedAsOf}.`
    );
    router.refresh();
  }

  if (selected === undefined) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <fieldset className={SECTION_CLASS}>
        <legend className="text-sm font-semibold text-stone-900">
          Price mark
        </legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            id={fieldId("subjectRef")}
            label="Position"
            value={selected.subjectRef}
            options={options}
            disabled={isSubmitting}
            onChange={setSubjectRef}
          />
          <Field
            id={fieldId("price")}
            label={`Price per share (${selected.currency})`}
            hint={selected.currency === "JPY" ? "In whole yen." : null}
            value={price}
            onChange={setPrice}
            error={fieldErrors.price}
            kind="decimal"
            required
            disabled={isSubmitting}
          />
          <Field
            id={fieldId("asOf")}
            label="Price as of"
            hint={null}
            value={asOf}
            onChange={setAsOf}
            error={fieldErrors.asOf}
            kind="date"
            required
            disabled={isSubmitting}
          />
        </div>
      </fieldset>

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
          {isSubmitting ? "Saving mark…" : "Record price mark"}
        </button>
        <p role="status" className="text-xs text-stone-600">
          {savedMessage ?? ""}
        </p>
      </div>
    </form>
  );
}
