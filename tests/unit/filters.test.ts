import { describe, expect, it } from "vitest";
import {
  filterByAssetType,
  filterByMarket,
} from "@/lib/market-data/providers/demo/filters";
import { getDemoSnapshots } from "@/data/demo";
import type { AssetType, SupportedMarket } from "@/lib/domain";

const snapshots = getDemoSnapshots();

describe("filterByAssetType", () => {
  it("returns only stock snapshots and finds all 12 demo stocks", () => {
    const stocks = filterByAssetType(snapshots, "stock");

    expect(stocks).toHaveLength(12);
    expect(stocks.every((s) => s.assetType === "stock")).toBe(true);
    expect(stocks.every((s) => s.instrument.assetType === "stock")).toBe(true);
  });

  it("returns only ETF snapshots and finds all 8 demo ETFs", () => {
    const etfs = filterByAssetType(snapshots, "etf");

    expect(etfs).toHaveLength(8);
    expect(etfs.every((s) => s.assetType === "etf")).toBe(true);
    expect(etfs.every((s) => s.instrument.assetType === "etf")).toBe(true);
  });

  it("returns only index snapshots and finds all 6 demo indices", () => {
    const indices = filterByAssetType(snapshots, "index");

    expect(indices).toHaveLength(6);
    expect(indices.every((s) => s.assetType === "index")).toBe(true);
    expect(indices.every((s) => s.instrument.assetType === "index")).toBe(true);
  });

  it("partitions the full demo set across the three asset types with no leftovers", () => {
    const assetTypes: readonly AssetType[] = ["stock", "etf", "index"];
    const counts = assetTypes.map((t) => filterByAssetType(snapshots, t).length);

    expect(counts.reduce((a, b) => a + b, 0)).toBe(snapshots.length);
    expect(snapshots.length).toBe(26);
  });

  it("does not mutate the input collection", () => {
    const originalLength = snapshots.length;
    filterByAssetType(snapshots, "stock");

    expect(getDemoSnapshots()).toHaveLength(originalLength);
  });
});

describe("filterByMarket", () => {
  it("returns only US-listed snapshots for market US", () => {
    const usOnly = filterByMarket(snapshots, "US");

    expect(usOnly).toHaveLength(13);
    expect(usOnly.every((s) => s.instrument.listingMarket === "US")).toBe(true);
  });

  it("returns only JP-listed snapshots for market JP", () => {
    const jpOnly = filterByMarket(snapshots, "JP");

    expect(jpOnly).toHaveLength(13);
    expect(jpOnly.every((s) => s.instrument.listingMarket === "JP")).toBe(true);
  });

  it("treats an omitted market as all markets", () => {
    const all = filterByMarket(snapshots, undefined);

    expect(all).toHaveLength(26);
    expect(all.map((s) => s.instrument.id)).toEqual(
      snapshots.map((s) => s.instrument.id)
    );
  });

  it("splits the demo set exactly between US and JP", () => {
    const markets: readonly SupportedMarket[] = ["US", "JP"];
    const total = markets
      .map((m) => filterByMarket(snapshots, m).length)
      .reduce((a, b) => a + b, 0);

    expect(total).toBe(snapshots.length);
  });

  it("returns a new array rather than the input reference", () => {
    const all = filterByMarket(snapshots, undefined);

    expect(all).not.toBe(snapshots);
  });
});

describe("filterByAssetType composed with filterByMarket", () => {
  it("finds 4 Japanese demo ETFs", () => {
    const japaneseEtfs = filterByMarket(
      filterByAssetType(snapshots, "etf"),
      "JP"
    );

    expect(japaneseEtfs).toHaveLength(4);
    expect(japaneseEtfs.every((s) => s.assetType === "etf")).toBe(true);
    expect(japaneseEtfs.every((s) => s.instrument.listingMarket === "JP")).toBe(
      true
    );
    expect(japaneseEtfs.every((s) => s.instrument.currency === "JPY")).toBe(true);
  });

  it("finds 3 US demo indices", () => {
    const usIndices = filterByMarket(
      filterByAssetType(snapshots, "index"),
      "US"
    );

    expect(usIndices).toHaveLength(3);
    expect(usIndices.every((s) => s.assetType === "index")).toBe(true);
    expect(usIndices.every((s) => s.instrument.listingMarket === "US")).toBe(
      true
    );
  });

  it("produces the same result regardless of filter order", () => {
    const assetThenMarket = filterByMarket(
      filterByAssetType(snapshots, "stock"),
      "JP"
    ).map((s) => s.instrument.id);
    const marketThenAsset = filterByAssetType(
      filterByMarket(snapshots, "JP"),
      "stock"
    ).map((s) => s.instrument.id);

    expect(assetThenMarket).toEqual(marketThenAsset);
    expect(assetThenMarket).toHaveLength(6);
  });
});
