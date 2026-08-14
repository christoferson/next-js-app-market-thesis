/**
 * Portfolio tracking domain (Phase P, milestone P1).
 *
 * Product rules (SPEC §25 Phase P / §24.5 / §2.5):
 * - Manual transactions only (no broker connections).
 * - USD and JPY positions coexist but are NEVER added or compared without
 *   an explicit exchange rate — P1 reports per-currency totals only.
 * - No live prices exist in this deployment: unrealized values come from
 *   user-recorded price marks, always displayed with their as-of date.
 * - Cost basis uses the moving-average method (the standard method for
 *   Japanese tax purposes), stated in the UI.
 * - Price performance and thesis health stay separate concepts.
 */

export type TransactionKind = "buy" | "sell" | "dividend";

export interface Transaction {
  id: string;
  /** Same scheme as theses: demo:/research:/research-jp: scoped subject. */
  subjectRef: string;
  subjectLabel: string;
  currency: "USD" | "JPY";
  kind: TransactionKind;
  /** ISO date of the trade/payment. */
  date: string;
  /** Shares. Null for dividend (cash amount only). */
  quantity: number | null;
  /** Per-share price for buy/sell; null for dividend. */
  price: number | null;
  /** Cash amount for dividends (total received, native currency). */
  amount: number | null;
  /** Commission/fees in native currency; affects cost basis and proceeds. */
  fee: number;
  note: string | null;
  createdAt: string;
}

/** A user-recorded price observation — the only source of "current" value. */
export interface PriceMark {
  id: string;
  subjectRef: string;
  currency: "USD" | "JPY";
  price: number;
  /** ISO date the price was observed. */
  asOf: string;
  createdAt: string;
}

/** Derived position state (pure calculation output, never stored). */
export interface Position {
  subjectRef: string;
  subjectLabel: string;
  currency: "USD" | "JPY";

  /** Current holding. Zero quantity = closed position. */
  quantity: number;
  /** Moving-average cost per share of the current holding. */
  averageCost: number | null;
  /** Total cost basis of the current holding (quantity × averageCost). */
  costBasis: number | null;

  /** Sum of realized gains/losses from sells, net of fees. */
  realizedGain: number;
  /** Sum of dividends received. */
  dividendIncome: number;
  /** Total fees paid across all transactions. */
  totalFees: number;

  /** Latest user price mark, when one exists. */
  latestMark: PriceMark | null;
  /** quantity × mark price — only when a mark exists. */
  markValue: number | null;
  /** markValue − costBasis — only when both exist. */
  unrealizedGain: number | null;

  transactionCount: number;
  firstTransactionDate: string;
  lastTransactionDate: string;
}

/** Per-currency portfolio totals. Currencies are never combined. */
export interface CurrencyTotals {
  currency: "USD" | "JPY";
  positionCount: number;
  openPositionCount: number;
  costBasis: number;
  realizedGain: number;
  dividendIncome: number;
  totalFees: number;
  /** Sum of mark values for positions THAT HAVE MARKS. */
  markedValue: number | null;
  /** How many open positions have no price mark (honesty indicator). */
  unmarkedPositionCount: number;
  /** Oldest mark date among marked positions (staleness indicator). */
  oldestMarkDate: string | null;
}

export interface TransactionError {
  code: "OVERSELL" | "INVALID";
  message: string;
}
