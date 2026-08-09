import { describe, expect, it } from "vitest";
import { paginate } from "@/lib/market-data/providers/demo/filters";
import { createDemoMarketDataProvider } from "@/lib/market-data/providers/demo/provider";

/** Deterministic fixture: 12 distinct values, independent of demo data. */
const twelveItems: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("paginate (pure function)", () => {
  it("returns the first page with full metadata and hasNextPage true", () => {
    const result = paginate(twelveItems, 1, 5);

    expect(result.items).toEqual([1, 2, 3, 4, 5]);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(12);
    expect(result.hasNextPage).toBe(true);
  });

  it("returns a middle page without duplicating first-page items", () => {
    const result = paginate(twelveItems, 2, 5);

    expect(result.items).toEqual([6, 7, 8, 9, 10]);
    expect(result.page).toBe(2);
    expect(result.total).toBe(12);
    expect(result.hasNextPage).toBe(true);
  });

  it("returns the final page partially filled with hasNextPage false", () => {
    const result = paginate(twelveItems, 3, 5);

    expect(result.items).toEqual([11, 12]);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(12);
    expect(result.hasNextPage).toBe(false);
  });

  it("returns empty items but valid metadata for a page beyond the available range", () => {
    const result = paginate(twelveItems, 9, 5);

    expect(result.items).toEqual([]);
    expect(result.page).toBe(9);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(12);
    expect(result.hasNextPage).toBe(false);
  });

  it("splits 12 items into pages of 5, 5 and 2 for pageSize 5", () => {
    const pageSizes = [1, 2, 3].map((page) => paginate(twelveItems, page, 5).items.length);

    expect(pageSizes).toEqual([5, 5, 2]);
  });

  it("covers every item exactly once when walking all pages in order", () => {
    const collected: number[] = [];
    for (const page of [1, 2, 3]) {
      collected.push(...paginate(twelveItems, page, 5).items);
    }

    expect(collected).toEqual([...twelveItems]);
    expect(new Set(collected).size).toBe(twelveItems.length);
  });

  it("reports total as the input length regardless of the requested page", () => {
    for (const page of [1, 2, 3, 4, 100]) {
      expect(paginate(twelveItems, page, 5).total).toBe(12);
    }
  });

  it("reports hasNextPage false when a single page holds every item", () => {
    const result = paginate(twelveItems, 1, 25);

    expect(result.items).toHaveLength(12);
    expect(result.hasNextPage).toBe(false);
  });

  it("handles an empty input list with valid metadata", () => {
    const result = paginate([], 1, 25);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.hasNextPage).toBe(false);
  });

  it("does not mutate or alias the caller's array", () => {
    const source = [1, 2, 3];
    const result = paginate(source, 1, 2);

    result.items.push(99);

    expect(source).toEqual([1, 2, 3]);
  });
});

describe("paginate over demo provider results", () => {
  const provider = createDemoMarketDataProvider();

  it("paginates the 12 demo stocks into pages of 5, 5 and 2", async () => {
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        provider.listInstruments({ assetType: "stock", page, pageSize: 5 })
      )
    );

    expect(pages.map((p) => p.items.length)).toEqual([5, 5, 2]);
    expect(pages.map((p) => p.total)).toEqual([12, 12, 12]);
    expect(pages.map((p) => p.hasNextPage)).toEqual([true, true, false]);
  });

  it("returns disjoint, ordered instrument ids across adjacent stock pages", async () => {
    const firstPage = await provider.listInstruments({
      assetType: "stock",
      page: 1,
      pageSize: 5,
    });
    const secondPage = await provider.listInstruments({
      assetType: "stock",
      page: 2,
      pageSize: 5,
    });

    const firstIds = firstPage.items.map((s) => s.instrument.id);
    const secondIds = secondPage.items.map((s) => s.instrument.id);

    expect(firstIds).toHaveLength(5);
    expect(secondIds).toHaveLength(5);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);

    const allStocks = await provider.listInstruments({
      assetType: "stock",
      page: 1,
      pageSize: 25,
    });
    const allIds = allStocks.items.map((s) => s.instrument.id);

    expect([...firstIds, ...secondIds]).toEqual(allIds.slice(0, 10));
  });

  it("returns empty items with valid metadata for a demo page beyond the range", async () => {
    const result = await provider.listInstruments({
      assetType: "index",
      page: 4,
      pageSize: 5,
    });

    expect(result.items).toEqual([]);
    expect(result.page).toBe(4);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(6);
    expect(result.hasNextPage).toBe(false);
  });
});
