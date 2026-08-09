import type { SupportedCurrency } from "@/lib/domain";

/** The canonical display for missing data. Never 0, "N/A"-variants differ per design. */
export const MISSING_DISPLAY = "—";

function isDisplayableNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const CURRENCY_FRACTION_DIGITS: Record<SupportedCurrency, number> = {
  USD: 2,
  JPY: 0,
};

const CURRENCY_SYMBOL: Record<SupportedCurrency, string> = {
  USD: "$",
  JPY: "¥",
};

/**
 * Full-precision currency for prices: $1,234.56 / ¥1,235.
 * JPY uses zero fraction digits. Missing or non-finite values display as —.
 */
export function formatCurrency(
  value: number | null,
  currency: SupportedCurrency
): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: CURRENCY_FRACTION_DIGITS[currency],
    maximumFractionDigits: CURRENCY_FRACTION_DIGITS[currency],
  }).format(value);
}

const COMPACT_TIERS: ReadonlyArray<{ threshold: number; suffix: string }> = [
  { threshold: 1e12, suffix: "T" },
  { threshold: 1e9, suffix: "B" },
  { threshold: 1e6, suffix: "M" },
  { threshold: 1e3, suffix: "K" },
];

function compactNumber(value: number): string {
  const magnitude = Math.abs(value);
  for (const tier of COMPACT_TIERS) {
    if (magnitude >= tier.threshold) {
      const scaled = value / tier.threshold;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      // Trim trailing zeros so 2.40M displays as 2.4M (SPEC §19.5 examples).
      const trimmed = Number.parseFloat(scaled.toFixed(digits)).toString();
      return `${trimmed}${tier.suffix}`;
    }
  }
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Compact currency for market capitalization: $1.25B / ¥1.25T.
 * Missing values display as —, never as $0 or ¥0.
 */
export function formatCompactCurrency(
  value: number | null,
  currency: SupportedCurrency
): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  return `${CURRENCY_SYMBOL[currency]}${compactNumber(value)}`;
}

/**
 * Percentages are stored as decimals (0.123 → "12.3%").
 * Missing values display as —, never as 0.0%.
 */
export function formatPercent(
  value: number | null,
  fractionDigits = 1
): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/**
 * Signed percentage change with a true minus sign: +1.4% / −2.1% / 0.0%.
 * Pair with accessible text — color must not be the only indicator.
 */
export function formatSignedPercent(
  value: number | null,
  fractionDigits = 1
): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  const formatted = `${(Math.abs(value) * 100).toFixed(fractionDigits)}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Ratios display as plain numbers (P/E 18.4), never with a % suffix. */
export function formatRatio(value: number | null, fractionDigits = 1): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  return value.toFixed(fractionDigits);
}

/** Non-monetary compact numbers (volume, holdings): 2.4M, 18.7K. */
export function formatCompactNumber(value: number | null): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  return compactNumber(value);
}

/** Index levels are plain numbers with thousands separators — not currency. */
export function formatIndexLevel(value: number | null): string {
  if (!isDisplayableNumber(value)) {
    return MISSING_DISPLAY;
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** ISO 8601 date → "Aug 7, 2026". Missing dates display as —. */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) {
    return MISSING_DISPLAY;
  }
  const parsed = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return MISSING_DISPLAY;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
