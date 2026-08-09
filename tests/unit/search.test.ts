import { describe, expect, it } from "vitest";
import {
  normalizeSearchText,
  rankMatch,
  searchSnapshots,
} from "@/lib/market-data/providers/demo/search";
import { filterByMarket } from "@/lib/market-data/providers/demo/filters";
import { getDemoSnapshots } from "@/data/demo";
import { demoStocks } from "@/data/demo/stocks";
import type { InstrumentSnapshot, StockSnapshot } from "@/lib/domain";

/** Fixture lookup that fails loudly if the demo dataset is renamed. */
function snapshotById(instrumentId: string): InstrumentSnapshot {
  const found = getDemoSnapshots().find((s) => s.instrument.id === instrumentId);
  if (found === undefined) {
    throw new Error(`Missing demo fixture: ${instrumentId}`);
  }
  return found;
}

function stockById(instrumentId: string): StockSnapshot {
  const found = demoStocks.find((s) => s.instrument.id === instrumentId);
  if (found === undefined) {
    throw new Error(`Missing demo stock fixture: ${instrumentId}`);
  }
  return found;
}

function ids(snapshots: readonly InstrumentSnapshot[]): string[] {
  return snapshots.map((s) => s.instrument.id);
}

const NORTHSTAR_ID = "stock-us-northstar-software";
const SAKURA_ID = "stock-jp-sakura-automation";

describe("normalizeSearchText", () => {
  it("lowercases and trims surrounding whitespace", () => {
    expect(normalizeSearchText("  NST.DEMO  ")).toBe("nst.demo");
  });

  it("lowercases mixed-case English names", () => {
    expect(normalizeSearchText("Northstar Software")).toBe("northstar software");
  });

  it("NFKC-folds full-width latin letters to ASCII", () => {
    expect(normalizeSearchText("ＮＳＴ")).toBe("nst");
  });

  it("NFKC-folds full-width digits to ASCII", () => {
    expect(normalizeSearchText("７２０１")).toBe("7201");
  });

  it("NFKC-folds half-width katakana to full-width katakana", () => {
    expect(normalizeSearchText("ｻｸﾗ")).toBe("サクラ");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeSearchText("   \t \n ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeSearchText("  Ｎｏｒｔｈｓｔａｒ Software ");
    expect(normalizeSearchText(once)).toBe(once);
  });
});

describe("rankMatch tiers", () => {
  const northstar = snapshotById(NORTHSTAR_ID);
  const sakura = snapshotById(SAKURA_ID);

  it("ranks an exact symbol match 0, case-insensitively", () => {
    expect(rankMatch(northstar, normalizeSearchText("nst.demo"))).toBe(0);
    expect(rankMatch(northstar, normalizeSearchText("NST.DEMO"))).toBe(0);
  });

  it("ranks a symbol prefix match 1", () => {
    expect(rankMatch(northstar, normalizeSearchText("nst"))).toBe(1);
  });

  it("ranks an exact full-name match 2", () => {
    expect(rankMatch(northstar, normalizeSearchText("Northstar Software"))).toBe(
      2
    );
  });

  it("ranks a name prefix match 3", () => {
    expect(rankMatch(northstar, normalizeSearchText("north"))).toBe(3);
  });

  it("ranks a name substring match 4", () => {
    expect(rankMatch(northstar, normalizeSearchText("software"))).toBe(4);
  });

  it("ranks a native-name substring match 5", () => {
    expect(rankMatch(sakura, normalizeSearchText("サクラ"))).toBe(5);
  });

  it("returns null when nothing matches", () => {
    expect(rankMatch(northstar, normalizeSearchText("zzzznotfound"))).toBeNull();
  });

  it("returns null for a native-name query against an instrument without a native name", () => {
    expect(northstar.instrument.nativeName).toBeUndefined();
    expect(rankMatch(northstar, normalizeSearchText("サクラ"))).toBeNull();
  });

  it("prefers the strongest applicable tier for a single snapshot", () => {
    const exact = rankMatch(northstar, normalizeSearchText("nst.demo"));
    const prefix = rankMatch(northstar, normalizeSearchText("nst"));
    const nameSubstring = rankMatch(northstar, normalizeSearchText("software"));

    expect(exact).toBeLessThan(prefix ?? Number.POSITIVE_INFINITY);
    expect(prefix).toBeLessThan(nameSubstring ?? Number.POSITIVE_INFINITY);
  });
});

describe("searchSnapshots with an empty query", () => {
  it("returns all 26 demo snapshots unchanged for an empty string", () => {
    const all = getDemoSnapshots();
    const result = searchSnapshots(all, "");

    expect(result).toHaveLength(26);
    expect(ids(result)).toEqual(ids(all));
  });

  it("returns all 26 demo snapshots unchanged for undefined", () => {
    const all = getDemoSnapshots();
    const result = searchSnapshots(all, undefined);

    expect(result).toHaveLength(26);
    expect(ids(result)).toEqual(ids(all));
  });

  it("treats a whitespace-only query as no search filter", () => {
    const all = getDemoSnapshots();
    const result = searchSnapshots(all, "   ");

    expect(ids(result)).toEqual(ids(all));
  });

  it("returns a copy rather than the caller's array", () => {
    const all = getDemoSnapshots();
    const result = searchSnapshots(all, "");

    expect(result).not.toBe(all);
  });
});

describe("searchSnapshots ranking order", () => {
  it("puts an exact symbol match first even when a name-substring competitor precedes it", () => {
    const northstar = stockById(NORTHSTAR_ID);
    const competitor: StockSnapshot = {
      ...northstar,
      instrument: {
        ...northstar.instrument,
        id: "stock-us-tracker-demo",
        symbol: "TRK.DEMO",
        name: "Tracker of NST.DEMO Holdings",
      },
    };

    const result = searchSnapshots([competitor, northstar], "NST.DEMO");

    expect(ids(result)).toEqual([NORTHSTAR_ID, "stock-us-tracker-demo"]);
  });

  it("orders name prefix matches ahead of name substring matches", () => {
    const result = searchSnapshots(getDemoSnapshots(), "tokyo");

    // Prefix matches (the three Tokyo Demo indices) precede the substring
    // match on "Global Equity Demo ETF (Tokyo-Listed)".
    expect(result.map((s) => s.instrument.symbol)).toEqual([
      "0100.DEMO",
      "0225.DEMO",
      "0250.DEMO",
      "2559.DEMO",
    ]);
  });

  it("breaks ties within a rank by symbol", () => {
    const result = searchSnapshots(getDemoSnapshots(), "index");
    const symbols = result.map((s) => s.instrument.symbol);

    expect(symbols).toEqual([...symbols].sort((a, b) => a.localeCompare(b)));
    expect(symbols).toEqual([
      "0100.DEMO",
      "0225.DEMO",
      "0250.DEMO",
      "DMO500.DEMO",
      "DMOSML.DEMO",
      "DMOTECH.DEMO",
    ]);
  });
});

describe("searchSnapshots determinism and purity", () => {
  it("returns an identical order for two identical calls", () => {
    const first = searchSnapshots(getDemoSnapshots(), "demo etf");
    const second = searchSnapshots(getDemoSnapshots(), "demo etf");

    expect(ids(first)).toEqual(ids(second));
    expect(first).toHaveLength(8);
  });

  it("does not mutate the input array", () => {
    const all = [...getDemoSnapshots()];
    const before = ids(all);

    searchSnapshots(all, "index");

    expect(ids(all)).toEqual(before);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchSnapshots(getDemoSnapshots(), "zzzznotfound")).toEqual([]);
  });
});

