import { describe, expect, it } from "vitest";
import { explainMatch } from "@/lib/screener/explain";
import type { StockFilterOutcome } from "@/lib/screener/filter";
import { evaluateStrategy } from "@/lib/screener/evaluate";
import { qualityReasonablePriceV1 } from "@/lib/screener/strategies/quality-reasonable-price-v1";
import {
  findDemoStock,
  FULL_SCORE_METRICS,
  makeStock,
  ZERO_SCORE_METRICS,
  type MetricOverrides,
} from "./helpers/stock";

const strategy = qualityReasonablePriceV1;

function scoreFor(metrics: MetricOverrides) {
  return evaluateStrategy(makeStock({ metrics }), strategy);
}

function filterOutcome(
  failedFilters: string[],
  unavailableFilters: string[] = []
): StockFilterOutcome {
  return {
    passed: failedFilters.length === 0 && unavailableFilters.length === 0,
    failedFilters,
    unavailableFilters,
  };
}

describe("explainMatch positive reasons", () => {
  it("returns at most three reasons, best contribution first", () => {
    const explanation = explainMatch(scoreFor(FULL_SCORE_METRICS), null);

    expect(explanation.positiveReasons).toHaveLength(3);
    expect(explanation.positiveReasons).toEqual([
      "Strong return on equity",
      "Healthy operating margin",
      "Healthy free-cash-flow margin",
    ]);
  });

  it("orders reasons by points earned, descending", () => {
    // Only the 5-weight rules score well, so they must appear despite low weight.
    const explanation = explainMatch(
      scoreFor({
        ...ZERO_SCORE_METRICS,
        priceToBook: 1.5,
        currentRatio: 2,
        debtToEquity: 0.3,
      }),
      null
    );

    expect(explanation.positiveReasons[0]).toBe("Low debt relative to equity");
    expect(explanation.positiveReasons.slice(1)).toEqual([
      "Price-to-book is within the strategy's range",
      "Comfortable current ratio",
    ]);
  });

  it("excludes rules earning less than 80% of their weight", () => {
    // P/E 20 earns 8 of 10 (80%, included); P/E 21 earns 7.6 (excluded).
    const included = explainMatch(
      scoreFor({ ...ZERO_SCORE_METRICS, peRatio: 20 }),
      null
    );
    const excluded = explainMatch(
      scoreFor({ ...ZERO_SCORE_METRICS, peRatio: 21 }),
      null
    );

    expect(included.positiveReasons).toContain(
      "Valuation is within the strategy's P/E range"
    );
    expect(excluded.positiveReasons).toEqual([]);
  });

  it("returns no positive reasons when every metric is missing", () => {
    const explanation = explainMatch(scoreFor({}), null);

    expect(explanation.positiveReasons).toEqual([]);
  });
});

describe("explainMatch concerns", () => {
  it("returns at most three concerns from the lowest-scoring rules", () => {
    const explanation = explainMatch(scoreFor(ZERO_SCORE_METRICS), null);

    expect(explanation.concerns).toHaveLength(3);
    expect(explanation.concerns).toEqual([
      "Return on equity is below the strategy's target",
      "Operating margin is below the strategy's target",
      "Free cash flow is weak or negative",
    ]);
  });

  it("reports a missing high-weight metric as unavailable", () => {
    const explanation = explainMatch(
      scoreFor({ ...FULL_SCORE_METRICS, epsGrowth: null }),
      null
    );

    expect(explanation.concerns).toEqual(["EPS growth is unavailable"]);
  });

  it("lists several missing high-weight metrics, capped at three", () => {
    const explanation = explainMatch(
      scoreFor({
        ...FULL_SCORE_METRICS,
        epsGrowth: null,
        revenueGrowth: null,
        returnOnEquity: null,
        debtToEquity: null,
      }),
      null
    );

    expect(explanation.concerns).toHaveLength(3);
    expect(
      explanation.concerns.every((concern) => concern.endsWith("is unavailable"))
    ).toBe(true);
    expect(explanation.concerns).toContain("Return on equity is unavailable");
  });

  it("does not report a missing 5-weight metric as a concern", () => {
    const explanation = explainMatch(
      scoreFor({ ...FULL_SCORE_METRICS, priceToBook: null, currentRatio: null }),
      null
    );

    expect(explanation.concerns).toEqual([]);
  });

  it("puts a failed active filter ahead of rule-based concerns", () => {
    const explanation = explainMatch(
      scoreFor(ZERO_SCORE_METRICS),
      filterOutcome(["Maximum P/E ratio"])
    );

    expect(explanation.concerns[0]).toBe(
      "Did not meet the active filter: maximum p/e ratio"
    );
    expect(explanation.concerns).toHaveLength(3);
  });

  it("lists multiple failed filters before any rule concern", () => {
    const explanation = explainMatch(
      scoreFor(ZERO_SCORE_METRICS),
      filterOutcome([
        "Maximum P/E ratio",
        "Maximum debt-to-equity",
        "Minimum revenue growth",
      ])
    );

    expect(explanation.concerns).toEqual([
      "Did not meet the active filter: maximum p/e ratio",
      "Did not meet the active filter: maximum debt-to-equity",
      "Did not meet the active filter: minimum revenue growth",
    ]);
  });

  it("ignores an all-passing filter outcome", () => {
    const withPassing = explainMatch(
      scoreFor(ZERO_SCORE_METRICS),
      filterOutcome([])
    );
    const withoutFilters = explainMatch(scoreFor(ZERO_SCORE_METRICS), null);

    expect(withPassing.concerns).toEqual(withoutFilters.concerns);
  });

  it("returns no concerns for a stock matching every criterion", () => {
    const explanation = explainMatch(scoreFor(FULL_SCORE_METRICS), null);

    expect(explanation.concerns).toEqual([]);
  });
});

