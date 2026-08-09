import { describe, expect, it } from "vitest";
import {
  MISSING_DISPLAY,
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatIndexLevel,
  formatPercent,
  formatRatio,
  formatSignedPercent,
} from "@/lib/format";

/** U+2212 MINUS SIGN — the true minus used for negative changes. */
const TRUE_MINUS = "−";

describe("MISSING_DISPLAY", () => {
  it("is the em dash used everywhere for missing data", () => {
    expect(MISSING_DISPLAY).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formats USD prices with two decimal places and thousands separators", () => {
    expect(formatCurrency(1234.56, "USD")).toBe("$1,234.56");
  });

  it("formats JPY prices with no decimal places, rounding to the nearest yen", () => {
    expect(formatCurrency(1234.56, "JPY")).toBe("¥1,235");
  });

  it("keeps small USD values at two decimals", () => {
    expect(formatCurrency(0.5, "USD")).toBe("$0.50");
  });

  it("formats negative values without dropping the currency symbol", () => {
    expect(formatCurrency(-12.5, "USD")).toBe("-$12.50");
  });

  it("displays missing values as — for both currencies, never as $0 or ¥0", () => {
    expect(formatCurrency(null, "USD")).toBe(MISSING_DISPLAY);
    expect(formatCurrency(null, "JPY")).toBe(MISSING_DISPLAY);
  });

  it("displays non-finite values as —", () => {
    expect(formatCurrency(Number.NaN, "USD")).toBe(MISSING_DISPLAY);
    expect(formatCurrency(Number.POSITIVE_INFINITY, "JPY")).toBe(MISSING_DISPLAY);
  });

  it("formats a genuine zero as zero, not as missing", () => {
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });
});

describe("formatCompactCurrency", () => {
  it("formats USD billions with two decimals", () => {
    expect(formatCompactCurrency(1_250_000_000, "USD")).toBe("$1.25B");
  });

  it("formats JPY trillions with two decimals", () => {
    expect(formatCompactCurrency(1_250_000_000_000, "JPY")).toBe("¥1.25T");
  });

  it("drops decimals once the scaled value reaches 100", () => {
    expect(formatCompactCurrency(820_400_000, "USD")).toBe("$820M");
  });

  it("uses one decimal for scaled values between 10 and 100", () => {
    expect(formatCompactCurrency(42_500_000_000, "USD")).toBe("$42.5B");
  });

  it("uses thousands for values in the K tier", () => {
    expect(formatCompactCurrency(12_400, "USD")).toBe("$12.4K");
  });

  it("displays missing market capitalization as —, never as $0", () => {
    expect(formatCompactCurrency(null, "USD")).toBe(MISSING_DISPLAY);
    expect(formatCompactCurrency(null, "JPY")).toBe(MISSING_DISPLAY);
  });

  it("displays non-finite values as —", () => {
    expect(formatCompactCurrency(Number.NaN, "USD")).toBe(MISSING_DISPLAY);
    expect(formatCompactCurrency(Number.NEGATIVE_INFINITY, "USD")).toBe(
      MISSING_DISPLAY
    );
  });
});

describe("formatCompactNumber", () => {
  it("formats non-monetary counts without a currency symbol", () => {
    expect(formatCompactNumber(2_400_000)).toBe("2.4M");
    expect(formatCompactNumber(18_700)).toBe("18.7K");
  });

  it("displays a missing count as —", () => {
    expect(formatCompactNumber(null)).toBe(MISSING_DISPLAY);
  });
});

