import { describe, expect, it } from "vitest";
import { evaluateStockFilters, type StockFilters } from "@/lib/screener/filter";
import { findDemoStock, makeStock, type MetricOverrides } from "./helpers/stock";

const MARKET_CAP_LABEL = "Minimum market capitalization";
const REVENUE_GROWTH_LABEL = "Minimum revenue growth";
const PE_LABEL = "Maximum P/E ratio";
const FCF_YIELD_LABEL = "Minimum free-cash-flow yield";
const DEBT_LABEL = "Maximum debt-to-equity";
const POSITIVE_FCF_LABEL = "Positive free cash flow only";

function evaluate(filters: StockFilters, metrics: MetricOverrides = {}) {
  return evaluateStockFilters(makeStock({ metrics }), filters);
}

describe("evaluateStockFilters with no active filters", () => {
  it("passes a stock with complete data", () => {
    const outcome = evaluate({}, { peRatio: 18, revenueGrowth: 0.1 });

    expect(outcome).toEqual({
      passed: true,
      failedFilters: [],
      unavailableFilters: [],
    });
  });

  it("passes a stock with every metric missing", () => {
    const outcome = evaluate({});

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("treats positiveFreeCashFlowOnly false as inactive", () => {
    const outcome = evaluate({ positiveFreeCashFlowOnly: false });

    expect(outcome.passed).toBe(true);
    expect(outcome.unavailableFilters).toEqual([]);
  });
});

describe("minimumMarketCap filter", () => {
  const filters: StockFilters = { minimumMarketCap: 10_000_000_000 };

  it("passes a market cap at or above the minimum", () => {
    const outcome = evaluateStockFilters(
      makeStock({ marketCap: 12_800_000_000 }),
      filters
    );

    expect(outcome.passed).toBe(true);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("passes a market cap exactly at the minimum", () => {
    const outcome = evaluateStockFilters(
      makeStock({ marketCap: 10_000_000_000 }),
      filters
    );

    expect(outcome.passed).toBe(true);
  });

  it("fails a market cap below the minimum", () => {
    const outcome = evaluateStockFilters(
      makeStock({ marketCap: 3_400_000_000 }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([MARKET_CAP_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("reports an unknown market cap as unavailable, not failed", () => {
    const outcome = evaluateStockFilters(makeStock({ marketCap: null }), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([MARKET_CAP_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("reports a missing quote as unavailable", () => {
    const outcome = evaluateStockFilters(makeStock({ hasQuote: false }), filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([MARKET_CAP_LABEL]);
  });
});

describe("minimumRevenueGrowth filter", () => {
  const filters: StockFilters = { minimumRevenueGrowth: 0.05 };

  it("passes growth above the minimum", () => {
    expect(evaluate(filters, { revenueGrowth: 0.152 }).passed).toBe(true);
  });

  it("passes growth exactly at the minimum", () => {
    expect(evaluate(filters, { revenueGrowth: 0.05 }).passed).toBe(true);
  });

  it("fails growth below the minimum", () => {
    const outcome = evaluate(filters, { revenueGrowth: 0.019 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([REVENUE_GROWTH_LABEL]);
  });

  it("fails contracting revenue", () => {
    const outcome = evaluate(filters, { revenueGrowth: -0.034 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([REVENUE_GROWTH_LABEL]);
  });

  it("reports missing growth as unavailable, not failed", () => {
    const outcome = evaluate(filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([REVENUE_GROWTH_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("accepts a negative minimum that admits mild contraction", () => {
    const outcome = evaluate({ minimumRevenueGrowth: -0.05 }, { revenueGrowth: -0.034 });

    expect(outcome.passed).toBe(true);
  });
});

describe("maximumPeRatio filter", () => {
  const filters: StockFilters = { maximumPeRatio: 20 };

  it("passes a P/E below the maximum", () => {
    expect(evaluate(filters, { peRatio: 13.6 }).passed).toBe(true);
  });

  it("passes a P/E exactly at the maximum", () => {
    expect(evaluate(filters, { peRatio: 20 }).passed).toBe(true);
  });

  it("fails a P/E above the maximum", () => {
    const outcome = evaluate(filters, { peRatio: 52.4 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([PE_LABEL]);
  });

  it("fails a negative P/E rather than treating it as cheap", () => {
    const outcome = evaluate(filters, { peRatio: -8.4 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([PE_LABEL]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("fails a zero P/E", () => {
    const outcome = evaluate(filters, { peRatio: 0 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([PE_LABEL]);
  });

  it("reports a missing P/E as unavailable, not failed", () => {
    const outcome = evaluate(filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([PE_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("minimumFreeCashFlowYield filter", () => {
  const filters: StockFilters = { minimumFreeCashFlowYield: 0.04 };

  it("passes a yield above the minimum", () => {
    expect(evaluate(filters, { freeCashFlowYield: 0.062 }).passed).toBe(true);
  });

  it("passes a yield exactly at the minimum", () => {
    expect(evaluate(filters, { freeCashFlowYield: 0.04 }).passed).toBe(true);
  });

  it("fails a yield below the minimum", () => {
    const outcome = evaluate(filters, { freeCashFlowYield: 0.019 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([FCF_YIELD_LABEL]);
  });

  it("fails a negative yield", () => {
    const outcome = evaluate(filters, { freeCashFlowYield: -0.041 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([FCF_YIELD_LABEL]);
  });

  it("reports a missing yield as unavailable, not failed", () => {
    const outcome = evaluate(filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([FCF_YIELD_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("maximumDebtToEquity filter", () => {
  const filters: StockFilters = { maximumDebtToEquity: 1 };

  it("passes leverage below the maximum", () => {
    expect(evaluate(filters, { debtToEquity: 0.34 }).passed).toBe(true);
  });

  it("passes leverage exactly at the maximum", () => {
    expect(evaluate(filters, { debtToEquity: 1 }).passed).toBe(true);
  });

  it("passes a debt-free balance sheet", () => {
    expect(evaluate(filters, { debtToEquity: 0 }).passed).toBe(true);
  });

  it("fails leverage above the maximum", () => {
    const outcome = evaluate(filters, { debtToEquity: 2.74 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([DEBT_LABEL]);
  });

  it("reports missing leverage as unavailable, not failed", () => {
    const outcome = evaluate(filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([DEBT_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });
});

describe("positiveFreeCashFlowOnly filter", () => {
  const filters: StockFilters = { positiveFreeCashFlowOnly: true };

  it("passes a positive free-cash-flow margin", () => {
    expect(evaluate(filters, { freeCashFlowMargin: 0.231 }).passed).toBe(true);
  });

  it("fails a negative free-cash-flow margin", () => {
    const outcome = evaluate(filters, { freeCashFlowMargin: -0.268 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([POSITIVE_FCF_LABEL]);
  });

  it("fails a zero free-cash-flow margin (strictly positive required)", () => {
    const outcome = evaluate(filters, { freeCashFlowMargin: 0 });

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([POSITIVE_FCF_LABEL]);
  });

  it("reports a missing free-cash-flow margin as unavailable, not failed", () => {
    const outcome = evaluate(filters);

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([POSITIVE_FCF_LABEL]);
    expect(outcome.failedFilters).toEqual([]);
  });

  it("reports the demo bank's unavailable free cash flow as unavailable", () => {
    const outcome = evaluateStockFilters(
      findDemoStock("stock-us-lakeshore-financial"),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toEqual([POSITIVE_FCF_LABEL]);
  });
});

describe("multiple active filters", () => {
  const filters: StockFilters = {
    minimumMarketCap: 10_000_000_000,
    minimumRevenueGrowth: 0.1,
    maximumPeRatio: 20,
    maximumDebtToEquity: 0.5,
  };

  it("accumulates every failure label", () => {
    const outcome = evaluateStockFilters(
      makeStock({
        marketCap: 1_000_000_000,
        metrics: { revenueGrowth: 0.01, peRatio: 52.4, debtToEquity: 2.74 },
      }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([
      MARKET_CAP_LABEL,
      REVENUE_GROWTH_LABEL,
      PE_LABEL,
      DEBT_LABEL,
    ]);
    expect(outcome.unavailableFilters).toEqual([]);
  });

  it("separates failed from unavailable when both occur", () => {
    const outcome = evaluateStockFilters(
      makeStock({
        marketCap: 20_000_000_000,
        metrics: { revenueGrowth: 0.01, debtToEquity: 0.2 },
      }),
      filters
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.failedFilters).toEqual([REVENUE_GROWTH_LABEL]);
    expect(outcome.unavailableFilters).toEqual([PE_LABEL]);
  });

  it("passes only when every active filter is satisfied", () => {
    const outcome = evaluateStockFilters(
      makeStock({
        marketCap: 20_000_000_000,
        metrics: { revenueGrowth: 0.152, peRatio: 16.9, debtToEquity: 0.42 },
      }),
      filters
    );

    expect(outcome).toEqual({
      passed: true,
      failedFilters: [],
      unavailableFilters: [],
    });
  });

  it("evaluates all six filters together on a fully populated stock", () => {
    const all: StockFilters = {
      minimumMarketCap: 1_000_000_000,
      minimumRevenueGrowth: 0,
      maximumPeRatio: 30,
      minimumFreeCashFlowYield: 0.01,
      maximumDebtToEquity: 1,
      positiveFreeCashFlowOnly: true,
    };
    const outcome = evaluateStockFilters(
      makeStock({
        marketCap: 96_400_000_000,
        metrics: {
          revenueGrowth: 0.284,
          peRatio: 22,
          freeCashFlowYield: 0.019,
          debtToEquity: 0.34,
          freeCashFlowMargin: 0.231,
        },
      }),
      all
    );

    expect(outcome.passed).toBe(true);
  });
});

describe("null never passes an active filter", () => {
  const activeFilters: ReadonlyArray<readonly [string, StockFilters]> = [
    [MARKET_CAP_LABEL, { minimumMarketCap: 0 }],
    [REVENUE_GROWTH_LABEL, { minimumRevenueGrowth: -1 }],
    [PE_LABEL, { maximumPeRatio: 10_000 }],
    [FCF_YIELD_LABEL, { minimumFreeCashFlowYield: -1 }],
    [DEBT_LABEL, { maximumDebtToEquity: 1_000 }],
    [POSITIVE_FCF_LABEL, { positiveFreeCashFlowOnly: true }],
  ];

  it.each(activeFilters)(
    "rejects an all-missing stock for %s even with the loosest bound",
    (label, filters) => {
      const outcome = evaluate(filters);

      expect(outcome.passed).toBe(false);
      expect(outcome.unavailableFilters).toEqual([label]);
      expect(outcome.failedFilters).toEqual([]);
    }
  );

  it("marks every filter unavailable when all six are active and all data is missing", () => {
    const outcome = evaluateStockFilters(makeStock({ hasQuote: false }), {
      minimumMarketCap: 0,
      minimumRevenueGrowth: -1,
      maximumPeRatio: 10_000,
      minimumFreeCashFlowYield: -1,
      maximumDebtToEquity: 1_000,
      positiveFreeCashFlowOnly: true,
    });

    expect(outcome.passed).toBe(false);
    expect(outcome.unavailableFilters).toHaveLength(6);
    expect(outcome.failedFilters).toEqual([]);
  });
});
