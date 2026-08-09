import { describe, expect, it } from "vitest";
import {
  addEntry,
  hasEntry,
  parseWatchlist,
  removeEntry,
  serializeWatchlist,
  WATCHLIST_STORAGE_KEY,
  type WatchlistEntry,
} from "@/lib/watchlist/storage";

const northstar: WatchlistEntry = {
  instrumentId: "stock-us-northstar-software",
  symbol: "NST.DEMO",
  name: "Northstar Software",
  assetType: "stock",
  addedAt: "2026-08-07T20:00:00.000Z",
};

const sakura: WatchlistEntry = {
  instrumentId: "stock-jp-sakura-automation",
  symbol: "7201.DEMO",
  name: "Sakura Automation",
  assetType: "stock",
  addedAt: "2026-08-07T20:05:00.000Z",
};

const broadMarketEtf: WatchlistEntry = {
  instrumentId: "etf-us-broad-market",
  symbol: "BRDX.DEMO",
  name: "US Broad Market Demo ETF",
  assetType: "etf",
  addedAt: "2026-08-07T20:10:00.000Z",
};

describe("WATCHLIST_STORAGE_KEY", () => {
  it("is the versioned browser-local key", () => {
    expect(WATCHLIST_STORAGE_KEY).toBe("market-thesis.watchlist.v1");
  });
});

describe("parseWatchlist with unusable input", () => {
  it("returns an empty list for null (nothing stored yet)", () => {
    expect(parseWatchlist(null)).toEqual([]);
  });

  it("returns an empty list for an empty string", () => {
    expect(parseWatchlist("")).toEqual([]);
  });

  it("returns an empty list for malformed JSON instead of throwing", () => {
    expect(parseWatchlist("not json{")).toEqual([]);
  });

  it("returns an empty list for a JSON object rather than an array", () => {
    expect(parseWatchlist('{"instrumentId":"stock-us-northstar-software"}')).toEqual(
      []
    );
  });

  it.each(["null", "3", '"a string"', "true"])(
    "returns an empty list for the non-array JSON value %s",
    (raw) => {
      expect(parseWatchlist(raw)).toEqual([]);
    }
  );

  it("returns an empty list for an empty JSON array", () => {
    expect(parseWatchlist("[]")).toEqual([]);
  });
});

describe("parseWatchlist with valid entries", () => {
  it("returns every valid entry in stored order", () => {
    const raw = JSON.stringify([northstar, sakura, broadMarketEtf]);

    expect(parseWatchlist(raw)).toEqual([northstar, sakura, broadMarketEtf]);
  });

  it.each(["stock", "etf", "index"] as const)(
    "accepts the supported asset type %s",
    (assetType) => {
      const raw = JSON.stringify([{ ...northstar, assetType }]);

      expect(parseWatchlist(raw)).toHaveLength(1);
      expect(parseWatchlist(raw)[0]?.assetType).toBe(assetType);
    }
  );
});

describe("parseWatchlist drops invalid entries", () => {
  it("keeps only the valid entries from a mixed array", () => {
    const raw = JSON.stringify([
      northstar,
      { instrumentId: "missing-fields" },
      { ...sakura, assetType: "bond" },
      { ...broadMarketEtf, instrumentId: "" },
      { ...sakura, symbol: 7201 },
      { ...sakura, addedAt: 1_754_600_000_000 },
      null,
      "a string",
      42,
      sakura,
    ]);

    expect(parseWatchlist(raw)).toEqual([northstar, sakura]);
  });

  it("drops an entry with an unsupported asset type", () => {
    const raw = JSON.stringify([{ ...northstar, assetType: "bond" }]);

    expect(parseWatchlist(raw)).toEqual([]);
  });

  it("drops an entry with an empty instrument ID", () => {
    const raw = JSON.stringify([{ ...northstar, instrumentId: "" }]);

    expect(parseWatchlist(raw)).toEqual([]);
  });

  it.each(["instrumentId", "symbol", "name", "assetType", "addedAt"] as const)(
    "drops an entry missing the %s field",
    (field) => {
      const partial: Record<string, unknown> = { ...northstar };
      delete partial[field];

      expect(parseWatchlist(JSON.stringify([partial]))).toEqual([]);
    }
  );

  it("keeps the first occurrence of a duplicated instrument ID", () => {
    const laterDuplicate: WatchlistEntry = {
      ...northstar,
      symbol: "STALE.DEMO",
      addedAt: "2026-08-08T00:00:00.000Z",
    };
    const raw = JSON.stringify([northstar, laterDuplicate, sakura]);

    expect(parseWatchlist(raw)).toEqual([northstar, sakura]);
  });
});

