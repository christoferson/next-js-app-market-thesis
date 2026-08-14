"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { MISSING_DISPLAY, formatCurrency, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/portfolio/types";
import { postPortfolio } from "./api";
import {
  BADGE_CLASS,
  CELL_CLASS,
  HEAD_CELL_CLASS,
  NUMERIC_CELL_CLASS,
  NUMERIC_HEAD_CELL_CLASS,
  SMALL_BUTTON_CLASS,
  TABLE_CLASS,
  TRANSACTION_KIND_LABEL,
  formatQuantity,
} from "./labels";

const DELETE_CONFIRMATION =
  "Delete this transaction? Positions are recalculated from the remaining ledger.";

/**
 * Every entry as recorded, newest last, with the option to delete one.
 *
 * Deleting is offered because this is bookkeeping rather than a record of
 * reasoning: a mistyped quantity is the user's own ledger to correct, and
 * positions are always derived from whatever entries remain.
 */

/** The cash consequence of an entry: what left or arrived, fees excluded. */
function entryAmount(transaction: Transaction): number | null {
  if (transaction.kind === "dividend") return transaction.amount;
  if (transaction.quantity === null || transaction.price === null) return null;
  return transaction.quantity * transaction.price;
}

export function Ledger({
  transactions,
}: {
  transactions: readonly Transaction[];
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (deletingId !== null) return;
    if (!window.confirm(DELETE_CONFIRMATION)) return;

    setError(null);
    setDeletingId(id);
    const result = await postPortfolio(
      "delete-transaction",
      { id },
      "The transaction could not be deleted."
    );
    setDeletingId(null);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-stone-700">
        Deleting corrects a mistaken entry; positions recalculate from what
        remains.
      </p>

      {error === null ? null : (
        <p
          role="alert"
          className="rounded-md border border-stone-400 bg-stone-50 p-3 text-sm font-medium text-stone-900"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
        <table className={TABLE_CLASS}>
          <caption className="sr-only">
            Every transaction recorded, in date order, with its kind, subject,
            quantity, price, amount, fee and note. Values are in each entry&apos;s
            own currency; unavailable values are shown as an em dash.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Date
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Kind
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Subject
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Quantity
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Price
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Amount
              </th>
              <th scope="col" className={NUMERIC_HEAD_CELL_CLASS}>
                Fee
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Note
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <th
                  scope="row"
                  className={`${CELL_CLASS} font-normal whitespace-nowrap`}
                >
                  {formatDate(transaction.date)}
                </th>
                <td className={CELL_CLASS}>
                  {/* Kind is a word, not a colour: it reads the same to everyone. */}
                  <span className={BADGE_CLASS}>
                    {TRANSACTION_KIND_LABEL[transaction.kind]}
                  </span>
                </td>
                <td className={CELL_CLASS}>{transaction.subjectLabel}</td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatQuantity(transaction.quantity)}
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatCurrency(transaction.price, transaction.currency)}
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatCurrency(entryAmount(transaction), transaction.currency)}
                </td>
                <td className={NUMERIC_CELL_CLASS}>
                  {formatCurrency(transaction.fee, transaction.currency)}
                </td>
                <td className={`${CELL_CLASS} text-stone-700`}>
                  {transaction.note ?? MISSING_DISPLAY}
                </td>
                <td className={CELL_CLASS}>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDelete(transaction.id);
                    }}
                    disabled={deletingId !== null}
                    className={SMALL_BUTTON_CLASS}
                  >
                    {deletingId === transaction.id ? "Deleting…" : "Delete"}
                    <span className="sr-only">
                      {` ${TRANSACTION_KIND_LABEL[transaction.kind]} of ${
                        transaction.subjectLabel
                      } on ${formatDate(transaction.date)}`}
                    </span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
