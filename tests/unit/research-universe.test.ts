import { describe, expect, it } from "vitest";
import {
  getResearchCompany,
  paddedCik,
  RESEARCH_UNIVERSE,
} from "@/lib/research/universe";

describe("getResearchCompany", () => {
  it("resolves a known slug to its company record", () => {
    const apple = getResearchCompany("aapl");
    expect(apple?.cik).toBe(320193);
    expect(apple?.ticker).toBe("AAPL");
    expect(apple?.name).toBe("Apple Inc.");
  });

  it("returns null for an unknown slug", () => {
    expect(getResearchCompany("nope")).toBeNull();
    expect(getResearchCompany("")).toBeNull();
  });

  it("does not match on ticker case or uppercase slugs", () => {
    // Route slugs are lowercase; an uppercase ticker is not a valid ID.
    expect(getResearchCompany("AAPL")).toBeNull();
  });

  it("resolves every universe entry by its own id", () => {
    for (const company of RESEARCH_UNIVERSE) {
      expect(getResearchCompany(company.id)).toEqual(company);
    }
  });
});

describe("paddedCik", () => {
  it("pads a CIK to the ten digits EDGAR URLs require", () => {
    expect(paddedCik(320193)).toBe("0000320193");
    expect(paddedCik(18230)).toBe("0000018230");
  });

  it("always returns exactly ten characters for the universe", () => {
    for (const company of RESEARCH_UNIVERSE) {
      const padded = paddedCik(company.cik);
      expect(padded).toHaveLength(10);
      expect(padded).toMatch(/^\d{10}$/);
      expect(Number(padded)).toBe(company.cik);
    }
  });

  it("leaves an already ten-digit CIK unchanged", () => {
    expect(paddedCik(1652044)).toBe("0001652044");
    expect(paddedCik(1234567890)).toBe("1234567890");
  });
});

describe("RESEARCH_UNIVERSE integrity", () => {
  it("contains exactly ten curated companies", () => {
    expect(RESEARCH_UNIVERSE).toHaveLength(10);
  });

  it("uses unique lowercase slug ids", () => {
    const ids = RESEARCH_UNIVERSE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBe(id.toLowerCase());
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("uses unique positive integer CIKs", () => {
    const ciks = RESEARCH_UNIVERSE.map((c) => c.cik);
    expect(new Set(ciks).size).toBe(ciks.length);
    for (const cik of ciks) {
      expect(Number.isInteger(cik)).toBe(true);
      expect(cik).toBeGreaterThan(0);
    }
  });

  it("gives every company a unique ticker and a non-empty name", () => {
    const tickers = RESEARCH_UNIVERSE.map((c) => c.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
    for (const company of RESEARCH_UNIVERSE) {
      expect(company.ticker).toBe(company.ticker.toUpperCase());
      expect(company.name.length).toBeGreaterThan(0);
    }
  });
});