describe("serializeWatchlist and parseWatchlist round-trip", () => {
  it("preserves entries exactly", () => {
    const entries = [northstar, sakura, broadMarketEtf];

    expect(parseWatchlist(serializeWatchlist(entries))).toEqual(entries);
  });

  it("round-trips an empty list to an empty list", () => {
    expect(parseWatchlist(serializeWatchlist([]))).toEqual([]);
  });

  it("produces JSON text", () => {
    expect(serializeWatchlist([northstar])).toBe(JSON.stringify([northstar]));
  });
});

describe("addEntry", () => {
  it("appends a new entry to the end", () => {
    expect(addEntry([northstar], sakura)).toEqual([northstar, sakura]);
  });

  it("adds to an empty list", () => {
    expect(addEntry([], northstar)).toEqual([northstar]);
  });

  it("is a no-op when the instrument ID is already saved", () => {
    const entries = [northstar, sakura];
    const result = addEntry(entries, { ...northstar, symbol: "OTHER.DEMO" });

    expect(result).toHaveLength(2);
    expect(result).toEqual(entries);
  });

  it("does not mutate the input array", () => {
    const entries = [northstar];
    addEntry(entries, sakura);

    expect(entries).toEqual([northstar]);
  });

  it("returns a new array even for a no-op add", () => {
    const entries = [northstar];
    const result = addEntry(entries, northstar);

    expect(result).not.toBe(entries);
    expect(result).toEqual(entries);
  });
});

describe("removeEntry", () => {
  it("removes the matching entry", () => {
    expect(removeEntry([northstar, sakura], northstar.instrumentId)).toEqual([
      sakura,
    ]);
  });

  it("is a no-op for an unknown instrument ID", () => {
    const entries = [northstar, sakura];

    expect(removeEntry(entries, "stock-us-nonexistent")).toEqual(entries);
  });

  it("returns an empty list when the only entry is removed", () => {
    expect(removeEntry([northstar], northstar.instrumentId)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const entries = [northstar, sakura];
    removeEntry(entries, northstar.instrumentId);

    expect(entries).toEqual([northstar, sakura]);
  });

  it("does not return the same array instance", () => {
    const entries = [northstar];

    expect(removeEntry(entries, "stock-us-nonexistent")).not.toBe(entries);
  });
});

describe("hasEntry", () => {
  it("returns true for a saved instrument ID", () => {
    expect(hasEntry([northstar, sakura], sakura.instrumentId)).toBe(true);
  });

  it("returns false for an unsaved instrument ID", () => {
    expect(hasEntry([northstar], sakura.instrumentId)).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(hasEntry([], northstar.instrumentId)).toBe(false);
  });

  it("matches instrument IDs exactly, not by prefix", () => {
    expect(hasEntry([northstar], "stock-us-northstar")).toBe(false);
  });

  it("agrees with addEntry and removeEntry", () => {
    const afterAdd = addEntry([], northstar);
    expect(hasEntry(afterAdd, northstar.instrumentId)).toBe(true);

    const afterRemove = removeEntry(afterAdd, northstar.instrumentId);
    expect(hasEntry(afterRemove, northstar.instrumentId)).toBe(false);
  });
});
