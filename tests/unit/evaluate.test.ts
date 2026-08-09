import { describe, expect, it } from "vitest";
import {
  evaluateStrategy,
  isEligibleForStrategy,
  matchLabelForScore,
  FINANCIAL_EXCLUSION_EXPLANATION,
} from "@/lib/screener/evaluate";
import { getStrategy, versionedStrategyId } from "@/lib/screener/strategies/registry";
import { qualityReasonablePriceV1 } from "@/lib/screener/strategies/quality-reasonable-price-v1";
import type { MatchLabel } from "@/lib/screener/types";
import {
  categoryById,
  findDemoStock,
  FULL_SCORE_METRICS,
  makeStock,
  ruleById,
  ZERO_SCORE_METRICS,
  type MetricOverrides,
} from "./helpers/stock";

const strategy = qualityReasonablePriceV1;

function evaluateWith(metrics: MetricOverrides) {
  return evaluateStrategy(makeStock({ metrics }), strategy);
}

describe("strategy registry", () => {
  it("resolves the versioned strategy id", () => {
    expect(versionedStrategyId(strategy)).toBe("quality-reasonable-price-v1");
    expect(getStrategy("quality-reasonable-price-v1")).toBe(strategy);
  });

  it("returns null for an unknown strategy id", () => {
    expect(getStrategy("momentum-v1")).toBeNull();
    expect(getStrategy("quality-reasonable-price")).toBeNull();
    expect(getStrategy("quality-reasonable-price-v2")).toBeNull();
  });
});

describe("strategy definition structure", () => {
  it("defines exactly five categories with the SPEC §11.3 ids", () => {
    expect(strategy.categories.map((c) => c.id)).toEqual([
      "quality",
      "growth",
      "valuation",
      "financial-health",
      "shareholder-alignment",
    ]);
  });

  it("defines the SPEC §11.3 maximum points per category", () => {
    expect(strategy.categories.map((c) => c.maximumPoints)).toEqual([
      30, 20, 25, 15, 10,
    ]);
  });

  it("sums category maximum points to 100", () => {
    const total = strategy.categories.reduce((s, c) => s + c.maximumPoints, 0);
    expect(total).toBe(100);
  });

  it("sums rule weights to 100 and to each category maximum", () => {
    let overall = 0;
    for (const category of strategy.categories) {
      const categoryWeight = category.rules.reduce((s, r) => s + r.weight, 0);
      expect(categoryWeight).toBe(category.maximumPoints);
      overall += categoryWeight;
    }
    expect(overall).toBe(100);
  });

  it("marks every rule's missing behaviour as unavailable", () => {
    const rules = strategy.categories.flatMap((c) => c.rules);
    expect(rules).toHaveLength(11);
    expect(rules.every((r) => r.missingBehavior === "unavailable")).toBe(true);
  });

  it("requires at least 70 available weight to produce a score", () => {
    expect(strategy.minimumAvailableWeight).toBe(70);
  });
});

describe("evaluateStrategy with complete data", () => {
  it("awards 100 of 100 when every metric is at its full-score threshold", () => {
    const score = evaluateWith(FULL_SCORE_METRICS);

    expect(score.availableWeight).toBe(100);
    expect(score.earnedPoints).toBeCloseTo(100, 10);
    expect(score.total).toBeCloseTo(100, 10);
    expect(score.scoreStatus).toBe("scored");
    expect(score.label).toBe("Strong Match");
  });

  it("clamps to 100 when metrics are beyond their full-score thresholds", () => {
    const score = evaluateWith({
      returnOnEquity: 0.9,
      operatingMargin: 0.8,
      freeCashFlowMargin: 0.6,
      revenueGrowth: 1.4,
      epsGrowth: 2.2,
      peRatio: 4,
      freeCashFlowYield: 0.3,
      priceToBook: 0.4,
      debtToEquity: 0,
      currentRatio: 8,
      shareCountCagr3Y: -0.15,
    });

    expect(score.availableWeight).toBe(100);
    expect(score.total).toBeCloseTo(100, 10);
    expect(score.label).toBe("Strong Match");
  });

  it("awards 0 of 100 when every metric is at its zero-score threshold", () => {
    const score = evaluateWith(ZERO_SCORE_METRICS);

    expect(score.availableWeight).toBe(100);
    expect(score.earnedPoints).toBe(0);
    expect(score.total).toBe(0);
    expect(score.scoreStatus).toBe("scored");
    expect(score.label).toBe("Low Match");
  });

  it("reports each category's earned points and available weight", () => {
    const score = evaluateWith(FULL_SCORE_METRICS);

    expect(categoryById(score, "quality").earnedPoints).toBeCloseTo(30, 10);
    expect(categoryById(score, "growth").earnedPoints).toBeCloseTo(20, 10);
    expect(categoryById(score, "valuation").earnedPoints).toBeCloseTo(25, 10);
    expect(categoryById(score, "financial-health").earnedPoints).toBeCloseTo(15, 10);
    expect(
      categoryById(score, "shareholder-alignment").earnedPoints
    ).toBeCloseTo(10, 10);
    expect(categoryById(score, "valuation").availableWeight).toBe(25);
  });

  it("stamps the strategy id and version onto the score", () => {
    const score = evaluateWith(FULL_SCORE_METRICS);

    expect(score.strategyId).toBe("quality-reasonable-price");
    expect(score.strategyVersion).toBe(1);
  });
});

