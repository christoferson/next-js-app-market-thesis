import { describe, expect, it } from "vitest";
import {
  buildAnnualChanges,
  type FinancialLineChange,
} from "@/lib/research/changes";
import {
  companyFactsSchema,
  type EdgarCompanyFacts,
} from "@/lib/research/edgar/schemas";
import type { SelectedFact } from "@/lib/research/edgar/facts";
import fixtureJson from "@/tests/fixtures/providers/edgar/companyfacts.sample.json";

const companyFacts = companyFactsSchema.parse(fixtureJson);
const changes = buildAnnualChanges(companyFacts);

/** Look up a line by metric ID; a missing line is a contract failure. */
function lineFor(metricId: string): FinancialLineChange {
  const line = changes.find((c) => c.metricId === metricId);
  if (line === undefined) throw new Error(`Missing change line: ${metricId}`);
  return line;
}

function requireFact(fact: SelectedFact | null, label: string): SelectedFact {
  if (fact === null) throw new Error(`Expected a fact for ${label}`);
  return fact;
}

describe("buildAnnualChanges line definitions", () => {
  it("returns exactly the seven R1 line items in definition order", () => {
    expect(changes.map((c) => c.metricId)).toEqual([
      "revenue",
      "operatingIncome",
      "netIncome",
      "dilutedEps",
      "operatingCashFlow",
      "stockholdersEquity",
      "dilutedShares",
    ]);
  });

  it("labels each line and declares a unit kind that drives formatting", () => {
    expect(changes.map((c) => c.label)).toEqual([
      "Revenue",
      "Operating income",
      "Net income",
      "Diluted EPS",
      "Operating cash flow",
      "Stockholders' equity",
      "Diluted shares outstanding",
    ]);
    expect(changes.map((c) => c.unitKind)).toEqual([
      "currency",
      "currency",
      "currency",
      "perShare",
      "currency",
      "currency",
      "shares",
    ]);
  });
});

describe("buildAnnualChanges revenue", () => {
  it("compares FY2024 against the restated FY2023 comparative", () => {
    const revenue = lineFor("revenue");
    const current = requireFact(revenue.current, "revenue current");
    const prior = requireFact(revenue.prior, "revenue prior");

    expect(current.value).toBe(120000000);
    expect(current.periodEnd).toBe("2024-12-31");
    expect(prior.value).toBe(100500000);
    expect(prior.periodEnd).toBe("2023-12-31");
  });

  it("computes the absolute and relative change deterministically", () => {
    const revenue = lineFor("revenue");
    expect(revenue.absoluteChange).toBe(19500000);
    expect(revenue.relativeChange).toBeCloseTo(0.19403, 5);
  });

  it("sources revenue from the ASC 606 tag, not the legacy tag", () => {
    const revenue = lineFor("revenue");
    expect(requireFact(revenue.current, "revenue current").sourceTag).toBe(
      "RevenueFromContractWithCustomerExcludingAssessedTax"
    );
  });
});

describe("buildAnnualChanges net income", () => {
  it("uses the 10-K/A restated prior value as the comparison base", () => {
    const netIncome = lineFor("netIncome");
    const prior = requireFact(netIncome.prior, "netIncome prior");

    expect(prior.value).toBe(8500000);
    expect(prior.form).toBe("10-K/A");
    expect(requireFact(netIncome.current, "netIncome current").value).toBe(
      15000000
    );
    expect(netIncome.absoluteChange).toBe(6500000);
  });

  it("derives the growth rate from the restated base", () => {
    const netIncome = lineFor("netIncome");
    expect(netIncome.relativeChange).toBeCloseTo(0.76471, 5);
  });
});

describe("buildAnnualChanges other reported lines", () => {
  it("reports diluted EPS in per-share units", () => {
    const eps = lineFor("dilutedEps");
    expect(requireFact(eps.current, "eps current").value).toBe(1.5);
    expect(requireFact(eps.current, "eps current").unit).toBe("USD/shares");
    expect(requireFact(eps.prior, "eps prior").value).toBe(0.9);
    expect(eps.absoluteChange).toBeCloseTo(0.6, 10);
    expect(eps.relativeChange).toBeCloseTo(0.66667, 5);
  });

  it("reports stockholders' equity from the instant series", () => {
    const equity = lineFor("stockholdersEquity");
    expect(requireFact(equity.current, "equity current").value).toBe(61000000);
    expect(requireFact(equity.current, "equity current").periodStart).toBeNull();
    expect(requireFact(equity.prior, "equity prior").value).toBe(50000000);
    expect(equity.absoluteChange).toBe(11000000);
    expect(equity.relativeChange).toBeCloseTo(0.22, 10);
  });

  it("treats an unchanged diluted share count as a real zero change, not missing", () => {
    const shares = lineFor("dilutedShares");
    expect(requireFact(shares.current, "shares current").value).toBe(10000000);
    expect(requireFact(shares.prior, "shares prior").value).toBe(10000000);
    expect(shares.absoluteChange).toBe(0);
    expect(shares.relativeChange).toBe(0);
    // A zero change must not be conflated with an unavailable change.
    expect(shares.absoluteChange).not.toBeNull();
    expect(shares.relativeChange).not.toBeNull();
  });
});

