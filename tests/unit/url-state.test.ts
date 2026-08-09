import { describe, expect, it } from "vitest";
import {
  changeAssetType,
  DEFAULT_DISCOVERY_STATE,
  discoveryStatesEqual,
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
  type DiscoveryUrlState,
} from "@/lib/discovery/url-state";

function parse(search: string): DiscoveryUrlState {
  return parseDiscoveryUrlState(new URLSearchParams(search));
}

describe("parseDiscoveryUrlState defaults", () => {
  it("returns the default state for empty params", () => {
    const state = parse("");

    expect(state).toEqual(DEFAULT_DISCOVERY_STATE);
    expect(state.assetType).toBe("stock");
    expect(state.market).toBeUndefined();
    expect(state.query).toBe("");
    expect(state.page).toBe(1);
  });

  it("keeps defaults for the params that are absent", () => {
    const state = parse("market=JP");

    expect(state.assetType).toBe("stock");
    expect(state.market).toBe("JP");
    expect(state.query).toBe("");
    expect(state.page).toBe(1);
  });
});

describe("parseDiscoveryUrlState valid values", () => {
  it("reads asset, market, q and page together", () => {
    const state = parse("asset=etf&market=JP&q=sakura&page=3");

    expect(state).toEqual({
      assetType: "etf",
      market: "JP",
      query: "sakura",
      page: 3,
      etfFilters: {},
      indexSort: null,
    });
  });

  it.each(["stock", "etf", "index"])("accepts asset %s", (asset) => {
    expect(parse(`asset=${asset}`).assetType).toBe(asset);
  });

  it.each(["US", "JP"])("accepts market %s", (market) => {
    expect(parse(`market=${market}`).market).toBe(market);
  });
});

describe("parseDiscoveryUrlState invalid values fall back safely", () => {
  it('falls back to "stock" for an unsupported asset type', () => {
    expect(parse("asset=bond").assetType).toBe("stock");
  });

  it("falls back to stock for an empty asset value", () => {
    expect(parse("asset=").assetType).toBe("stock");
  });

  it("falls back to all markets for an unsupported market", () => {
    expect(parse("market=EU").market).toBeUndefined();
  });

  it("is case-sensitive about market codes and falls back for lowercase", () => {
    expect(parse("market=jp").market).toBeUndefined();
  });

  it.each(["0", "-3", "abc", "2.5", "", "NaN", "Infinity"])(
    "falls back to page 1 for page %s",
    (page) => {
      expect(parse(`page=${page}`).page).toBe(1);
    }
  );

  it("keeps a valid page while other params are invalid", () => {
    const state = parse("asset=bond&market=EU&page=4");

    expect(state).toEqual({
      assetType: "stock",
      market: undefined,
      query: "",
      page: 4,
      etfFilters: {},
      indexSort: null,
    });
  });
});

describe("parseDiscoveryUrlState query handling", () => {
  it("trims surrounding whitespace", () => {
    expect(parse("q=%20%20northstar%20%20").query).toBe("northstar");
  });

  it("collapses a whitespace-only query to an empty query", () => {
    expect(parse("q=%20%20%20").query).toBe("");
  });

  it("clamps a query longer than 100 characters", () => {
    const long = "a".repeat(150);
    const state = parseDiscoveryUrlState(new URLSearchParams({ q: long }));

    expect(state.query).toHaveLength(100);
    expect(state.query).toBe("a".repeat(100));
  });

  it("keeps a 100-character query intact", () => {
    const exact = "b".repeat(100);
    const state = parseDiscoveryUrlState(new URLSearchParams({ q: exact }));

    expect(state.query).toBe(exact);
  });

  it("preserves a Japanese native-name query", () => {
    const state = parseDiscoveryUrlState(new URLSearchParams({ q: "サクラ" }));

    expect(state.query).toBe("サクラ");
  });
});

describe("serializeDiscoveryUrlState omits defaults", () => {
  it("produces empty params for the default state", () => {
    const params = serializeDiscoveryUrlState(DEFAULT_DISCOVERY_STATE);

    expect(params.toString()).toBe("");
  });

  it("omits page 1", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      page: 1,
    });

    expect(params.has("page")).toBe(false);
    expect(params.toString()).toBe("");
  });

  it('omits the default "stock" asset type', () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      market: "US",
    });

    expect(params.has("asset")).toBe(false);
    expect(params.get("market")).toBe("US");
  });

  it("omits an empty query", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      query: "",
      page: 2,
    });

    expect(params.has("q")).toBe(false);
    expect(params.get("page")).toBe("2");
  });
});