describe("searchSnapshots matching behaviour", () => {
  it("matches a symbol case-insensitively", () => {
    const lower = searchSnapshots(getDemoSnapshots(), "nst.demo");
    const upper = searchSnapshots(getDemoSnapshots(), "NST.DEMO");
    const mixed = searchSnapshots(getDemoSnapshots(), "Nst.Demo");

    expect(ids(lower)).toEqual([NORTHSTAR_ID]);
    expect(ids(upper)).toEqual([NORTHSTAR_ID]);
    expect(ids(mixed)).toEqual([NORTHSTAR_ID]);
  });

  it("matches an English name case-insensitively", () => {
    const result = searchSnapshots(getDemoSnapshots(), "NORTHSTAR SOFTWARE");

    expect(ids(result)).toEqual([NORTHSTAR_ID]);
  });

  it("matches a full-width symbol query after NFKC folding", () => {
    const result = searchSnapshots(getDemoSnapshots(), "ＮＳＴ");

    expect(ids(result)).toEqual([NORTHSTAR_ID]);
  });

  it("returns the Japanese instrument for a native-name substring", () => {
    const result = searchSnapshots(getDemoSnapshots(), "サクラ");

    expect(ids(result)).toEqual([SAKURA_ID]);
  });

  it("returns the Japanese instrument for a half-width katakana query", () => {
    const result = searchSnapshots(getDemoSnapshots(), "ｻｸﾗ");

    expect(ids(result)).toEqual([SAKURA_ID]);
  });

  it("finds Japanese ETFs by a native-name substring", () => {
    const result = searchSnapshots(getDemoSnapshots(), "デモ上場投信");

    expect(result).toHaveLength(4);
    expect(result.every((s) => s.assetType === "etf")).toBe(true);
    expect(result.every((s) => s.instrument.listingMarket === "JP")).toBe(true);
  });

  it("trims a padded query before matching", () => {
    const result = searchSnapshots(getDemoSnapshots(), "   northstar   ");

    expect(ids(result)).toEqual([NORTHSTAR_ID]);
  });
});

describe("searchSnapshots composed with the market filter", () => {
  it("returns no results for a Japanese-only name under the US market filter", () => {
    const usOnly = filterByMarket(getDemoSnapshots(), "US");

    expect(searchSnapshots(usOnly, "Sakura Automation")).toEqual([]);
    expect(searchSnapshots(usOnly, "サクラ")).toEqual([]);
  });

  it("returns the Japanese instrument under the JP market filter", () => {
    const jpOnly = filterByMarket(getDemoSnapshots(), "JP");

    expect(ids(searchSnapshots(jpOnly, "サクラ"))).toEqual([SAKURA_ID]);
  });

  it("returns no results for a US-only name under the JP market filter", () => {
    const jpOnly = filterByMarket(getDemoSnapshots(), "JP");

    expect(searchSnapshots(jpOnly, "Northstar Software")).toEqual([]);
  });
});
