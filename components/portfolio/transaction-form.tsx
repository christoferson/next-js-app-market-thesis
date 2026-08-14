"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import type { SupportedCurrency } from "@/lib/domain";
import type { TransactionKind } from "@/lib/portfolio/types";
import {
  SUBJECT_SCOPES,
  SUBJECT_SCOPE_LABEL,
  type SubjectScope,
} from "@/components/thesis/labels";
import { Field, SelectField } from "./fields";
import { postPortfolio, type FieldErrors } from "./api";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  PRIMARY_BUTTON_CLASS,
  SECTION_CLASS,
  TRANSACTION_KINDS,
  TRANSACTION_KIND_DESCRIPTION,
  TRANSACTION_KIND_LABEL,
} from "./labels";

/**
 * Recording one ledger entry. The kind decides which fields exist rather than
 * greying them out: a dividend has no share quantity and no per-share price at
 * all, and the server rejects a request that carries one, so the form never
 * offers them.
 *
 * Client-side validation mirrors the server's schema so a mistake is caught
 * before a request is made; the server stays the authority, and its per-field
 * messages — including the oversell check, which only it can perform — are
 * mapped back onto the same inputs.
 */

const SUBJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LABEL_LENGTH = 200;
const MAX_NOTE_LENGTH = 500;

const SUBJECT_SCOPE_OPTIONS = SUBJECT_SCOPES.map((scope) => ({
  value: scope,
  label: SUBJECT_SCOPE_LABEL[scope],
}));

const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
  value: currency,
  label: CURRENCY_LABEL[currency],
}));

const KIND_OPTIONS = TRANSACTION_KINDS.map((kind) => ({
  value: kind,
  label: `${TRANSACTION_KIND_LABEL[kind]} — ${TRANSACTION_KIND_DESCRIPTION[kind]}`,
}));

interface TransactionPayload {
  subjectRef: string;
  subjectLabel: string;
  currency: SupportedCurrency;
  kind: TransactionKind;
  date: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fee: number;
  note: string | null;
}