describe("buildAnnualChanges unreported concepts", () => {
  it("keeps unreported lines present with nulls rather than omitting them", () => {
    for (const metricId of ["operatingIncome", "operatingCashFlow"]) {
      const line = lineFor(metricId);
      expect(line.current).toBeNull();
      expect(line.prior).toBeNull();
      expect(line.absoluteChange).toBeNull();
      expect(line.relativeChange).toBeNull();
    }
  });

  it("never substitutes zero for an unreported concept", () => {
    const operatingIncome = lineFor("operatingIncome");
    expect(operatingIncome.absoluteChange).not.toBe(0);
    expect(operatingIncome.relativeChange).not.toBe(0);
  });
});

describe("buildAnnualChanges provenance", () => {
  it("carries full XBRL provenance on every non-null value", () => {
    const facts = changes.flatMap((line) =>
      [line.current, line.prior].filter(
        (fact): fact is SelectedFact => fact !== null
      )
    );

    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.accessionNumber).toMatch(/^\d{10}-\d{2}-\d{6}$/);
      expect(fact.form).toMatch(/^10-K(\/A)?$/);
      expect(fact.filedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fact.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fact.sourceTag.length).toBeGreaterThan(0);
      expect(fact.unit.length).toBeGreaterThan(0);
    }
  });

  it("orders current after prior in time on every populated line", () => {
    for (const line of changes) {
      if (line.current === null || line.prior === null) continue;
      expect(line.current.periodEnd > line.prior.periodEnd).toBe(true);
    }
  });
});

describe("buildAnnualChanges zero-base periods", () => {
  /** Minimal schema-valid companyfacts with a single annual revenue pair. */
  function revenueOnlyFacts(
    priorValue: number,
    currentValue: number
  ): EdgarCompanyFacts {
    return companyFactsSchema.parse({
      cik: 999998,
      entityName: "Zero Base Fixture Co.",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            label: "Revenue from Contract with Customer",
            units: {
              USD: [
                {
                  start: "2023-01-01",
                  end: "2023-12-31",
                  val: priorValue,
                  accn: "0000999998-24-000010",
                  fy: 2023,
                  fp: "FY",
                  form: "10-K",
                  filed: "2024-02-15",
                },
                {
                  start: "2024-01-01",
                  end: "2024-12-31",
                  val: currentValue,
                  accn: "0000999998-25-000010",
                  fy: 2024,
                  fp: "FY",
                  form: "10-K",
                  filed: "2025-02-14",
                },
              ],
            },
          },
        },
      },
    });
  }

  it("returns a null growth rate when the prior base is zero", () => {
    const revenue = buildAnnualChanges(revenueOnlyFacts(0, 5000000)).find(
      (line) => line.metricId === "revenue"
    );

    expect(revenue?.current?.value).toBe(5000000);
    expect(revenue?.prior?.value).toBe(0);
    // The absolute change is still meaningful; the ratio is not.
    expect(revenue?.absoluteChange).toBe(5000000);
    expect(revenue?.relativeChange).toBeNull();
  });

  it("uses the absolute magnitude of a negative base for the growth rate", () => {
    const revenue = buildAnnualChanges(revenueOnlyFacts(-2000000, 1000000)).find(
      (line) => line.metricId === "revenue"
    );

    expect(revenue?.absoluteChange).toBe(3000000);
    expect(revenue?.relativeChange).toBeCloseTo(1.5, 10);
  });
});

describe("buildAnnualChanges numeric hygiene", () => {
  it("emits no NaN or Infinity in any numeric field", () => {
    const numbers: number[] = [];
    for (const line of changes) {
      for (const candidate of [line.absoluteChange, line.relativeChange]) {
        if (candidate !== null) numbers.push(candidate);
      }
      for (const fact of [line.current, line.prior]) {
        if (fact !== null) numbers.push(fact.value);
      }
    }

    expect(numbers.length).toBeGreaterThan(0);
    for (const value of numbers) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  it("produces identical output for repeated builds", () => {
    expect(buildAnnualChanges(companyFacts)).toEqual(
      buildAnnualChanges(companyFacts)
    );
  });
});
