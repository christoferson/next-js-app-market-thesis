import type {
  CurrencyTotals,
  Position,
  PriceMark,
  Transaction,
} from "./types";

/**
 * Pure portfolio calculations (P1). Deterministic TypeScript per SPEC §2.2;
 * no rounding during computation (display rounds); missing data is null,
 * never zero.
 *
 * Cost-basis method: MOVING AVERAGE. On each buy, average cost becomes
 * (existing basis + purchase cost incl. fee) / new quantity. On each sell,
 * realized gain = proceeds net of fee − quantity sold × average cost;
 * average cost per share is unchanged by sells.
 */

export interface PositionInput {
  subjectRef: string;
  subjectLabel: string;
  currency: "USD" | "JPY";
  transactions: Transaction[];
  latestMark: PriceMark | null;
}

export interface SellValidationContext {
  subjectRef: string;
  /** Transactions that already exist for this subject (any order). */
  existing: Transaction[];
}

/**
 * Validate that a prospective sell never exceeds the holding at its date.
 * Transactions are replayed in date order (createdAt breaks same-day ties)
 * including the candidate; a negative holding anywhere rejects it.
 */
export function validateSellQuantity(
  candidate: Transaction,
  context: SellValidationContext
): { ok: true } | { ok: false; message: string } {
  // Defense in depth: only this subject's ledger counts toward the balance,
  // even if a caller passes a mixed transaction list.
  const relevant = context.existing.filter(
    (transaction) => transaction.subjectRef === context.subjectRef
  );
  const all = [...relevant, candidate].sort(compareTransactions);
  let quantity = 0;
  for (const transaction of all) {
    if (transaction.kind === "buy") {
      quantity += transaction.quantity ?? 0;
    } else if (transaction.kind === "sell") {
      quantity -= transaction.quantity ?? 0;
      if (quantity < -1e-9) {
        return {
          ok: false,
          message:
            "This sell would exceed the shares held on that date. Record the missing buy first.",
        };
      }
    }
  }
  return { ok: true };
}

function compareTransactions(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/** Compute the derived position from a subject's transaction history. */
export function calculatePosition(input: PositionInput): Position {
  const ordered = [...input.transactions].sort(compareTransactions);

  let quantity = 0;
  let costBasis = 0;
  let realizedGain = 0;
  let dividendIncome = 0;
  let totalFees = 0;

  for (const transaction of ordered) {
    totalFees += transaction.fee;

    if (transaction.kind === "buy") {
      const shares = transaction.quantity ?? 0;
      const price = transaction.price ?? 0;
      costBasis += shares * price + transaction.fee;
      quantity += shares;
    } else if (transaction.kind === "sell") {
      const shares = transaction.quantity ?? 0;
      const price = transaction.price ?? 0;
      const averageCost = quantity > 0 ? costBasis / quantity : 0;
      const proceeds = shares * price - transaction.fee;
      realizedGain += proceeds - shares * averageCost;
      costBasis -= shares * averageCost;
      quantity -= shares;
      // Guard float dust on full exits so closed positions read exactly 0.
      if (Math.abs(quantity) < 1e-9) {
        quantity = 0;
        costBasis = 0;
      }
    } else {
      dividendIncome += transaction.amount ?? 0;
    }
  }

  const open = quantity > 0;
  const averageCost = open ? costBasis / quantity : null;
  // A mark in a different currency must not value this position — mixing
  // USD and JPY without an explicit rate is forbidden (SPEC §2.5).
  const mark =
    input.latestMark !== null && input.latestMark.currency === input.currency
      ? input.latestMark
      : null;
  const markValue = open && mark !== null ? quantity * mark.price : null;
  const unrealizedGain =
    markValue !== null && open ? markValue - costBasis : null;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  return {
    subjectRef: input.subjectRef,
    subjectLabel: input.subjectLabel,
    currency: input.currency,
    quantity,
    averageCost,
    costBasis: open ? costBasis : null,
    realizedGain,
    dividendIncome,
    totalFees,
    latestMark: mark,
    markValue,
    unrealizedGain,
    transactionCount: ordered.length,
    firstTransactionDate: first?.date ?? "",
    lastTransactionDate: last?.date ?? "",
  };
}

/**
 * Per-currency totals. USD and JPY are computed independently and never
 * combined (SPEC §2.5). Marked value sums only positions with marks; the
 * unmarked count and oldest mark date keep the number honest.
 */
export function calculateCurrencyTotals(
  positions: readonly Position[]
): CurrencyTotals[] {
  const byCurrency = new Map<"USD" | "JPY", Position[]>();
  for (const position of positions) {
    const list = byCurrency.get(position.currency) ?? [];
    list.push(position);
    byCurrency.set(position.currency, list);
  }

  const totals: CurrencyTotals[] = [];
  for (const [currency, group] of byCurrency) {
    const open = group.filter((p) => p.quantity > 0);
    const marked = open.filter((p) => p.markValue !== null);

    totals.push({
      currency,
      positionCount: group.length,
      openPositionCount: open.length,
      costBasis: open.reduce((sum, p) => sum + (p.costBasis ?? 0), 0),
      realizedGain: group.reduce((sum, p) => sum + p.realizedGain, 0),
      dividendIncome: group.reduce((sum, p) => sum + p.dividendIncome, 0),
      totalFees: group.reduce((sum, p) => sum + p.totalFees, 0),
      markedValue:
        marked.length > 0
          ? marked.reduce((sum, p) => sum + (p.markValue ?? 0), 0)
          : null,
      unmarkedPositionCount: open.length - marked.length,
      oldestMarkDate:
        marked.length > 0
          ? marked
              .map((p) => p.latestMark?.asOf ?? "")
              .filter((d) => d !== "")
              .sort()[0] ?? null
          : null,
    });
  }

  // Deterministic order: USD then JPY.
  return totals.sort((a, b) =>
    a.currency === b.currency ? 0 : a.currency === "USD" ? -1 : 1
  );
}
