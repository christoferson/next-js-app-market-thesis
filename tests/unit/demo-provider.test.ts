import { describe, expect, it } from "vitest";
import {
  createDemoMarketDataProvider,
  DEMO_PROVIDER_ID,
} from "@/lib/market-data/providers/demo/provider";
import { DEMO_AS_OF_DATE } from "@/data/demo/shared";
import type { AssetType } from "@/lib/domain";

const provider = createDemoMarketDataProvider();

describe("demo provider identity", () => {
  it('exposes the provider id "demo"', () => {
    expect(provider.id).toBe("demo");
    expect(DEMO_PROVIDER_ID).toBe("demo");
  });

  it("exposes a human-readable display name", () => {
    expect(provider.displayName).toBe("Demo Data");
  });
});

describe("demo provider listInstruments", () => {
  it("returns all 12 demo stocks with demo provenance pinned to the fixture date", async () => {
    const result = await provider.listInstruments({
      assetType: "stock",
      page: 1,
      pageSize: 25,
    });

    expect(result.items).toHaveLength(12);
    expect(result.total).toBe(12);
    expect(result.hasNextPage).toBe(false);
    expect(result.items.every((s) => s.provenance.isDemo === true)).toBe(true);
    expect(result.items.every((s) => s.provenance.asOf === DEMO_AS_OF_DATE)).toBe(
      true
    );
    expect(result.items.every((s) => s.provenance.provider === "demo")).toBe(true);
  });

  it("marks every demo snapshot across all asset types as demo data", async () => {
    const assetTypes: readonly AssetType[] = ["stock", "etf", "index"];
    const pages = await Promise.all(
      assetTypes.map((assetType) =>
        provider.listInstruments({ assetType, page: 1, pageSize: 25 })
      )
    );
    const everySnapshot = pages.flatMap((p) => p.items);

    expect(everySnapshot).toHaveLength(26);
    expect(everySnapshot.every((s) => s.provenance.isDemo === true)).toBe(true);
    expect(everySnapshot.every((s) => s.provenance.asOf === DEMO_AS_OF_DATE)).toBe(
      true
    );
  });

  it("returns 26 unique instrument ids across the three asset types", async () => {
    const assetTypes: readonly AssetType[] = ["stock", "etf", "index"];
    const pages = await Promise.all(
      assetTypes.map((assetType) =>
        provider.listInstruments({ assetType, page: 1, pageSize: 100 })
      )
    );
    const ids = pages.flatMap((p) => p.items.map((s) => s.instrument.id));

    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(26);
  });

  it("marks every index as a non-tradable reference benchmark", async () => {
    const result = await provider.listInstruments({
      assetType: "index",
      page: 1,
      pageSize: 25,
    });

    expect(result.items).toHaveLength(6);
    expect(result.items.every((s) => s.assetType === "index")).toBe(true);
    expect(result.items.every((s) => s.instrument.isTradable === false)).toBe(
      true
    );
  });

  it("keeps stocks and ETFs tradable", async () => {
    const assetTypes: readonly AssetType[] = ["stock", "etf"];
    const pages = await Promise.all(
      assetTypes.map((assetType) =>
        provider.listInstruments({ assetType, page: 1, pageSize: 25 })
      )
    );

    expect(
      pages.flatMap((p) => p.items).every((s) => s.instrument.isTradable === true)
    ).toBe(true);
  });
});

describe("demo provider filtering composed with pagination", () => {
  it("paginates Japanese stocks with pageSize 4 into 4 then 2 items", async () => {
    const firstPage = await provider.listInstruments({
      assetType: "stock",
      market: "JP",
      page: 1,
      pageSize: 4,
    });
    const secondPage = await provider.listInstruments({
      assetType: "stock",
      market: "JP",
      page: 2,
      pageSize: 4,
    });

    expect(firstPage.items).toHaveLength(4);
    expect(firstPage.total).toBe(6);
    expect(firstPage.hasNextPage).toBe(true);

    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.total).toBe(6);
    expect(secondPage.hasNextPage).toBe(false);

    const firstIds = firstPage.items.map((s) => s.instrument.id);
    const secondIds = secondPage.items.map((s) => s.instrument.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(6);
  });

  it("returns only US instruments of the requested type when market is US", async () => {
    const result = await provider.listInstruments({
      assetType: "etf",
      market: "US",
      page: 1,
      pageSize: 25,
    });

    expect(result.items).toHaveLength(4);
    expect(result.items.every((s) => s.assetType === "etf")).toBe(true);
    expect(result.items.every((s) => s.instrument.listingMarket === "US")).toBe(
      true
    );
    expect(result.items.every((s) => s.instrument.currency === "USD")).toBe(true);
  });

  it("returns both markets when market is omitted", async () => {
    const result = await provider.listInstruments({
      assetType: "etf",
      page: 1,
      pageSize: 25,
    });

    const markets = new Set(result.items.map((s) => s.instrument.listingMarket));

    expect(result.total).toBe(8);
    expect([...markets].sort()).toEqual(["JP", "US"]);
  });
});

describe("demo provider determinism", () => {
  it("returns an identical id sequence for two identical queries", async () => {
    const query = { assetType: "stock", page: 1, pageSize: 25 } as const;
    const first = await provider.listInstruments(query);
    const second = await provider.listInstruments(query);

    expect(first.items.map((s) => s.instrument.id)).toEqual(
      second.items.map((s) => s.instrument.id)
    );
  });

  it("returns identical results from two separately created provider instances", async () => {
    const query = { assetType: "index", market: "JP", page: 1, pageSize: 10 } as const;
    const first = await createDemoMarketDataProvider().listInstruments(query);
    const second = await createDemoMarketDataProvider().listInstruments(query);

    expect(first.items.map((s) => s.instrument.id)).toEqual(
      second.items.map((s) => s.instrument.id)
    );
    expect(first.total).toBe(second.total);
  });
});