describe("serializeDiscoveryUrlState writes non-default values", () => {
  it("writes asset, market, q and page", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      assetType: "etf",
      market: "JP",
      query: "robotics",
      page: 3,
    });

    expect(params.get("asset")).toBe("etf");
    expect(params.get("market")).toBe("JP");
    expect(params.get("q")).toBe("robotics");
    expect(params.get("page")).toBe("3");
    expect([...params.keys()].sort()).toEqual(["asset", "market", "page", "q"]);
  });

  it("percent-encodes a Japanese query", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      query: "サクラ",
    });

    expect(params.toString()).toBe("q=%E3%82%B5%E3%82%AF%E3%83%A9");
    expect(params.get("q")).toBe("サクラ");
  });
});

describe("discovery URL state round-trips", () => {
  const base = DEFAULT_DISCOVERY_STATE;
  const states: readonly DiscoveryUrlState[] = [
    DEFAULT_DISCOVERY_STATE,
    { ...base, assetType: "etf", market: "JP", query: "robotics", page: 3 },
    { ...base, assetType: "index", market: undefined, query: "", page: 7 },
    { ...base, assetType: "stock", market: "US", query: "NST.DEMO", page: 1 },
    { ...base, assetType: "etf", market: undefined, query: "サクラ", page: 2 },
  ];

  it.each(states)(
    "parse(serialize(state)) equals the original state (%o)",
    (state) => {
      const roundTripped = parseDiscoveryUrlState(
        serializeDiscoveryUrlState(state)
      );

      expect(discoveryStatesEqual(roundTripped, state)).toBe(true);
      expect(roundTripped).toEqual(state);
    }
  );

  it("normalizes an untrimmed query on the way back through the URL", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      query: "  padded  ",
    });

    expect(parseDiscoveryUrlState(params).query).toBe("padded");
  });
});

describe("discoveryStatesEqual", () => {
  const base: DiscoveryUrlState = {
    ...DEFAULT_DISCOVERY_STATE,
    assetType: "etf",
    market: "JP",
    query: "robotics",
    page: 2,
  };

  it("returns true for two structurally identical states", () => {
    expect(discoveryStatesEqual(base, { ...base })).toBe(true);
  });

  it("returns true when comparing a state with itself", () => {
    expect(discoveryStatesEqual(base, base)).toBe(true);
  });

  it("returns false when the asset type differs", () => {
    expect(discoveryStatesEqual(base, { ...base, assetType: "stock" })).toBe(
      false
    );
  });

  it("returns false when the market differs", () => {
    expect(discoveryStatesEqual(base, { ...base, market: "US" })).toBe(false);
    expect(discoveryStatesEqual(base, { ...base, market: undefined })).toBe(
      false
    );
  });

  it("returns false when the query differs", () => {
    expect(discoveryStatesEqual(base, { ...base, query: "Robotics" })).toBe(
      false
    );
  });

  it("returns false when the page differs", () => {
    expect(discoveryStatesEqual(base, { ...base, page: 3 })).toBe(false);
  });
});