describe("evaluateStrategy missing-data normalization", () => {
  it("removes a missing 10-weight metric from the available weight", () => {
    const metrics: MetricOverrides = { ...FULL_SCORE_METRICS, epsGrowth: null };
    const score = evaluateStrategy(makeStock({ metrics }), strategy);

    expect(score.availableWeight).toBe(90);
    expect(score.earnedPoints).toBeCloseTo(90, 10);
    expect(score.total).toBeCloseTo(100, 10);
  });

  it("reports a missing metric as null points with an unavailable reason", () => {
    const score = evaluateStrategy(
      makeStock({ metrics: { ...FULL_SCORE_METRICS, epsGrowth: null } }),
      strategy
    );
    const rule = ruleById(score, "eps-growth");

    expect(rule.points).toBeNull();
    expect(rule.value).toBeNull();
    expect(rule.unavailableReason).toBe("test");
  });

  it("normalizes earned points over available weight, not over 100", () => {
    // EPS growth missing (-10 weight) and P/E at the midpoint (5 of 10).
    const score = evaluateStrategy(
      makeStock({ metrics: { ...FULL_SCORE_METRICS, epsGrowth: null, peRatio: 27.5 } }),
      strategy
    );

    expect(score.availableWeight).toBe(90);
    expect(score.earnedPoints).toBeCloseTo(85, 10);
    expect(score.total).toBeCloseTo((85 / 90) * 100, 10);
    expect(score.total).toBeCloseTo(94.4444444, 6);
    expect(score.label).toBe("Strong Match");
  });

  it("never awards points for an unavailable metric", () => {
    const score = evaluateWith({});
    const rules = score.categories.flatMap((c) => c.rules);

    expect(rules.every((r) => r.points === null)).toBe(true);
    expect(score.earnedPoints).toBe(0);
    expect(score.availableWeight).toBe(0);
  });

  it("returns insufficient-data when available weight falls below 70", () => {
    // Quality (30) and revenue growth (10) missing → 60 available.
    const score = evaluateWith({
      epsGrowth: 0.25,
      peRatio: 15,
      freeCashFlowYield: 0.07,
      priceToBook: 1.5,
      debtToEquity: 0.3,
      currentRatio: 2,
      shareCountCagr3Y: 0,
    });

    expect(score.availableWeight).toBe(60);
    expect(score.total).toBeNull();
    expect(score.scoreStatus).toBe("insufficient-data");
    expect(score.label).toBeNull();
    expect(score.earnedPoints).toBeCloseTo(60, 10);
  });

  it("scores at exactly 70 available weight (inclusive comparison)", () => {
    const score = evaluateWith({
      returnOnEquity: 0.2,
      epsGrowth: 0.25,
      peRatio: 15,
      freeCashFlowYield: 0.07,
      priceToBook: 1.5,
      debtToEquity: 0.3,
      currentRatio: 2,
      shareCountCagr3Y: 0,
    });

    expect(score.availableWeight).toBe(70);
    expect(score.scoreStatus).toBe("scored");
    expect(score.total).toBeCloseTo(100, 10);
  });

  it("is insufficient-data with a fully missing stock", () => {
    const score = evaluateWith({});

    expect(score.total).toBeNull();
    expect(score.scoreStatus).toBe("insufficient-data");
    expect(score.label).toBeNull();
  });
});

