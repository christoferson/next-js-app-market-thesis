import { describe, expect, it } from "vitest";
import { selectAnnualSeries, type AnnualSeries } from "@/lib/research/edgar/facts";
import { companyFactsSchema } from "@/lib/research/edgar/schemas";
import fixtureJson from "@/tests/fixtures/providers/edgar/companyfacts.sample.json";

/**
 * Fact-selection tests run against the sanitized EDGAR fixture, which
 * deliberately reproduces the live-data pitfalls documented in facts.ts:
 * fy/fp duplicates across filings, an amended restatement, concept drift,
 * quarterly facts inside a 10-K, and comparative instants.
 *
 * The fixture is validated through the real schema (never cast) so a fixture
 * that drifts out of contract fails loudly here rather than silently.
 */
const companyFacts = companyFactsSchema.parse(fixtureJson);

const ASC_606_REVENUE = "RevenueFromContractWithCustomerExcludingAssessedTax";

/** Narrow a nullable series; a null here means the selection itself failed. */
function requireSeries(series: AnnualSeries | null): AnnualSeries {
  if (series === null) throw new Error("expected an annual series, got null");
  return series;
}

describe("selectAnnualSeries revenue with tag fallback", () => {
  it("prefers the ASC 606 tag and records it as the source tag", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE, "Revenues", "SalesRevenueNet"],
        kind: "duration",
      })
    );

    expect(series.sourceTag).toBe(ASC_606_REVENUE);
    expect(series.facts.every((f) => f.sourceTag === ASC_606_REVENUE)).toBe(true);
  });

  it("returns the two annual periods, most recent first", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE, "Revenues"],
        kind: "duration",
      })
    );

    expect(series.facts).toHaveLength(2);
    expect(series.facts.map((f) => f.periodEnd)).toEqual([
      "2024-12-31",
      "2023-12-31",
    ]);
    expect(series.facts.map((f) => f.periodStart)).toEqual([
      "2024-01-01",
      "2023-01-01",
    ]);
    expect(series.facts.every((f) => f.unit === "USD")).toBe(true);
  });

  it("dedupes the duplicated 2023 period to the later-filed comparative value", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
      })
    );

    const prior = series.facts[1];
    expect(prior?.periodEnd).toBe("2023-12-31");
    // The FY2023 10-K reported 100000000; the FY2024 10-K's comparative
    // (filed later) reports 100500000 and must win.
    expect(prior?.value).toBe(100500000);
    expect(prior?.filedDate).toBe("2025-02-14");
    expect(prior?.accessionNumber).toBe("0000999999-25-000010");
  });

  it("excludes the 10-Q fact and the Q4 duration reported inside the 10-K", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
      })
    );

    expect(series.facts.some((f) => f.form === "10-Q")).toBe(false);
    // The Q4 stub (2024-10-01 → 2024-12-31) shares the 10-K form but is far
    // short of an annual duration.
    expect(series.facts.some((f) => f.periodStart === "2024-10-01")).toBe(false);
    expect(series.facts.some((f) => f.value === 35000000)).toBe(false);
    expect(series.facts.some((f) => f.value === 66000000)).toBe(false);
  });
});

describe("selectAnnualSeries concept drift", () => {
  it("returns the legacy Revenues fact when only that tag is requested", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["Revenues"],
        kind: "duration",
      })
    );

    expect(series.sourceTag).toBe("Revenues");
    expect(series.facts).toHaveLength(1);
    expect(series.facts[0]?.value).toBe(80000000);
    expect(series.facts[0]?.periodEnd).toBe("2021-12-31");
    expect(series.facts[0]?.accessionNumber).toBe("0000999999-22-000010");
  });

  it("falls through an unreported tag to the next tag in the list", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["NonexistentTag", "Revenues"],
        kind: "duration",
      })
    );

    expect(series.sourceTag).toBe("Revenues");
    expect(series.facts).toHaveLength(1);
    expect(series.facts[0]?.value).toBe(80000000);
  });
});

describe("selectAnnualSeries restatements", () => {
  it("resolves 2023 net income to the 10-K/A restated value", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["NetIncomeLoss", "ProfitLoss"],
        kind: "duration",
      })
    );

    expect(series.facts.map((f) => f.periodEnd)).toEqual([
      "2024-12-31",
      "2023-12-31",
    ]);
    expect(series.facts[0]?.value).toBe(15000000);

    const restated = series.facts[1];
    expect(restated?.value).toBe(8500000);
    expect(restated?.form).toBe("10-K/A");
    expect(restated?.filedDate).toBe("2024-06-20");
    expect(restated?.accessionNumber).toBe("0000999999-24-000031");
  });

  it("never returns the superseded original 2023 net income", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["NetIncomeLoss"],
        kind: "duration",
      })
    );

    expect(series.facts.some((f) => f.value === 9000000)).toBe(false);
  });
});