describe("formatPercent", () => {
  it("treats stored decimals as percentages, multiplying by 100 exactly once", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
  });

  it("formats a negative percentage", () => {
    expect(formatPercent(-0.045)).toBe("-4.5%");
  });

  it("formats a genuine zero as 0.0%", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("displays missing data as —, never as 0.0%", () => {
    expect(formatPercent(null)).toBe(MISSING_DISPLAY);
  });

  it("displays NaN as —", () => {
    expect(formatPercent(Number.NaN)).toBe(MISSING_DISPLAY);
  });

  it("displays Infinity as —", () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(MISSING_DISPLAY);
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe(MISSING_DISPLAY);
  });

  it("honours a custom fraction-digit count", () => {
    expect(formatPercent(0.12345, 2)).toBe("12.35%");
    expect(formatPercent(0.12345, 0)).toBe("12%");
  });
});

describe("formatSignedPercent", () => {
  it("prefixes gains with a plus sign", () => {
    expect(formatSignedPercent(0.014)).toBe("+1.4%");
  });

  it("prefixes losses with a true minus sign (U+2212), not a hyphen", () => {
    const formatted = formatSignedPercent(-0.021);

    expect(formatted).toBe(`${TRUE_MINUS}2.1%`);
    expect(formatted.startsWith("−")).toBe(true);
    expect(formatted.includes("-")).toBe(false);
  });

  it("formats zero without a sign", () => {
    expect(formatSignedPercent(0)).toBe("0.0%");
  });

  it("displays missing data as —", () => {
    expect(formatSignedPercent(null)).toBe(MISSING_DISPLAY);
  });

  it("displays non-finite values as —", () => {
    expect(formatSignedPercent(Number.NaN)).toBe(MISSING_DISPLAY);
    expect(formatSignedPercent(Number.POSITIVE_INFINITY)).toBe(MISSING_DISPLAY);
  });
});

describe("formatRatio", () => {
  it("formats a P/E ratio as a plain number with one decimal and no percent sign", () => {
    const formatted = formatRatio(18.42);

    expect(formatted).toBe("18.4");
    expect(formatted.includes("%")).toBe(false);
  });

  it("formats a negative ratio", () => {
    expect(formatRatio(-1.25)).toBe("-1.3");
  });

  it("displays a missing ratio as —, never as 0", () => {
    expect(formatRatio(null)).toBe(MISSING_DISPLAY);
  });

  it("displays non-finite ratios as —", () => {
    expect(formatRatio(Number.NaN)).toBe(MISSING_DISPLAY);
    expect(formatRatio(Number.POSITIVE_INFINITY)).toBe(MISSING_DISPLAY);
  });
});

describe("formatIndexLevel", () => {
  it("formats an index level as a plain separated number, not currency", () => {
    const formatted = formatIndexLevel(4832.19);

    expect(formatted).toBe("4,832.19");
    expect(formatted.includes("$")).toBe(false);
    expect(formatted.includes("¥")).toBe(false);
  });

  it("always shows two decimal places", () => {
    expect(formatIndexLevel(28000)).toBe("28,000.00");
  });

  it("displays a missing level as —", () => {
    expect(formatIndexLevel(null)).toBe(MISSING_DISPLAY);
  });

  it("displays non-finite levels as —", () => {
    expect(formatIndexLevel(Number.NaN)).toBe(MISSING_DISPLAY);
    expect(formatIndexLevel(Number.POSITIVE_INFINITY)).toBe(MISSING_DISPLAY);
  });
});

describe("formatDate", () => {
  it("formats an ISO date as a short month, day and year in UTC", () => {
    expect(formatDate("2026-08-07")).toBe("Aug 7, 2026");
  });

  it("formats a full ISO timestamp using its date portion", () => {
    expect(formatDate("2026-08-07T20:00:00.000Z")).toBe("Aug 7, 2026");
  });

  it("displays a missing date as —", () => {
    expect(formatDate(null)).toBe(MISSING_DISPLAY);
  });

  it("displays an empty string as —", () => {
    expect(formatDate("")).toBe(MISSING_DISPLAY);
  });

  it("displays an unparseable date string as —", () => {
    expect(formatDate("not-a-date")).toBe(MISSING_DISPLAY);
    expect(formatDate("2026-13-45")).toBe(MISSING_DISPLAY);
  });
});
