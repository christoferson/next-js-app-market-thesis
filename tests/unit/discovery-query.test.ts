import { describe, expect, it } from "vitest";
import { parseDiscoveryQuery } from "@/lib/validation/discovery-query";

function parse(search: string) {
  return parseDiscoveryQuery(new URLSearchParams(search));
}

describe("parseDiscoveryQuery defaults", () => {
  it("applies stock / all markets / page 1 / pageSize 25 for empty params", () => {
    const result = parse("");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.assetType).toBe("stock");
    expect(result.query.market).toBeUndefined();
    expect(result.query.page).toBe(1);
    expect(result.query.pageSize).toBe(25);
  });

  it("keeps market undefined when only other params are supplied", () => {
    const result = parse("assetType=index&page=2");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.market).toBeUndefined();
    expect(result.query.assetType).toBe("index");
    expect(result.query.page).toBe(2);
    expect(result.query.pageSize).toBe(25);
  });
});

describe("parseDiscoveryQuery valid input", () => {
  it("passes through assetType etf, market JP, page 3 and pageSize 50", () => {
    const result = parse("assetType=etf&market=JP&page=3&pageSize=50");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toEqual({
      assetType: "etf",
      market: "JP",
      page: 3,
      pageSize: 50,
    });
  });

  it("accepts every supported asset type", () => {
    for (const assetType of ["stock", "etf", "index"]) {
      const result = parse(`assetType=${assetType}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.query.assetType).toBe(assetType);
      }
    }
  });

  it("accepts both supported markets", () => {
    for (const market of ["US", "JP"]) {
      const result = parse(`market=${market}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.query.market).toBe(market);
      }
    }
  });

  it("coerces numeric strings to numbers", () => {
    const result = parse("page=7&pageSize=10");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.page).toBe(7);
    expect(result.query.pageSize).toBe(10);
    expect(typeof result.query.page).toBe("number");
    expect(typeof result.query.pageSize).toBe("number");
  });
});

describe("parseDiscoveryQuery rejects invalid values", () => {
  it("rejects an unsupported assetType", () => {
    const result = parse("assetType=bond");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.assetType).toBeDefined();
  });

  it("rejects an unsupported market", () => {
    const result = parse("market=EU");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.market).toBeDefined();
  });

  it.each(["0", "-1", "abc", "1.5"])("rejects page %s", (page) => {
    const result = parse(`page=${page}`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.page).toBeDefined();
  });

  it.each(["0", "101"])("rejects pageSize %s", (pageSize) => {
    const result = parse(`pageSize=${pageSize}`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.pageSize).toBeDefined();
  });

  it.each(["1", "100"])("accepts boundary pageSize %s", (pageSize) => {
    const result = parse(`pageSize=${pageSize}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.pageSize).toBe(Number(pageSize));
  });

  it("does not clamp an out-of-range pageSize to the maximum", () => {
    const result = parse("pageSize=500");

    expect(result.ok).toBe(false);
  });

  it("reports every invalid field in a single failure result", () => {
    const result = parse("assetType=bond&market=EU&page=0&pageSize=999");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.details).sort()).toEqual([
      "assetType",
      "market",
      "page",
      "pageSize",
    ]);
  });
});

describe("parseDiscoveryQuery failure shape", () => {
  it("returns a readable message and per-field details keyed by field name", () => {
    const result = parse("assetType=bond");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("One or more query parameters are invalid.");
    expect(typeof result.message).toBe("string");
    const assetTypeIssues = result.details.assetType;
    expect(assetTypeIssues).toBeInstanceOf(Array);
    expect(assetTypeIssues?.length).toBeGreaterThan(0);
    expect(typeof assetTypeIssues?.[0]).toBe("string");
  });

  it("does not expose a query object on failure", () => {
    const result = parse("page=-5");

    expect(result.ok).toBe(false);
    expect("query" in result).toBe(false);
  });
});

describe("parseDiscoveryQuery search query param", () => {
  it("leaves query undefined when the param is absent", () => {
    const result = parse("assetType=stock");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.query).toBeUndefined();
  });

  it("includes a trimmed query on success", () => {
    const result = parseDiscoveryQuery(
      new URLSearchParams({ query: "  spaced  " })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.query).toBe("spaced");
  });

  it("reduces a whitespace-only query to an empty string", () => {
    const result = parseDiscoveryQuery(new URLSearchParams({ query: "   " }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.query).toBe("");
  });

  it("passes a symbol query through alongside the other params", () => {
    const result = parse("assetType=stock&market=US&query=NST.DEMO&page=2");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toEqual({
      assetType: "stock",
      market: "US",
      query: "NST.DEMO",
      page: 2,
      pageSize: 25,
    });
  });

  it("preserves a Japanese native-name query", () => {
    const result = parseDiscoveryQuery(new URLSearchParams({ query: "サクラ" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.query).toBe("サクラ");
  });

  it("accepts a query of exactly 100 characters", () => {
    const result = parseDiscoveryQuery(
      new URLSearchParams({ query: "a".repeat(100) })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.query).toBe("a".repeat(100));
  });

  it("rejects a 101-character query rather than truncating it", () => {
    const result = parseDiscoveryQuery(
      new URLSearchParams({ query: "a".repeat(101) })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.query).toBeDefined();
  });
});

describe("parseDiscoveryQuery unknown parameters", () => {
  it("ignores unknown params while honouring known ones", () => {
    const result = parse("foo=bar&assetType=etf");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.assetType).toBe("etf");
    expect(result.query).toEqual({
      assetType: "etf",
      market: undefined,
      page: 1,
      pageSize: 25,
    });
  });

  it("ignores unknown params that would otherwise be invalid", () => {
    const result = parse("sort=marketCap&watchlist=1&query=northstar");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.assetType).toBe("stock");
  });

  it("uses the first value when a known param is repeated", () => {
    const result = parse("assetType=etf&assetType=index");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.assetType).toBe("etf");
  });
});
