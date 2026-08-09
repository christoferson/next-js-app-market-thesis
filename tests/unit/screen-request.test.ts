import { describe, expect, it } from "vitest";
import { parseScreenRequest } from "@/lib/validation/screen-request";

const MINIMAL = {
  assetType: "stock",
  strategyId: "quality-reasonable-price-v1",
} as const;

function parse(body: unknown) {
  return parseScreenRequest(body);
}

describe("parseScreenRequest defaults", () => {
  it("accepts the minimal valid body and applies every default", () => {
    const result = parse({ ...MINIMAL });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toEqual({
      assetType: "stock",
      strategyId: "quality-reasonable-price-v1",
      filters: {},
      sort: { field: "strategyScore", direction: "desc" },
      page: 1,
      pageSize: 25,
    });
  });

  it("leaves market and query undefined when omitted", () => {
    const result = parse({ ...MINIMAL });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.market).toBeUndefined();
    expect(result.request.query).toBeUndefined();
  });

  it("defaults only the missing parts of a partially supplied body", () => {
    const result = parse({ ...MINIMAL, page: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.page).toBe(3);
    expect(result.request.pageSize).toBe(25);
    expect(result.request.sort).toEqual({
      field: "strategyScore",
      direction: "desc",
    });
  });
});

describe("parseScreenRequest valid input", () => {
  it("round-trips a full request", () => {
    const body = {
      assetType: "stock",
      market: "JP",
      query: "sakura",
      strategyId: "quality-reasonable-price-v1",
      filters: {
        minimumMarketCap: 1_000_000_000,
        minimumRevenueGrowth: 0.05,
        maximumPeRatio: 25,
        minimumFreeCashFlowYield: 0.03,
        maximumDebtToEquity: 1.5,
        positiveFreeCashFlowOnly: true,
      },
      sort: { field: "marketCap", direction: "asc" },
      page: 2,
      pageSize: 50,
    };
    const result = parse(body);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toEqual(body);
  });

  it("accepts both markets", () => {
    for (const market of ["US", "JP"]) {
      const result = parse({ ...MINIMAL, market });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.request.market).toBe(market);
    }
  });

  it("trims a query string", () => {
    const result = parse({ ...MINIMAL, query: "  northstar  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.query).toBe("northstar");
  });

  it("preserves a Japanese native-name query", () => {
    const result = parse({ ...MINIMAL, query: "サクラ" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.query).toBe("サクラ");
  });

  it("accepts both sort fields with both directions", () => {
    for (const field of ["strategyScore", "marketCap"]) {
      for (const direction of ["asc", "desc"]) {
        const result = parse({ ...MINIMAL, sort: { field, direction } });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.request.sort).toEqual({ field, direction });
      }
    }
  });

  it("accepts boundary pagination values", () => {
    for (const pageSize of [1, 100]) {
      const result = parse({ ...MINIMAL, pageSize });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.request.pageSize).toBe(pageSize);
    }
  });

  it("accepts a zero minimum market cap and a zero revenue-growth floor", () => {
    const result = parse({
      ...MINIMAL,
      filters: { minimumMarketCap: 0, minimumRevenueGrowth: 0 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.filters.minimumMarketCap).toBe(0);
    expect(result.request.filters.minimumRevenueGrowth).toBe(0);
  });

  it("accepts a negative free-cash-flow yield floor", () => {
    const result = parse({
      ...MINIMAL,
      filters: { minimumFreeCashFlowYield: -0.05 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.filters.minimumFreeCashFlowYield).toBe(-0.05);
  });
});

describe("parseScreenRequest strictness", () => {
  it("rejects an unknown filter key", () => {
    const result = parse({
      ...MINIMAL,
      filters: { minimumDividendYield: 0.02 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.details).length).toBeGreaterThan(0);
  });

  it("rejects an unknown top-level key", () => {
    const result = parse({ ...MINIMAL, includeIneligible: true });

    expect(result.ok).toBe(false);
  });

  it("rejects an attempt to inject a score", () => {
    const result = parse({ ...MINIMAL, score: 100 });

    expect(result.ok).toBe(false);
  });

  it("rejects an attempt to inject a total or label", () => {
    expect(parse({ ...MINIMAL, total: 100 }).ok).toBe(false);
    expect(parse({ ...MINIMAL, label: "Strong Match" }).ok).toBe(false);
    expect(parse({ ...MINIMAL, availableWeight: 100 }).ok).toBe(false);
  });

  it("rejects an unknown key inside sort", () => {
    const result = parse({
      ...MINIMAL,
      sort: { field: "marketCap", direction: "asc", nulls: "first" },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects an ETF or index asset type", () => {
    expect(parse({ ...MINIMAL, assetType: "etf" }).ok).toBe(false);
    expect(parse({ ...MINIMAL, assetType: "index" }).ok).toBe(false);
  });

  it("rejects an unknown strategy id", () => {
    for (const strategyId of [
      "momentum-v1",
      "quality-reasonable-price",
      "quality-reasonable-price-v2",
      "",
    ]) {
      expect(parse({ ...MINIMAL, strategyId }).ok).toBe(false);
    }
  });

  it("rejects a missing assetType or strategyId", () => {
    expect(parse({ strategyId: "quality-reasonable-price-v1" }).ok).toBe(false);
    expect(parse({ assetType: "stock" }).ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    for (const body of [null, undefined, 42, "stock", []]) {
      expect(parse(body).ok).toBe(false);
    }
  });
});

describe("parseScreenRequest sort validation", () => {
  it("rejects an unsupported sort field", () => {
    for (const field of ["peRatio", "name", "dividendYield", "score"]) {
      const result = parse({ ...MINIMAL, sort: { field, direction: "desc" } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.details["sort.field"]).toBeDefined();
    }
  });

  it("rejects an unsupported sort direction", () => {
    const result = parse({
      ...MINIMAL,
      sort: { field: "marketCap", direction: "down" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details["sort.direction"]).toBeDefined();
  });

  it("rejects a sort object missing a required member", () => {
    expect(parse({ ...MINIMAL, sort: { field: "marketCap" } }).ok).toBe(false);
    expect(parse({ ...MINIMAL, sort: { direction: "asc" } }).ok).toBe(false);
  });
});

describe("parseScreenRequest filter validation", () => {
  it("rejects a negative minimumMarketCap", () => {
    const result = parse({ ...MINIMAL, filters: { minimumMarketCap: -1 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details["filters.minimumMarketCap"]).toBeDefined();
  });

  it("rejects a maximumPeRatio of 0", () => {
    const result = parse({ ...MINIMAL, filters: { maximumPeRatio: 0 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details["filters.maximumPeRatio"]).toBeDefined();
  });

  it("rejects a negative maximumPeRatio", () => {
    expect(parse({ ...MINIMAL, filters: { maximumPeRatio: -20 } }).ok).toBe(false);
  });

  it("rejects a minimumRevenueGrowth of -2 (below -100%)", () => {
    const result = parse({ ...MINIMAL, filters: { minimumRevenueGrowth: -2 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details["filters.minimumRevenueGrowth"]).toBeDefined();
  });

  it("rejects a minimumFreeCashFlowYield outside [-1, 1]", () => {
    expect(
      parse({ ...MINIMAL, filters: { minimumFreeCashFlowYield: 1.5 } }).ok
    ).toBe(false);
    expect(
      parse({ ...MINIMAL, filters: { minimumFreeCashFlowYield: -1.5 } }).ok
    ).toBe(false);
  });

  it("rejects a negative maximumDebtToEquity", () => {
    expect(parse({ ...MINIMAL, filters: { maximumDebtToEquity: -0.5 } }).ok).toBe(
      false
    );
  });

  it("rejects a non-boolean positiveFreeCashFlowOnly", () => {
    expect(
      parse({ ...MINIMAL, filters: { positiveFreeCashFlowOnly: "true" } }).ok
    ).toBe(false);
    expect(
      parse({ ...MINIMAL, filters: { positiveFreeCashFlowOnly: 1 } }).ok
    ).toBe(false);
  });

  it("rejects a numeric string in place of a number", () => {
    expect(parse({ ...MINIMAL, filters: { maximumPeRatio: "25" } }).ok).toBe(false);
  });

  it("rejects a null filter value rather than treating it as absent", () => {
    expect(parse({ ...MINIMAL, filters: { maximumPeRatio: null } }).ok).toBe(false);
  });

  it("rejects NaN and Infinity filter values", () => {
    expect(parse({ ...MINIMAL, filters: { maximumPeRatio: Number.NaN } }).ok).toBe(
      false
    );
    expect(
      parse({ ...MINIMAL, filters: { minimumMarketCap: Number.POSITIVE_INFINITY } })
        .ok
    ).toBe(false);
  });
});

describe("parseScreenRequest pagination validation", () => {
  it("rejects pageSize 101 rather than clamping it", () => {
    const result = parse({ ...MINIMAL, pageSize: 101 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.pageSize).toBeDefined();
  });

  it("rejects page 0 and negative pages", () => {
    for (const page of [0, -1]) {
      const result = parse({ ...MINIMAL, page });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.details.page).toBeDefined();
    }
  });

  it("rejects non-integer pagination values", () => {
    expect(parse({ ...MINIMAL, page: 1.5 }).ok).toBe(false);
    expect(parse({ ...MINIMAL, pageSize: 25.5 }).ok).toBe(false);
  });

  it("rejects a pageSize of 0", () => {
    expect(parse({ ...MINIMAL, pageSize: 0 }).ok).toBe(false);
  });
});

describe("parseScreenRequest failure shape", () => {
  it("returns a readable message and per-field details", () => {
    const result = parse({ ...MINIMAL, page: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("The screen request is invalid.");
    const pageIssues = result.details.page;
    expect(pageIssues).toBeInstanceOf(Array);
    expect(pageIssues?.length).toBeGreaterThan(0);
    expect(typeof pageIssues?.[0]).toBe("string");
  });

  it("reports every invalid field in one failure result", () => {
    const result = parse({
      assetType: "etf",
      strategyId: "momentum-v1",
      page: 0,
      pageSize: 500,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.details).sort()).toEqual([
      "assetType",
      "page",
      "pageSize",
      "strategyId",
    ]);
  });

  it("does not expose a request object on failure", () => {
    const result = parse({ ...MINIMAL, assetType: "index" });

    expect(result.ok).toBe(false);
    expect("request" in result).toBe(false);
  });

  it("rejects a 101-character query rather than truncating it", () => {
    const result = parse({ ...MINIMAL, query: "a".repeat(101) });

    expect(result.ok).toBe(false);
  });

  it("accepts a query of exactly 100 characters", () => {
    const result = parse({ ...MINIMAL, query: "a".repeat(100) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.query).toBe("a".repeat(100));
  });
});