describe("evaluateStrategy negative P/E handling", () => {
  it("treats a negative P/E as unavailable rather than scoring it", () => {
    const score = evaluateStrategy(
      makeStock({ metrics: { ...FULL_SCORE_METRICS, peRatio: -5 } }),
      strategy
    );
    const rule = ruleById(score, "pe-ratio");

    expect(rule.points).toBeNull();
    expect(rule.value).toBeNull();
    expect(rule.unavailableReason).toBe(
      "Negative P/E is treated as unavailable for scoring."
    );
  });

  it("excludes the negative-P/E rule weight from the available weight", () => {
    const score = evaluateStrategy(
      makeStock({ metrics: { ...FULL_SCORE_METRICS, peRatio: -5 } }),
      strategy
    );

    expect(score.availableWeight).toBe(90);
    expect(categoryById(score, "valuation").availableWeight).toBe(15);
    expect(score.earnedPoints).toBeCloseTo(90, 10);
  });

  it("treats a zero P/E as unavailable too", () => {
    const score = evaluateStrategy(
      makeStock({ metrics: { ...FULL_SCORE_METRICS, peRatio: 0 } }),
      strategy
    );

    expect(ruleById(score, "pe-ratio").points).toBeNull();
    expect(score.availableWeight).toBe(90);
  });

  it("does not treat a negative free-cash-flow yield as unavailable", () => {
    const score = evaluateStrategy(
      makeStock({ metrics: { ...FULL_SCORE_METRICS, freeCashFlowYield: -0.041 } }),
      strategy
    );
    const rule = ruleById(score, "free-cash-flow-yield");

    expect(rule.value).toBe(-0.041);
    expect(rule.points).toBe(0);
    expect(score.availableWeight).toBe(100);
  });
});

describe("evaluateStrategy per-rule points", () => {
  it("awards the share-count rule exactly its weight when share count declines", () => {
    const score = evaluateWith({ ...FULL_SCORE_METRICS, shareCountCagr3Y: -0.02 });
    const rule = ruleById(score, "share-count-cagr-3y");

    expect(rule.points).toBe(10);
    expect(rule.points).toBeLessThanOrEqual(rule.weight);
    expect(rule.value).toBe(-0.02);
  });

  it("never awards a rule more than its weight for any metric value", () => {
    const score = evaluateWith({
      returnOnEquity: 5,
      operatingMargin: 5,
      freeCashFlowMargin: 5,
      revenueGrowth: 5,
      epsGrowth: 5,
      peRatio: 0.01,
      freeCashFlowYield: 5,
      priceToBook: 0.01,
      debtToEquity: 0,
      currentRatio: 500,
      shareCountCagr3Y: -5,
    });

    for (const rule of score.categories.flatMap((c) => c.rules)) {
      expect(rule.points).not.toBeNull();
      expect(rule.points ?? 0).toBeLessThanOrEqual(rule.weight);
      expect(rule.points ?? -1).toBeGreaterThanOrEqual(0);
    }
  });

  it("interpolates the P/E rule to 8 points at a P/E of 20", () => {
    const score = evaluateWith({ ...FULL_SCORE_METRICS, peRatio: 20 });

    expect(ruleById(score, "pe-ratio").points).toBe(8);
  });
});

describe("matchLabelForScore bands", () => {
  const cases: ReadonlyArray<readonly [number, MatchLabel]> = [
    [100, "Strong Match"],
    [80, "Strong Match"],
    [79.99, "Match"],
    [65, "Match"],
    [64.9, "Partial Match"],
    [50, "Partial Match"],
    [49.9, "Low Match"],
    [0, "Low Match"],
  ];

  it.each(cases)("labels %s as %s", (total, label) => {
    expect(matchLabelForScore(total)).toBe(label);
  });

  it("returns null for a null total", () => {
    expect(matchLabelForScore(null)).toBeNull();
  });
});

