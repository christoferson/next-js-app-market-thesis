import type { SupportedCurrency } from "@/lib/domain";
import { MISSING_DISPLAY, formatCompactNumber, formatCurrency } from "@/lib/format";
import type { TransactionKind } from "@/lib/portfolio/types";

/**
 * Display vocabulary and shared styling for the portfolio pages, used by the
 * server-rendered ledger view and by the client forms so a currency or a
 * transaction kind is never worded two different ways.
 *
 * The language describes bookkeeping, never a recommendation: a portfolio here
 * is a record of what was bought and what it cost.
 */

export const CURRENCY_LABEL: Record<SupportedCurrency, string> = {
  USD: "US Dollar (USD)",
  JPY: "Japanese Yen (JPY)",
};

export const CURRENCIES: readonly SupportedCurrency[] = ["USD", "JPY"];

export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
};

export const TRANSACTION_KINDS: readonly TransactionKind[] = [
  "buy",
  "sell",
  "dividend",
];

/** What each kind records, shown beside the kind selector. */
export const TRANSACTION_KIND_DESCRIPTION: Record<TransactionKind, string> = {
  buy: "Shares acquired, at a per-share price.",
  sell: "Shares disposed of, at a per-share price.",
  dividend: "Cash received, with no change in shares held.",
};

export const METHODOLOGY_NOTE =
  "Cost basis uses the moving-average method. Values are in each position's " +
  "native currency; USD and JPY are never combined without an explicit " +
  "exchange rate, which this page does not apply.";

export const STORAGE_NOTE =
  "Stored locally in this application's database — not synced to an account.";

/**
 * Share counts are plain numbers, not currency: a fractional holding keeps its
 * fraction, and only genuinely large counts are abbreviated. Missing counts
 * display as an em dash, never as 0.
 */
export function formatQuantity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING_DISPLAY;
  if (Math.abs(value) >= 1e6) return formatCompactNumber(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

/**
 * Signed money with an explicit sign and a true minus sign: +$129.80 / −¥4,000.
 * A gain and a loss must be distinguishable in text, not by colour alone.
 */
export function formatSignedCurrency(
  value: number | null,
  currency: SupportedCurrency
): string {
  if (value === null || !Number.isFinite(value)) return MISSING_DISPLAY;
  const magnitude = formatCurrency(Math.abs(value), currency);
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `−${magnitude}`;
  return magnitude;
}

/* ----------------------------------------------------------------- styling */

export const TABLE_CLASS = "w-full border-collapse text-sm";
export const HEAD_CELL_CLASS =
  "border-b border-stone-300 px-3 py-2 text-left align-bottom text-xs font-medium tracking-wide text-stone-600 uppercase";
export const NUMERIC_HEAD_CELL_CLASS = `${HEAD_CELL_CLASS} text-right`;
export const CELL_CLASS =
  "border-b border-stone-200 px-3 py-2.5 align-top text-stone-800";
export const NUMERIC_CELL_CLASS = `${CELL_CLASS} text-right tabular-nums`;
export const BADGE_CLASS =
  "inline-block rounded-sm border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase";
export const SECTION_CLASS =
  "space-y-4 rounded-md border border-stone-200 bg-white p-5";
export const HINT_CLASS = "text-[11px] leading-relaxed text-stone-600";
export const ERROR_CLASS = "text-[11px] font-medium text-stone-800";
export const LABEL_CLASS = "block text-xs font-medium text-stone-700";
export const INPUT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500";
export const NUMBER_INPUT_CLASS = `${INPUT_CLASS} tabular-nums`;
export const SELECT_CLASS =
  "w-full rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
export const PRIMARY_BUTTON_CLASS =
  "rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:border-stone-400 disabled:bg-stone-500";
export const SMALL_BUTTON_CLASS =
  "shrink-0 rounded-sm border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-700 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:text-stone-500";