describe("explainMatch unavailable metrics", () => {
  it("lists the label of every rule without a usable value", () => {
    const explanation = explainMatch(
      scoreFor({ ...FULL_SCORE_METRICS, epsGrowth: null, priceToBook: null }),
      null
    );

    expect(explanation.unavailableMetrics).toEqual([
      "EPS growth",
      "Price-to-book",
    ]);
  });

  it("lists all eleven rule labels when nothing is available", () => {
    const explanation = explainMatch(scoreFor({}), null);

    expect(explanation.unavailableMetrics).toHaveLength(11);
    expect(explanation.unavailableMetrics).toContain("P/E ratio");
    expect(explanation.unavailableMetrics).toContain(
      "Three-year share-count CAGR"
    );
  });

  it("includes a negative P/E as an unavailable metric", () => {
    const explanation = explainMatch(
      scoreFor({ ...FULL_SCORE_METRICS, peRatio: -12 }),
      null
    );

    expect(explanation.unavailableMetrics).toEqual(["P/E ratio"]);
  });

  it("is empty when every metric is usable", () => {
    const explanation = explainMatch(scoreFor(FULL_SCORE_METRICS), null);

    expect(explanation.unavailableMetrics).toEqual([]);
  });
});

describe("explainMatch envelope", () => {
  it("carries the strategy id, version and label from the score", () => {
    const score = scoreFor(FULL_SCORE_METRICS);
    const explanation = explainMatch(score, null);

    expect(explanation.strategyId).toBe("quality-reasonable-price");
    expect(explanation.strategyVersion).toBe(1);
    expect(explanation.label).toBe("Strong Match");
  });

  it("carries a null label for insufficient data", () => {
    const explanation = explainMatch(scoreFor({ returnOnEquity: 0.2 }), null);

    expect(explanation.label).toBeNull();
  });
});

describe("explainMatch determinism", () => {
  it("returns deep-equal output for identical inputs", () => {
    const score = evaluateStrategy(
      findDemoStock("stock-us-cascade-industrial"),
      strategy
    );
    const outcome = filterOutcome(["Maximum debt-to-equity"]);

    expect(explainMatch(score, outcome)).toEqual(explainMatch(score, outcome));
  });

  it("produces the same explanation for two structurally identical stocks", () => {
    const first = explainMatch(scoreFor(ZERO_SCORE_METRICS), null);
    const second = explainMatch(scoreFor(ZERO_SCORE_METRICS), null);

    expect(first).toEqual(second);
  });

  it("explains a real demo fixture consistently", () => {
    const score = evaluateStrategy(
      findDemoStock("stock-jp-kaede-pharma"),
      strategy
    );
    const explanation = explainMatch(score, null);

    expect(explanation.concerns.length).toBeGreaterThan(0);
    expect(explanation.concerns.length).toBeLessThanOrEqual(3);
    expect(explanation.positiveReasons.length).toBeLessThanOrEqual(3);
    expect(explanation).toEqual(explainMatch(score, null));
  });
});

describe("explanation language safety", () => {
  const forbidden = [
    "buy",
    "guaranteed",
    "guarantee",
    "will rise",
    "risk-free",
    "risk free",
    "must own",
    "sure thing",
    "certain opportunity",
  ];

  const scenarios: MetricOverrides[] = [
    FULL_SCORE_METRICS,
    ZERO_SCORE_METRICS,
    {},
    { ...FULL_SCORE_METRICS, peRatio: -8, epsGrowth: null },
    { ...ZERO_SCORE_METRICS, priceToBook: 1.5, currentRatio: 2 },
    {
      returnOnEquity: -0.184,
      operatingMargin: -0.312,
      freeCashFlowMargin: -0.268,
      revenueGrowth: 0.163,
      freeCashFlowYield: -0.041,
      priceToBook: 4.86,
      debtToEquity: 0.21,
      currentRatio: 3.62,
      shareCountCagr3Y: 0.094,
    },
  ];

  it("emits no recommendation or prediction language in any template output", () => {
    const emitted: string[] = [];

    for (const metrics of scenarios) {
      const score = scoreFor(metrics);
      for (const outcome of [
        null,
        filterOutcome([
          "Maximum P/E ratio",
          "Positive free cash flow only",
          "Minimum market capitalization",
        ]),
      ]) {
        const explanation = explainMatch(score, outcome);
        emitted.push(
          ...explanation.positiveReasons,
          ...explanation.concerns,
          ...explanation.unavailableMetrics
        );
      }
    }

    expect(emitted.length).toBeGreaterThan(20);
    for (const text of emitted) {
      const lowered = text.toLowerCase();
      for (const word of forbidden) {
        expect(lowered).not.toContain(word);
      }
    }
  });

  it("emits no recommendation language for the demo fixtures either", () => {
    const ids = [
      "stock-us-northstar-software",
      "stock-us-cascade-industrial",
      "stock-us-harborlight-utilities",
      "stock-us-quantabio-therapeutics",
      "stock-us-meridian-retail",
      "stock-jp-sakura-automation",
      "stock-jp-kaede-pharma",
      "stock-jp-yamabuki-electronics",
      "stock-jp-hikari-telecom",
      "stock-jp-midori-retail",
    ];

    for (const id of ids) {
      const explanation = explainMatch(
        evaluateStrategy(findDemoStock(id), strategy),
        null
      );
      const texts = [
        ...explanation.positiveReasons,
        ...explanation.concerns,
        ...explanation.unavailableMetrics,
      ];
      for (const text of texts) {
        const lowered = text.toLowerCase();
        for (const word of forbidden) {
          expect(lowered).not.toContain(word);
        }
      }
    }
  });
});
