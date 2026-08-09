import { describe, expect, it } from "vitest";
import { createDemoMarketDataProvider } from "@/lib/market-data/providers/demo/provider";
import type { AssetType } from "@/lib/domain";

const provider = createDemoMarketDataProvider();

describe("demo provider getInstrument", () => {
  it("returns the snapshot for a known stock ID", async () => {
    const snapshot = await provider.getInstrument("stock-us-northstar-software");

    expect(snapshot).not.toBeNull();
    expect(snapshot?.instrument.id).toBe("stock-us-northstar-software");
    expect(snapshot?.assetType).toBe("stock");
    expect(snapshot?.instrument.symbol).toBe("NST.DEMO");
    expect(snapshot?.provenance.isDemo).toBe(true);
  });

  it("returns the snapshot for a known ETF ID with ETF semantics", async () => {
    const snapshot = await provider.getInstrument("etf-us-broad-market");

    expect(snapshot?.assetType).toBe("etf");
    expect(snapshot?.instrument.id).toBe("etf-us-broad-market");
  });

  it("returns the snapshot for a known index ID and keeps it non-tradable", async () => {
    const snapshot = await provider.getInstrument("index-jp-tokyo-demo-225");

    expect(snapshot?.assetType).toBe("index");
    expect(snapshot?.instrument.isTradable).toBe(false);
  });

  it("returns null for an unknown instrument ID", async () => {
    expect(await provider.getInstrument("stock-us-nonexistent")).toBeNull();
  });

  it("returns null for an empty instrument ID", async () => {
    expect(await provider.getInstrument("")).toBeNull();
  });

  it("matches instrument IDs exactly, not by symbol or prefix", async () => {
    expect(await provider.getInstrument("NST.DEMO")).toBeNull();
    expect(await provider.getInstrument("stock-us-northstar")).toBeNull();
    expect(await provider.getInstrument("STOCK-US-NORTHSTAR-SOFTWARE")).toBeNull();
  });

  it("returns the same snapshot for repeated lookups", async () => {
    const first = await provider.getInstrument("stock-jp-sakura-automation");
    const second = await provider.getInstrument("stock-jp-sakura-automation");

    expect(first).toEqual(second);
  });
});

describe("getInstrument resolves every listed instrument", () => {
  it.each(["stock", "etf", "index"] as const)(
    "resolves every %s ID returned by listInstruments",
    async (assetType: AssetType) => {
      const page = await provider.listInstruments({
        assetType,
        page: 1,
        pageSize: 100,
      });

      expect(page.items.length).toBeGreaterThan(0);

      for (const item of page.items) {
        const looked = await provider.getInstrument(item.instrument.id);
        expect(looked).not.toBeNull();
        expect(looked?.instrument.id).toBe(item.instrument.id);
        expect(looked?.assetType).toBe(assetType);
      }
    }
  );
});

describe("listInstruments with a search query", () => {
  it("returns Northstar first for the symbol prefix NST", async () => {
    const result = await provider.listInstruments({
      assetType: "stock",
      query: "NST",
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0]?.instrument.id).toBe("stock-us-northstar-software");
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("returns a valid empty page when the query matches nothing", async () => {
    const result = await provider.listInstruments({
      assetType: "stock",
      query: "zzzznotfound",
      page: 1,
      pageSize: 25,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.hasNextPage).toBe(false);
  });

  it("returns all instruments of the asset type when the query is omitted", async () => {
    const result = await provider.listInstruments({
      assetType: "stock",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(12);
  });

  it("treats an empty query string as no search filter", async () => {
    const result = await provider.listInstruments({
      assetType: "stock",
      query: "",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(12);
  });

  it("composes the query with the market filter", async () => {
    const jpResult = await provider.listInstruments({
      assetType: "stock",
      market: "JP",
      query: "Northstar Software",
      page: 1,
      pageSize: 25,
    });

    expect(jpResult.total).toBe(0);
    expect(jpResult.items).toEqual([]);

    const usResult = await provider.listInstruments({
      assetType: "stock",
      market: "US",
      query: "Northstar Software",
      page: 1,
      pageSize: 25,
    });

    expect(usResult.total).toBe(1);
    expect(usResult.items[0]?.instrument.id).toBe("stock-us-northstar-software");
  });

  it("composes the query with the asset-type filter", async () => {
    const asStock = await provider.listInstruments({
      assetType: "stock",
      query: "NST",
      page: 1,
      pageSize: 25,
    });
    const asEtf = await provider.listInstruments({
      assetType: "etf",
      query: "NST",
      page: 1,
      pageSize: 25,
    });

    expect(asStock.total).toBe(1);
    expect(asEtf.total).toBe(0);
  });

  it("finds a Japanese stock by its native name", async () => {
    const result = await provider.listInstruments({
      assetType: "stock",
      query: "サクラ",
      page: 1,
      pageSize: 25,
    });

    expect(result.items.map((s) => s.instrument.id)).toEqual([
      "stock-jp-sakura-automation",
    ]);
  });

  it("paginates search results deterministically", async () => {
    const query = {
      assetType: "index",
      query: "Index",
      page: 1,
      pageSize: 4,
    } as const;

    const firstPage = await provider.listInstruments(query);
    const secondPage = await provider.listInstruments({ ...query, page: 2 });
    const firstPageAgain = await provider.listInstruments(query);

    expect(firstPage.total).toBe(6);
    expect(firstPage.items).toHaveLength(4);
    expect(firstPage.hasNextPage).toBe(true);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.hasNextPage).toBe(false);
    expect(firstPageAgain.items.map((s) => s.instrument.id)).toEqual(
      firstPage.items.map((s) => s.instrument.id)
    );
  });
});