describe("ETF filter params are scoped to the ETF tab", () => {
  it("parses every ETF filter param on the ETF tab", () => {
    const state = parse(
      "asset=etf&etfCategory=Global%20Equity&etfRegion=Japan&maxExpense=0.005" +
        "&minAum=1000000000&minVolume=500000&minYield=0.02&exLeveraged=1&exInverse=1"
    );

    expect(state.etfFilters).toEqual({
      category: "Global Equity",
      exposureRegion: "Japan",
      maximumExpenseRatio: 0.005,
      minimumAssetsUnderManagement: 1_000_000_000,
      minimumAverageVolume: 500_000,
      minimumDividendYield: 0.02,
      excludeLeveraged: true,
      excludeInverse: true,
    });
  });

  it("parses a subset of ETF params and leaves the rest absent", () => {
    const state = parse("asset=etf&maxExpense=0.005&exLeveraged=1");

    expect(state.etfFilters).toEqual({
      maximumExpenseRatio: 0.005,
      excludeLeveraged: true,
    });
  });

  it("ignores ETF params on the stock tab", () => {
    const state = parse("asset=stock&maxExpense=0.005&etfRegion=Japan&exInverse=1");

    expect(state.assetType).toBe("stock");
    expect(state.etfFilters).toEqual({});
  });

  it("ignores ETF params when the asset type defaults to stock", () => {
    const state = parse("maxExpense=0.005&minAum=1000000000");

    expect(state.assetType).toBe("stock");
    expect(state.etfFilters).toEqual({});
  });

  it("ignores ETF params on the index tab", () => {
    const state = parse("asset=index&maxExpense=0.005&exLeveraged=1");

    expect(state.assetType).toBe("index");
    expect(state.etfFilters).toEqual({});
  });

  it("ignores ETF params when an invalid asset type falls back to stock", () => {
    const state = parse("asset=bond&maxExpense=0.005");

    expect(state.assetType).toBe("stock");
    expect(state.etfFilters).toEqual({});
  });

  it("treats only exLeveraged=1 / exInverse=1 as active exclusions", () => {
    expect(parse("asset=etf&exLeveraged=0").etfFilters).toEqual({});
    expect(parse("asset=etf&exLeveraged=true").etfFilters).toEqual({});
    expect(parse("asset=etf&exInverse=").etfFilters).toEqual({});
    expect(parse("asset=etf&exInverse=yes").etfFilters).toEqual({});
  });

  it("trims text filters and drops whitespace-only values", () => {
    expect(parse("asset=etf&etfCategory=%20Thematic%20Equity%20").etfFilters).toEqual(
      { category: "Thematic Equity" }
    );
    expect(parse("asset=etf&etfCategory=%20%20&etfRegion=%20").etfFilters).toEqual({});
  });

  it("clamps an over-long category to 100 characters", () => {
    const params = new URLSearchParams({
      asset: "etf",
      etfCategory: "c".repeat(150),
    });

    expect(parseDiscoveryUrlState(params).etfFilters.category).toHaveLength(100);
  });
});

describe("invalid ETF filter params fall back to no filter", () => {
  it.each(["abc", "-1", "1.5", "NaN", "Infinity"])(
    "drops maxExpense %s",
    (value) => {
      const state = parse(`asset=etf&maxExpense=${value}`);

      expect(state.etfFilters.maximumExpenseRatio).toBeUndefined();
      expect(state.etfFilters).toEqual({});
    }
  );

  it.each(["abc", "-1", "2", "NaN"])("drops minYield %s", (value) => {
    expect(parse(`asset=etf&minYield=${value}`).etfFilters).toEqual({});
  });

  it.each(["-5", "abc", "NaN", "-Infinity"])("drops minAum %s", (value) => {
    expect(parse(`asset=etf&minAum=${value}`).etfFilters).toEqual({});
  });

  it.each(["-1", "abc", "Infinity"])("drops minVolume %s", (value) => {
    expect(parse(`asset=etf&minVolume=${value}`).etfFilters).toEqual({});
  });

  it("treats a valueless numeric param as not set, never a zero filter", () => {
    // Number("") is 0; without the empty-string guard a hand-written URL
    // like ?maxExpense= would become an active zero-threshold filter that
    // silently excludes every fund with a published expense ratio.
    const state = parse("asset=etf&maxExpense=&minAum=&minVolume=&minYield=");

    expect(state.etfFilters).toEqual({});
  });

  it("accepts the decimal-fraction boundaries 0 and 1", () => {
    expect(parse("asset=etf&maxExpense=0").etfFilters.maximumExpenseRatio).toBe(0);
    expect(parse("asset=etf&maxExpense=1").etfFilters.maximumExpenseRatio).toBe(1);
    expect(parse("asset=etf&minYield=0").etfFilters.minimumDividendYield).toBe(0);
    expect(parse("asset=etf&minYield=1").etfFilters.minimumDividendYield).toBe(1);
  });

  it("accepts a zero minimum for absolute-value filters", () => {
    const state = parse("asset=etf&minAum=0&minVolume=0");

    expect(state.etfFilters.minimumAssetsUnderManagement).toBe(0);
    expect(state.etfFilters.minimumAverageVolume).toBe(0);
  });

  it("keeps the valid ETF params when another one is invalid", () => {
    const state = parse("asset=etf&maxExpense=abc&minAum=1000000000");

    expect(state.etfFilters).toEqual({
      minimumAssetsUnderManagement: 1_000_000_000,
    });
  });
});