describe("isEligibleForStrategy", () => {
  it("excludes the Financials sector", () => {
    expect(isEligibleForStrategy(makeStock({ sector: "Financials" }), strategy)).toBe(
      false
    );
  });

  it("excludes the Real Estate sector", () => {
    expect(isEligibleForStrategy(makeStock({ sector: "Real Estate" }), strategy)).toBe(
      false
    );
  });

  it("includes an ordinary operating sector", () => {
    expect(isEligibleForStrategy(makeStock({ sector: "Industrials" }), strategy)).toBe(
      true
    );
    expect(
      isEligibleForStrategy(makeStock({ sector: "Information Technology" }), strategy)
    ).toBe(true);
  });

  it("excludes inactive listings regardless of sector", () => {
    expect(
      isEligibleForStrategy(
        makeStock({ sector: "Industrials", isActive: false }),
        strategy
      )
    ).toBe(false);
  });

  it("treats an unknown sector as eligible", () => {
    expect(isEligibleForStrategy(makeStock({ sector: undefined }), strategy)).toBe(
      true
    );
  });

  it("excludes both demo bank fixtures", () => {
    for (const id of [
      "stock-us-lakeshore-financial",
      "stock-jp-tsuru-financial-group",
    ]) {
      expect(isEligibleForStrategy(findDemoStock(id), strategy)).toBe(false);
    }
  });

  it("explains the financial exclusion without recommendation language", () => {
    expect(FINANCIAL_EXCLUSION_EXPLANATION).toContain("different scoring models");
    expect(FINANCIAL_EXCLUSION_EXPLANATION.toLowerCase()).not.toContain("buy");
  });
});

describe("evaluateStrategy against demo fixtures", () => {
  it("is deterministic for Northstar Software across repeated calls", () => {
    const snapshot = findDemoStock("stock-us-northstar-software");
    const first = evaluateStrategy(snapshot, strategy);
    const second = evaluateStrategy(snapshot, strategy);

    expect(first).toEqual(second);
    expect(first.total).toBe(second.total);
  });

  it("scores Northstar Software from complete data", () => {
    const score = evaluateStrategy(
      findDemoStock("stock-us-northstar-software"),
      strategy
    );

    expect(score.availableWeight).toBe(100);
    expect(score.scoreStatus).toBe("scored");
    // Rich valuation costs the P/E and price-to-book rules all their points.
    expect(ruleById(score, "pe-ratio").points).toBe(0);
    expect(ruleById(score, "price-to-book").points).toBe(0);
    expect(ruleById(score, "return-on-equity").points).toBe(10);
    expect(score.total).toBeCloseTo(72.629, 3);
    expect(score.label).toBe("Match");
  });

  it("scores QuantaBio with reduced available weight for its missing metrics", () => {
    const score = evaluateStrategy(
      findDemoStock("stock-us-quantabio-therapeutics"),
      strategy
    );

    expect(score.availableWeight).toBeLessThan(100);
    expect(score.availableWeight).toBe(80);
    expect(ruleById(score, "pe-ratio").points).toBeNull();
    expect(ruleById(score, "eps-growth").points).toBeNull();
    expect(ruleById(score, "pe-ratio").unavailableReason).toContain(
      "Negative trailing twelve-month earnings"
    );
    expect(score.scoreStatus).toBe("scored");
    expect(score.total).toBeCloseTo(30.983, 3);
    expect(score.label).toBe("Low Match");
  });

  it("keeps Meridian Retail's missing buyback metric out of the score", () => {
    const score = evaluateStrategy(findDemoStock("stock-us-meridian-retail"), strategy);
    const rule = ruleById(score, "share-count-cagr-3y");

    expect(rule.points).toBeNull();
    expect(score.availableWeight).toBe(90);
    expect(rule.unavailableReason).toContain("Share count history incomplete");
  });

  it("produces a finite total or null for every demo stock", () => {
    for (const id of [
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
    ]) {
      const score = evaluateStrategy(findDemoStock(id), strategy);
      if (score.total === null) {
        expect(score.scoreStatus).toBe("insufficient-data");
      } else {
        expect(Number.isFinite(score.total)).toBe(true);
        expect(score.total).toBeGreaterThanOrEqual(0);
        expect(score.total).toBeLessThanOrEqual(100);
      }
    }
  });
});
