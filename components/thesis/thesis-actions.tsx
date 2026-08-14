"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ThesisStatus } from "@/lib/thesis/types";
import {
  THESIS_STATUS_DESCRIPTION,
  THESIS_STATUS_LABEL,
  THESIS_STATUS_ORDER,
} from "./labels";

/**
 * The two writes a user can make on a thesis without revising it: changing its
 * status and adding a journal note. Both are append-only at the store level —
 * a status change records an entry rather than replacing history — so the copy
 * here says so plainly.
 *
 * Revision is a link, not a button: it opens the form where the reasoning is
 * rewritten and a new version is created.
 */

const STATUS_NOTE_LIMITS = { min: 5, max: 2_000 } as const;
const NOTE_LIMITS = { min: 1, max: 5_000 } as const;

const INPUT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm leading-relaxed text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";
const SELECT_CLASS =
  "rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:border-stone-400 disabled:bg-stone-500";
const SECONDARY_LINK_CLASS =
  "inline-block rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const LABEL_CLASS = "block text-xs font-medium text-stone-700";
const HINT_CLASS = "text-[11px] leading-relaxed text-stone-600";
const ERROR_CLASS = "text-[11px] font-medium text-stone-800";
const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessageFrom(payload: unknown): string | null {
  const message = asRecord(asRecord(payload)?.error)?.message;
  return typeof message === "string" && message !== "" ? message : null;
}

function lengthError(
  raw: string,
  limits: { min: number; max: number }
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "This field is required.";
  if (trimmed.length < limits.min) {
    return `Write at least ${limits.min} characters.`;
  }
  if (trimmed.length > limits.max) {
    return `Keep this to ${limits.max} characters or fewer.`;
  }
  return null;
}

export function ThesisActions({
  thesisId,
  status,
}: {
  thesisId: string;
  status: ThesisStatus;
}) {
  const router = useRouter();
  const idPrefix = useId();

  const [nextStatus, setNextStatus] = useState<ThesisStatus>(status);
  const [statusNote, setStatusNote] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);

  const isBusy = isApplying || isAddingNote;

  async function post(
    action: "set-status" | "add-note",
    payload: Record<string, unknown>
  ): Promise<string | null> {
    try {
      const response = await fetch(`/api/thesis/${thesisId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      if (response.ok) return null;
      const body: unknown = await response.json().catch((): unknown => null);
      return (
        errorMessageFrom(body) ??
        "The change could not be saved. Please try again."
      );
    } catch {
      return "The change could not be saved because the request failed. Check your connection and try again.";
    }
  }

  async function handleStatusSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const invalid = lengthError(statusNote, STATUS_NOTE_LIMITS);
    if (invalid !== null) {
      setStatusError(invalid);
      return;
    }
    setStatusError(null);
    setIsApplying(true);

    const failure = await post("set-status", {
      status: nextStatus,
      note: statusNote.trim(),
    });
    setIsApplying(false);
    if (failure !== null) {
      setStatusError(failure);
      return;
    }
    setStatusNote("");
    router.refresh();
  }

  async function handleNoteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const invalid = lengthError(note, NOTE_LIMITS);
    if (invalid !== null) {
      setNoteError(invalid);
      return;
    }
    setNoteError(null);
    setIsAddingNote(true);

    const failure = await post("add-note", { text: note.trim() });
    setIsAddingNote(false);
    if (failure !== null) {
      setNoteError(failure);
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className={SECTION_CLASS}>
        <h2 className="text-base font-semibold text-stone-900">Revise</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          A revision creates a new version and asks what changed. The version you
          are reading now is kept exactly as written.
        </p>
        <Link href={`/theses/${thesisId}/revise`} className={SECONDARY_LINK_CLASS}>
          Revise thesis
        </Link>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-base font-semibold text-stone-900">Status</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          {`Currently ${THESIS_STATUS_LABEL[status]} — ${THESIS_STATUS_DESCRIPTION[status].toLowerCase()}`}
        </p>

        <form onSubmit={handleStatusSubmit} className="space-y-3" noValidate>
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-status`} className={LABEL_CLASS}>
              New status
            </label>
            <select
              id={`${idPrefix}-status`}
              value={nextStatus}
              disabled={isBusy}
              onChange={(event) => {
                const selected = THESIS_STATUS_ORDER.find(
                  (candidate) => candidate === event.target.value
                );
                if (selected !== undefined) setNextStatus(selected);
              }}
              className={SELECT_CLASS}
            >
              {THESIS_STATUS_ORDER.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {`${THESIS_STATUS_LABEL[candidate]} — ${THESIS_STATUS_DESCRIPTION[candidate]}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-status-note`} className={LABEL_CLASS}>
              Why is the status changing?
            </label>
            <textarea
              id={`${idPrefix}-status-note`}
              rows={3}
              value={statusNote}
              disabled={isBusy}
              onChange={(event) => setStatusNote(event.target.value)}
              aria-describedby={
                statusError === null
                  ? `${idPrefix}-status-hint`
                  : `${idPrefix}-status-hint ${idPrefix}-status-error`
              }
              aria-invalid={statusError === null ? undefined : true}
              className={INPUT_CLASS}
            />
            <p id={`${idPrefix}-status-hint`} className={HINT_CLASS}>
              Status changes are recorded in the journal, so the reason stays
              with the decision.
            </p>
            {statusError === null ? null : (
              <p id={`${idPrefix}-status-error`} className={ERROR_CLASS}>
                {statusError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isApplying ? "Applying…" : "Apply status change"}
          </button>
        </form>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-base font-semibold text-stone-900">Add a note</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          An observation that does not change the thesis itself — something you
          noticed, or a question worth investigating.
        </p>

        <form onSubmit={handleNoteSubmit} className="space-y-3" noValidate>
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-note`} className={LABEL_CLASS}>
              Journal note
            </label>
            <textarea
              id={`${idPrefix}-note`}
              rows={4}
              value={note}
              disabled={isBusy}
              onChange={(event) => setNote(event.target.value)}
              aria-describedby={
                noteError === null
                  ? `${idPrefix}-note-hint`
                  : `${idPrefix}-note-hint ${idPrefix}-note-error`
              }
              aria-invalid={noteError === null ? undefined : true}
              className={INPUT_CLASS}
            />
            <p id={`${idPrefix}-note-hint`} className={HINT_CLASS}>
              Notes are appended permanently and cannot be edited or deleted.
            </p>
            {noteError === null ? null : (
              <p id={`${idPrefix}-note-error`} className={ERROR_CLASS}>
                {noteError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isAddingNote ? "Adding note…" : "Add note"}
          </button>
        </form>
      </section>
    </div>
  );
}