describe("index sort params are scoped to the Indices tab", () => {
  it.each(["oneMonthReturn", "yearToDateReturn", "oneYearReturn"])(
    "parses sortField %s on the index tab",
    (field) => {
      const state = parse(`asset=index&sortField=${field}&sortDir=asc`);

      expect(state.indexSort).toEqual({ field, direction: "asc" });
    }
  );

  it("parses a descending sort", () => {
    const state = parse("asset=index&sortField=yearToDateReturn&sortDir=desc");

    expect(state.indexSort).toEqual({
      field: "yearToDateReturn",
      direction: "desc",
    });
  });

  it("returns no sort for an unsupported sort field", () => {
    expect(parse("asset=index&sortField=price&sortDir=asc").indexSort).toBeNull();
    expect(parse("asset=index&sortField=&sortDir=asc").indexSort).toBeNull();
    expect(
      parse("asset=index&sortField=OneYearReturn&sortDir=asc").indexSort
    ).toBeNull();
  });

  it("returns no sort when the direction is missing or invalid", () => {
    expect(parse("asset=index&sortField=oneYearReturn").indexSort).toBeNull();
    expect(
      parse("asset=index&sortField=oneYearReturn&sortDir=ASC").indexSort
    ).toBeNull();
    expect(
      parse("asset=index&sortField=oneYearReturn&sortDir=sideways").indexSort
    ).toBeNull();
  });

  it("returns no sort when only the direction is supplied", () => {
    expect(parse("asset=index&sortDir=desc").indexSort).toBeNull();
  });

  it("ignores index sort params on the ETF tab", () => {
    const state = parse("asset=etf&sortField=oneYearReturn&sortDir=asc");

    expect(state.assetType).toBe("etf");
    expect(state.indexSort).toBeNull();
  });

  it("ignores index sort params on the stock tab", () => {
    expect(
      parse("asset=stock&sortField=oneYearReturn&sortDir=desc").indexSort
    ).toBeNull();
    expect(parse("sortField=oneYearReturn&sortDir=desc").indexSort).toBeNull();
  });
});

describe("serializeDiscoveryUrlState scopes asset-specific params", () => {
  const etfFilters = {
    category: "Global Equity",
    exposureRegion: "Japan",
    maximumExpenseRatio: 0.005,
    minimumAssetsUnderManagement: 1_000_000_000,
    minimumAverageVolume: 500_000,
    minimumDividendYield: 0.02,
    excludeLeveraged: true,
    excludeInverse: true,
  } as const;

  it("writes the ETF filter params on the ETF tab", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      assetType: "etf",
      etfFilters: { ...etfFilters },
    });

    expect(params.get("etfCategory")).toBe("Global Equity");
    expect(params.get("etfRegion")).toBe("Japan");
    expect(params.get("maxExpense")).toBe("0.005");
    expect(params.get("minAum")).toBe("1000000000");
    expect(params.get("minVolume")).toBe("500000");
    expect(params.get("minYield")).toBe("0.02");
    expect(params.get("exLeveraged")).toBe("1");
    expect(params.get("exInverse")).toBe("1");
  });

  it("omits ETF filter params for a stock state even when filters are present", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      assetType: "stock",
      market: "US",
      etfFilters: { ...etfFilters },
    });

    expect([...params.keys()]).toEqual(["market"]);
  });

  it("omits ETF filter params for an index state even when filters are present", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      assetType: "index",
      etfFilters: { ...etfFilters },
    });

    expect([...params.keys()]).toEqual(["asset"]);
  });

  it("omits index sort params for a non-index state", () => {
    for (const assetType of ["stock", "etf"] as const) {
      const params = serializeDiscoveryUrlState({
        ...DEFAULT_DISCOVERY_STATE,
        assetType,
        indexSort: { field: "oneYearReturn", direction: "desc" },
      });

      expect(params.has("sortField")).toBe(false);
      expect(params.has("sortDir")).toBe(false);
    }
  });

  it("writes the index sort params on the index tab", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      assetType: "index",
      indexSort: { field: "oneMonthReturn", direction: "asc" },
    });

    expect(params.get("sortField")).toBe("oneMonthReturn");
    expect(params.get("sortDir")).toBe("asc");
  });

  it("omits ETF params when the ETF filter set is empty", () => {
    const params = serializeDiscoveryUrlState({
      ...DEFAULT_DISCOVERY_STATE,
      assetType: "etf",
    });

    expect([...params.keys()]).toEqual(["asset"]);
  });
});

