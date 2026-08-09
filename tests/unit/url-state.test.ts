import { describe, expect, it } from "vitest";
import {
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
  const states: readonly DiscoveryUrlState[] = [
    DEFAULT_DISCOVERY_STATE,
    { assetType: "etf", market: "JP", query: "robotics", page: 3 },
    { assetType: "index", market: undefined, query: "", page: 7 },
    { assetType: "stock", market: "US", query: "NST.DEMO", page: 1 },
    { assetType: "etf", market: undefined, query: "サクラ", page: 2 },
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
