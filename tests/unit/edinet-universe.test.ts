import { describe, expect, it } from "vitest";
import {
  getJapanResearchCompany,
  JAPAN_RESEARCH_UNIVERSE,
} from "@/lib/research/edinet/universe";

/**
 * The Japanese universe is the join between route slugs, EDINET filer codes,
 * and TSE tickers. EDINET returns a 5-digit securities code (4-digit ticker +
 * trailing zero), so the ticker/secCode relationship is an invariant worth
 * pinning: a mismatch would silently point a page at the wrong filer.
 */

describe("getJapanResearchCompany", () => {
  it("resolves a known slug to its company record", () => {
    const nintendo = getJapanResearchCompany("nintendo");
    expect(nintendo?.edinetCode).toBe("E02367");
    expect(nintendo?.ticker).toBe("7974");
    expect(nintendo?.secCode).toBe("79740");
    expect(nintendo?.name).toBe("Nintendo Co., Ltd.");
    expect(nintendo?.nativeName).toBe("任天堂株式会社");
  });

  it("returns null for an unknown slug", () => {
    expect(getJapanResearchCompany("nope")).toBeNull();
    expect(getJapanResearchCompany("")).toBeNull();
  });

  it("does not resolve a ticker, securities code, or EDINET code as a slug", () => {
    expect(getJapanResearchCompany("7974")).toBeNull();
    expect(getJapanResearchCompany("79740")).toBeNull();
    expect(getJapanResearchCompany("E02367")).toBeNull();
  });

  it("is case-sensitive on the lowercase route slug", () => {
    expect(getJapanResearchCompany("Nintendo")).toBeNull();
    expect(getJapanResearchCompany("FAST-RETAILING")).toBeNull();
  });

  it("resolves every universe entry by its own id", () => {
    for (const company of JAPAN_RESEARCH_UNIVERSE) {
      expect(getJapanResearchCompany(company.id)).toEqual(company);
    }
  });
});

describe("JAPAN_RESEARCH_UNIVERSE integrity", () => {
  it("contains exactly six curated companies", () => {
    expect(JAPAN_RESEARCH_UNIVERSE).toHaveLength(6);
  });

  it("uses unique lowercase slug ids", () => {
    const ids = JAPAN_RESEARCH_UNIVERSE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBe(id.toLowerCase());
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("uses unique EDINET codes in the E + five digit format", () => {
    const codes = JAPAN_RESEARCH_UNIVERSE.map((c) => c.edinetCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^E\d{5}$/);
    }
  });

  it("uses unique five-character securities codes ending in zero", () => {
    const secCodes = JAPAN_RESEARCH_UNIVERSE.map((c) => c.secCode);
    expect(new Set(secCodes).size).toBe(secCodes.length);
    for (const secCode of secCodes) {
      expect(secCode).toHaveLength(5);
      expect(secCode).toMatch(/^\d{4}0$/);
      expect(secCode.endsWith("0")).toBe(true);
    }
  });

  it("derives each ticker from its securities code minus the trailing zero", () => {
    for (const company of JAPAN_RESEARCH_UNIVERSE) {
      expect(company.ticker).toBe(company.secCode.slice(0, 4));
      expect(company.secCode).toBe(`${company.ticker}0`);
      expect(company.ticker).toMatch(/^\d{4}$/);
    }
  });

  it("uses unique tickers", () => {
    const tickers = JAPAN_RESEARCH_UNIVERSE.map((c) => c.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("gives every company a non-empty English name and native name", () => {
    for (const company of JAPAN_RESEARCH_UNIVERSE) {
      expect(company.name.trim().length).toBeGreaterThan(0);
      expect(company.nativeName.trim().length).toBeGreaterThan(0);
      // The native name must actually be Japanese, not a Latin fallback.
      expect(company.nativeName).toMatch(/[ぁ-んァ-ヶ一-龠]/);
    }
  });

  it("uses unique English and native names", () => {
    const names = JAPAN_RESEARCH_UNIVERSE.map((c) => c.name);
    const nativeNames = JAPAN_RESEARCH_UNIVERSE.map((c) => c.nativeName);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(nativeNames).size).toBe(nativeNames.length);
  });
});