describe("asset-specific discovery state round-trips", () => {
  const base = DEFAULT_DISCOVERY_STATE;
  const states: readonly DiscoveryUrlState[] = [
    {
      ...base,
      assetType: "etf",
      etfFilters: { maximumExpenseRatio: 0.005, excludeLeveraged: true },
    },
    {
      ...base,
      assetType: "etf",
      market: "JP",
      query: "robotics",
      page: 2,
      etfFilters: {
        category: "Thematic Equity",
        exposureRegion: "Japan",
        maximumExpenseRatio: 0.0075,
        minimumAssetsUnderManagement: 100_000_000_000,
        minimumAverageVolume: 250_000,
        minimumDividendYield: 0.004,
        excludeLeveraged: true,
        excludeInverse: true,
      },
    },
    {
      ...base,
      assetType: "index",
      indexSort: { field: "yearToDateReturn", direction: "desc" },
    },
    {
      ...base,
      assetType: "index",
      market: "JP",
      page: 2,
      indexSort: { field: "oneMonthReturn", direction: "asc" },
    },
  ];

  it.each(states)("parse(serialize(state)) equals the original (%o)", (state) => {
    const roundTripped = parseDiscoveryUrlState(
      serializeDiscoveryUrlState(state)
    );

    expect(roundTripped).toEqual(state);
    expect(discoveryStatesEqual(roundTripped, state)).toBe(true);
  });

  it("treats two ETF states with different filters as unequal", () => {
    const withFilter: DiscoveryUrlState = {
      ...base,
      assetType: "etf",
      etfFilters: { maximumExpenseRatio: 0.005 },
    };

    expect(
      discoveryStatesEqual(withFilter, { ...withFilter, etfFilters: {} })
    ).toBe(false);
  });

  it("treats two index states with different sorts as unequal", () => {
    const sorted: DiscoveryUrlState = {
      ...base,
      assetType: "index",
      indexSort: { field: "oneYearReturn", direction: "desc" },
    };

    expect(
      discoveryStatesEqual(sorted, {
        ...sorted,
        indexSort: { field: "oneYearReturn", direction: "asc" },
      })
    ).toBe(false);
    expect(discoveryStatesEqual(sorted, { ...sorted, indexSort: null })).toBe(
      false
    );
  });
});

describe("changeAssetType drops incompatible state", () => {
  const etfWithFilters: DiscoveryUrlState = {
    assetType: "etf",
    market: "JP",
    query: "robotics",
    page: 4,
    etfFilters: {
      category: "Thematic Equity",
      maximumExpenseRatio: 0.005,
      excludeLeveraged: true,
    },
    indexSort: null,
  };

  const indexWithSort: DiscoveryUrlState = {
    assetType: "index",
    market: "US",
    query: "demo",
    page: 3,
    etfFilters: {},
    indexSort: { field: "yearToDateReturn", direction: "desc" },
  };

  it("clears ETF filters when moving from ETFs to stocks", () => {
    const next = changeAssetType(etfWithFilters, "stock");

    expect(next).toEqual({
      assetType: "stock",
      market: "JP",
      query: "robotics",
      page: 1,
      etfFilters: {},
      indexSort: null,
    });
  });

  it("preserves market and search text while resetting the page", () => {
    const next = changeAssetType(etfWithFilters, "index");

    expect(next.market).toBe("JP");
    expect(next.query).toBe("robotics");
    expect(next.page).toBe(1);
  });

  it("drops the index sort when moving from indices to ETFs", () => {
    const next = changeAssetType(indexWithSort, "etf");

    expect(next.indexSort).toBeNull();
    expect(next.etfFilters).toEqual({});
    expect(next.assetType).toBe("etf");
    expect(next.page).toBe(1);
  });

  it("clears ETF filters even when the asset type does not change", () => {
    const next = changeAssetType(etfWithFilters, "etf");

    expect(next.assetType).toBe("etf");
    expect(next.etfFilters).toEqual({});
    expect(next.page).toBe(1);
  });

  it("does not mutate the source state", () => {
    const snapshot = JSON.stringify(etfWithFilters);

    changeAssetType(etfWithFilters, "stock");

    expect(JSON.stringify(etfWithFilters)).toBe(snapshot);
  });

  it("never serializes an incompatible param after a tab change", () => {
    const params = serializeDiscoveryUrlState(
      changeAssetType(etfWithFilters, "stock")
    );

    expect([...params.keys()].sort()).toEqual(["market", "q"]);
  });

  it("survives a round-trip through the URL after a tab change", () => {
    const next = changeAssetType(indexWithSort, "stock");

    expect(
      parseDiscoveryUrlState(serializeDiscoveryUrlState(next))
    ).toEqual(next);
  });
});