describe("selectAnnualSeries instant concepts", () => {
  it("returns fiscal-year-end equity instants, most recent first, deduped", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["StockholdersEquity"],
        kind: "instant",
      })
    );

    expect(series.facts).toHaveLength(2);
    expect(series.facts.map((f) => f.periodEnd)).toEqual([
      "2024-12-31",
      "2023-12-31",
    ]);
    expect(series.facts.map((f) => f.value)).toEqual([61000000, 50000000]);
  });

  it("reports no period start for instant facts", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["StockholdersEquity"],
        kind: "instant",
      })
    );

    expect(series.facts.every((f) => f.periodStart === null)).toBe(true);
  });

  it("keeps the comparative instant from the later filing", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["StockholdersEquity"],
        kind: "instant",
      })
    );

    expect(series.facts[1]?.accessionNumber).toBe("0000999999-25-000010");
    expect(series.facts[1]?.filedDate).toBe("2025-02-14");
  });

  it("finds no instant facts when a duration concept is read as instant", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "instant",
      })
    ).toBeNull();
  });

  it("finds no duration facts when an instant concept is read as duration", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: ["StockholdersEquity"],
        kind: "duration",
      })
    ).toBeNull();
  });
});

describe("selectAnnualSeries missing data", () => {
  it("returns null for a concept the filer never reported", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: ["OperatingIncomeLoss"],
        kind: "duration",
      })
    ).toBeNull();

    expect(
      selectAnnualSeries(companyFacts, {
        tags: ["NetCashProvidedByUsedInOperatingActivities"],
        kind: "duration",
      })
    ).toBeNull();
  });

  it("returns null when every requested tag is absent", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: ["NopeOne", "NopeTwo"],
        kind: "duration",
      })
    ).toBeNull();
  });

  it("returns null when the concept has no fact in a preferred unit", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
        units: ["JPY"],
      })
    ).toBeNull();
  });

  it("returns null for the wrong taxonomy", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
        taxonomy: "ifrs-full",
      })
    ).toBeNull();
  });

  it("selects per-share and share units when requested explicitly", () => {
    const eps = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["EarningsPerShareDiluted"],
        kind: "duration",
        units: ["USD/shares"],
      })
    );
    expect(eps.facts.map((f) => f.value)).toEqual([1.5, 0.9]);
    expect(eps.facts.every((f) => f.unit === "USD/shares")).toBe(true);

    const shares = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
        kind: "duration",
        units: ["shares"],
      })
    );
    expect(shares.facts.map((f) => f.value)).toEqual([10000000, 10000000]);
    expect(shares.facts.every((f) => f.unit === "shares")).toBe(true);
  });
});

describe("selectAnnualSeries limit", () => {
  it("truncates to the requested number of periods, keeping the newest", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
        limit: 1,
      })
    );

    expect(series.facts).toHaveLength(1);
    expect(series.facts[0]?.periodEnd).toBe("2024-12-31");
    expect(series.facts[0]?.value).toBe(120000000);
  });

  it("returns every available period when the limit exceeds the series length", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
        limit: 10,
      })
    );

    expect(series.facts).toHaveLength(2);
  });

  it("returns nothing when the limit is zero, rather than an empty series", () => {
    expect(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
        limit: 0,
      })
    ).toBeNull();
  });
});

describe("selectAnnualSeries determinism", () => {
  it("returns identical results for repeated identical calls", () => {
    const first = selectAnnualSeries(companyFacts, {
      tags: [ASC_606_REVENUE, "Revenues"],
      kind: "duration",
    });
    const second = selectAnnualSeries(companyFacts, {
      tags: [ASC_606_REVENUE, "Revenues"],
      kind: "duration",
    });

    expect(first).toEqual(second);
  });

  it("never emits a non-finite value", () => {
    const series = requireSeries(
      selectAnnualSeries(companyFacts, {
        tags: [ASC_606_REVENUE],
        kind: "duration",
      })
    );

    expect(series.facts.every((f) => Number.isFinite(f.value))).toBe(true);
  });
});
