import "server-only";

import {
  calculateCurrencyTotals,
  calculatePosition,
  validateSellQuantity,
} from "./calculate";
import {
  getLatestMark,
  listTransactions,
} from "./store";
import type { CurrencyTotals, Position, Transaction } from "./types";

/**
 * Portfolio read model (P1): group the ledger by subject, derive positions
 * and per-currency totals. All pure calculation over stored transactions.
 */

export interface PortfolioView {
  positions: Position[];
  totals: CurrencyTotals[];
  transactionCount: number;
}

export function getPortfolio(): PortfolioView {
  const transactions = listTransactions();

  const bySubject = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const list = bySubject.get(transaction.subjectRef) ?? [];
    list.push(transaction);
    bySubject.set(transaction.subjectRef, list);
  }

  const positions: Position[] = [];
  for (const [subjectRef, subjectTransactions] of bySubject) {
    const first = subjectTransactions[0]!;
    positions.push(
      calculatePosition({
        subjectRef,
        subjectLabel: first.subjectLabel,
        currency: first.currency,
        transactions: subjectTransactions,
        latestMark: getLatestMark(subjectRef),
      })
    );
  }

  // Open positions first, then by label for stable rendering.
  positions.sort((a, b) => {
    const aOpen = a.quantity > 0 ? 0 : 1;
    const bOpen = b.quantity > 0 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return a.subjectLabel.localeCompare(b.subjectLabel);
  });

  return {
    positions,
    totals: calculateCurrencyTotals(positions),
    transactionCount: transactions.length,
  };
}

export { validateSellQuantity };
