import { describe, expect, it } from "vitest";
import {
  clamp,
  scoreHigherIsBetter,
  scoreLowerIsBetter,
} from "@/lib/screener/score";

describe("clamp", () => {
  it("returns the value unchanged inside the range", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(7, -10, 10)).toBe(7);
  });

  it("clamps to the minimum below the range", () => {
    expect(clamp(-3, 0, 1)).toBe(0);
  });

  it("clamps to the maximum above the range", () => {
    expect(clamp(4, 0, 1)).toBe(1);
  });

  it("returns the boundary value at each boundary", () => {
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });

  it("collapses to the single value when minimum equals maximum", () => {
    expect(clamp(5, 2, 2)).toBe(2);
    expect(clamp(-5, 2, 2)).toBe(2);
  });
});

describe("scoreHigherIsBetter", () => {
  // Return-on-equity rule: 0 points at 0%, 10 points at 20%.
  const roe = (value: number) => scoreHigherIsBetter(value, 0, 0.2, 10);

  it("awards 0 points below the zero-score threshold", () => {
    expect(roe(-0.05)).toBe(0);
  });

  it("awards 0 points exactly at the zero-score threshold", () => {
    expect(roe(0)).toBe(0);
  });

  it("awards half the weight at the midpoint", () => {
    expect(roe(0.1)).toBe(5);
  });

  it("awards the full weight exactly at the full-score threshold", () => {
    expect(roe(0.2)).toBe(10);
  });

  it("clamps to the weight above the full-score threshold", () => {
    expect(roe(0.85)).toBe(10);
    expect(roe(100)).toBe(10);
  });

  it("never returns negative points for deeply negative values", () => {
    expect(roe(-5)).toBe(0);
    expect(scoreHigherIsBetter(-1_000_000, 0, 0.15, 10)).toBe(0);
  });

  it("interpolates linearly across a negative zero-score threshold", () => {
    // Revenue-growth rule: 0 points at -5%, 10 points at 20%.
    expect(scoreHigherIsBetter(0.075, -0.05, 0.2, 10)).toBeCloseTo(5, 10);
    expect(scoreHigherIsBetter(-0.05, -0.05, 0.2, 10)).toBe(0);
    expect(scoreHigherIsBetter(0.2, -0.05, 0.2, 10)).toBe(10);
  });

  it("scales with the rule weight", () => {
    // Current-ratio rule: 0 points at 0.8, 5 points at 2.0.
    expect(scoreHigherIsBetter(0.8, 0.8, 2, 5)).toBe(0);
    expect(scoreHigherIsBetter(1.4, 0.8, 2, 5)).toBeCloseTo(2.5, 10);
    expect(scoreHigherIsBetter(2, 0.8, 2, 5)).toBe(5);
  });

  it("treats equal thresholds as a step function", () => {
    expect(scoreHigherIsBetter(0.2, 0.2, 0.2, 10)).toBe(10);
    expect(scoreHigherIsBetter(0.21, 0.2, 0.2, 10)).toBe(10);
    expect(scoreHigherIsBetter(0.19, 0.2, 0.2, 10)).toBe(0);
  });
});

describe("scoreLowerIsBetter", () => {
  // P/E rule: 10 points at 15 or lower, 0 points at 40 or higher.
  const peRatio = (value: number) => scoreLowerIsBetter(value, 15, 40, 10);

  it("awards the full weight below the full-score threshold", () => {
    expect(peRatio(8)).toBe(10);
    expect(peRatio(0.5)).toBe(10);
  });

  it("awards the full weight exactly at the full-score threshold", () => {
    expect(peRatio(15)).toBe(10);
  });

  it("awards half the weight at the midpoint", () => {
    expect(peRatio(27.5)).toBe(5);
  });

  it("awards 0 points exactly at the zero-score threshold", () => {
    expect(peRatio(40)).toBe(0);
  });

  it("awards 0 points above the zero-score threshold", () => {
    expect(peRatio(120)).toBe(0);
  });

  it("interpolates precisely: P/E 20 earns 8 of 10 points", () => {
    // (40 - 20) / (40 - 15) * 10
    expect(peRatio(20)).toBe(8);
  });

  it("interpolates the price-to-book rule (5 points at 1.5, 0 at 6)", () => {
    expect(scoreLowerIsBetter(1.5, 1.5, 6, 5)).toBe(5);
    expect(scoreLowerIsBetter(3.75, 1.5, 6, 5)).toBeCloseTo(2.5, 10);
    expect(scoreLowerIsBetter(6, 1.5, 6, 5)).toBe(0);
    expect(scoreLowerIsBetter(14.2, 1.5, 6, 5)).toBe(0);
  });

  it("interpolates the debt-to-equity rule (10 points at 0.3, 0 at 2.0)", () => {
    expect(scoreLowerIsBetter(0.3, 0.3, 2, 10)).toBe(10);
    expect(scoreLowerIsBetter(1.15, 0.3, 2, 10)).toBeCloseTo(5, 10);
    expect(scoreLowerIsBetter(2, 0.3, 2, 10)).toBe(0);
    expect(scoreLowerIsBetter(2.74, 0.3, 2, 10)).toBe(0);
  });

  it("awards the full weight for values below a zero full-score threshold", () => {
    // Three-year share-count CAGR: 10 points at 0% or lower, 0 at 5%.
    expect(scoreLowerIsBetter(-0.02, 0, 0.05, 10)).toBe(10);
    expect(scoreLowerIsBetter(0, 0, 0.05, 10)).toBe(10);
    expect(scoreLowerIsBetter(0.025, 0, 0.05, 10)).toBeCloseTo(5, 10);
    expect(scoreLowerIsBetter(0.094, 0, 0.05, 10)).toBe(0);
  });

  it("treats equal thresholds as a step function", () => {
    expect(scoreLowerIsBetter(15, 15, 15, 10)).toBe(10);
    expect(scoreLowerIsBetter(14.9, 15, 15, 10)).toBe(10);
    expect(scoreLowerIsBetter(15.1, 15, 15, 10)).toBe(0);
  });
});

describe("scoring primitives are pure and bounded", () => {
  it("never returns a value outside [0, weight]", () => {
    const values = [-1000, -1, -0.05, 0, 0.07, 0.5, 15, 40, 1e9];
    for (const value of values) {
      const higher = scoreHigherIsBetter(value, 0, 0.2, 10);
      const lower = scoreLowerIsBetter(value, 15, 40, 10);
      expect(higher).toBeGreaterThanOrEqual(0);
      expect(higher).toBeLessThanOrEqual(10);
      expect(lower).toBeGreaterThanOrEqual(0);
      expect(lower).toBeLessThanOrEqual(10);
    }
  });

  it("returns identical results for repeated calls", () => {
    expect(scoreHigherIsBetter(0.123, 0, 0.2, 10)).toBe(
      scoreHigherIsBetter(0.123, 0, 0.2, 10)
    );
    expect(scoreLowerIsBetter(23.4, 15, 40, 10)).toBe(
      scoreLowerIsBetter(23.4, 15, 40, 10)
    );
  });
});