/** A blank field is missing, never 0; anything unparseable is reported. */
function parseNumber(
  raw: string,
  rules: { required: boolean; positive: boolean }
): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {
      value: null,
      error: rules.required ? "This field is required." : null,
    };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: "Enter a number." };
  }
  if (rules.positive && parsed <= 0) {
    return { value: null, error: "Enter a number greater than zero." };
  }
  if (!rules.positive && parsed < 0) {
    return { value: null, error: "Enter zero or a positive number." };
  }
  return { value: parsed, error: null };
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function TransactionForm() {
  const router = useRouter();
  const idPrefix = useId();

  const [kind, setKind] = useState<TransactionKind>("buy");
  const [subjectScope, setSubjectScope] = useState<SubjectScope>("research");
  const [subjectId, setSubjectId] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTrade = kind === "buy" || kind === "sell";

  function fieldId(name: string): string {
    return `${idPrefix}-${name}`;
  }

  function buildPayload(): TransactionPayload | null {
    const errors: FieldErrors = {};

    const normalizedId = subjectId.trim().toLowerCase();
    if (!SUBJECT_ID_PATTERN.test(normalizedId)) {
      errors.subjectRef =
        "Enter an identifier using lowercase letters, digits and hyphens.";
    }

    const trimmedLabel = subjectLabel.trim();
    if (trimmedLabel === "") {
      errors.subjectLabel = "This field is required.";
    } else if (trimmedLabel.length > MAX_LABEL_LENGTH) {
      errors.subjectLabel = `Keep this to ${MAX_LABEL_LENGTH} characters or fewer.`;
    }

    const trimmedDate = date.trim();
    if (trimmedDate === "") {
      errors.date = "This field is required.";
    } else if (!isRealDate(trimmedDate)) {
      errors.date = "Use a real calendar date in the form YYYY-MM-DD.";
    }

    const parsedFee = parseNumber(fee, { required: false, positive: false });
    if (parsedFee.error !== null) errors.fee = parsedFee.error;

    const trimmedNote = note.trim();
    if (trimmedNote.length > MAX_NOTE_LENGTH) {
      errors.note = `Keep this to ${MAX_NOTE_LENGTH} characters or fewer.`;
    }

    let quantityValue: number | null = null;
    let priceValue: number | null = null;
    let amountValue: number | null = null;

    if (isTrade) {
      const parsedQuantity = parseNumber(quantity, {
        required: true,
        positive: true,
      });
      if (parsedQuantity.error !== null) errors.quantity = parsedQuantity.error;
      quantityValue = parsedQuantity.value;

      const parsedPrice = parseNumber(price, {
        required: true,
        positive: false,
      });
      if (parsedPrice.error !== null) errors.price = parsedPrice.error;
      priceValue = parsedPrice.value;
    } else {
      const parsedAmount = parseNumber(amount, {
        required: true,
        positive: true,
      });
      if (parsedAmount.error !== null) errors.amount = parsedAmount.error;
      amountValue = parsedAmount.value;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(
        "Some fields need attention before this transaction can be recorded."
      );
      setSavedMessage(null);
      return null;
    }

    setFieldErrors({});
    setFormError(null);
    return {
      subjectRef: `${subjectScope}:${normalizedId}`,
      subjectLabel: trimmedLabel,
      currency,
      kind,
      date: trimmedDate,
      quantity: quantityValue,
      price: priceValue,
      amount: amountValue,
      // The fee defaults to 0 because "no commission" is a real answer, unlike
      // an unknown price.
      fee: parsedFee.value ?? 0,
      note: trimmedNote === "" ? null : trimmedNote,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const payload = buildPayload();
    if (payload === null) return;

    setIsSubmitting(true);
    setSavedMessage(null);
    const result = await postPortfolio(
      "add-transaction",
      payload,
      "The transaction could not be recorded."
    );
    setIsSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      setFormError(result.message);
      return;
    }

    // The subject is kept: several entries for the same holding are usual.
    setQuantity("");
    setPrice("");
    setAmount("");
    setNote("");
    setSavedMessage(
      `${TRANSACTION_KIND_LABEL[payload.kind]} recorded for ${payload.subjectLabel}.`
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <fieldset className={SECTION_CLASS}>
        <legend className="text-sm font-semibold text-stone-900">Entry</legend>

        <div className="sm:max-w-md">
          <SelectField
            id={fieldId("kind")}
            label="Kind"
            value={kind}
            options={KIND_OPTIONS}
            disabled={isSubmitting}
            onChange={(raw) => {
              const selected = TRANSACTION_KINDS.find(
                (candidate) => candidate === raw
              );
              if (selected === undefined) return;
              setKind(selected);
              // The fields that disappear must not travel with the request.
              setFieldErrors({});
              setFormError(null);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id={fieldId("subjectScope")}
            label="Subject type"
            value={subjectScope}
            options={SUBJECT_SCOPE_OPTIONS}
            disabled={isSubmitting}
            onChange={(raw) => {
              const scope = SUBJECT_SCOPES.find((candidate) => candidate === raw);
              if (scope !== undefined) setSubjectScope(scope);
            }}
          />
          <Field
            id={fieldId("subjectRef")}
            label="Subject identifier"
            hint="e.g. msft, nintendo, stock-us-northstar-software"
            value={subjectId}
            onChange={setSubjectId}
            error={fieldErrors.subjectRef}
            required
            disabled={isSubmitting}
          />
        </div>

        <Field
          id={fieldId("subjectLabel")}
          label="Subject label"
          hint="How it should read in the ledger, e.g. Microsoft (MSFT)."
          value={subjectLabel}
          onChange={setSubjectLabel}
          error={fieldErrors.subjectLabel}
          required
          disabled={isSubmitting}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id={fieldId("currency")}
            label="Currency"
            hint="The currency the trade settled in. Currencies are reported separately."
            value={currency}
            options={CURRENCY_OPTIONS}
            disabled={isSubmitting}
            onChange={(raw) => {
              const selected = CURRENCIES.find((candidate) => candidate === raw);
              if (selected !== undefined) setCurrency(selected);
            }}
          />
          <Field
            id={fieldId("date")}
            label={isTrade ? "Trade date" : "Payment date"}
            hint={null}
            value={date}
            onChange={setDate}
            error={fieldErrors.date}
            kind="date"
            required
            disabled={isSubmitting}
          />
        </div>
      </fieldset>

      <fieldset className={SECTION_CLASS}>
        <legend className="text-sm font-semibold text-stone-900">Amounts</legend>

        {isTrade ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id={fieldId("quantity")}
              label="Quantity"
              hint="Shares or units, greater than zero."
              value={quantity}
              onChange={setQuantity}
              error={fieldErrors.quantity}
              kind="decimal"
              required
              disabled={isSubmitting}
            />
            <Field
              id={fieldId("price")}
              label="Price per share"
              hint={
                currency === "JPY"
                  ? "In whole yen."
                  : "In the currency selected above."
              }
              value={price}
              onChange={setPrice}
              error={fieldErrors.price}
              kind="decimal"
              required
              disabled={isSubmitting}
            />
            <Field
              id={fieldId("fee")}
              label="Fee"
              hint="Commission and charges. Zero if there were none."
              value={fee}
              onChange={setFee}
              error={fieldErrors.fee}
              kind="decimal"
              required
              disabled={isSubmitting}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={fieldId("amount")}
              label="Cash amount received"
              hint="The total payment, not a per-share figure."
              value={amount}
              onChange={setAmount}
              error={fieldErrors.amount}
              kind="decimal"
              required
              disabled={isSubmitting}
            />
            <Field
              id={fieldId("dividendFee")}
              label="Fee"
              hint="Withholding or charges deducted. Zero if there were none."
              value={fee}
              onChange={setFee}
              error={fieldErrors.fee}
              kind="decimal"
              required
              disabled={isSubmitting}
            />
          </div>
        )}

        <Field
          id={fieldId("note")}
          label="Note"
          hint="Anything worth remembering about this entry."
          value={note}
          onChange={setNote}
          error={fieldErrors.note}
          disabled={isSubmitting}
        />
      </fieldset>

      {formError === null ? null : (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-stone-400 bg-stone-50 p-4"
        >
          <p className="text-sm font-medium text-stone-900">{formError}</p>
          <p className="text-xs text-stone-700">
            Nothing was recorded. Correct the fields above and submit again.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSubmitting ? "Recording…" : "Record transaction"}
        </button>
        {/* Confirmation is text in a live region, not an animation. */}
        <p role="status" className="text-xs text-stone-600">
          {savedMessage ?? ""}
        </p>
      </div>
    </form>
  );
}
