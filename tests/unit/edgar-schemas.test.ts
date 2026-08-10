import { describe, expect, it } from "vitest";
import {
  companyFactsSchema,
  parseConcept,
  submissionsSchema,
  xbrlConceptSchema,
  xbrlFactSchema,
  type EdgarCompanyFacts,
} from "@/lib/research/edgar/schemas";
import fixtureJson from "@/tests/fixtures/providers/edgar/companyfacts.sample.json";

/**
 * Boundary-validation tests: EDGAR responses are untrusted `unknown` until a
 * schema accepts them, and a concept that fails validation must degrade to
 * null (missing) rather than reaching financial logic.
 */

const minimalSubmissions = {
  cik: "0000320193",
  name: "Fixture Manufacturing Co.",
  fiscalYearEnd: "1231",
  filings: {
    recent: {
      accessionNumber: ["0000999999-25-000010"],
      form: ["10-K"],
      filingDate: ["2025-02-14"],
      reportDate: ["2024-12-31"],
      primaryDocument: ["fixture-10k.htm"],
    },
  },
};

const validConcept = {
  label: "Net Income (Loss)",
  description: "Sanitized",
  units: {
    USD: [
      {
        start: "2024-01-01",
        end: "2024-12-31",
        val: 15000000,
        accn: "0000999999-25-000010",
        fy: 2024,
        fp: "FY",
        form: "10-K",
        filed: "2025-02-14",
      },
    ],
  },
};

describe("submissionsSchema", () => {
  it("accepts a minimal valid submissions payload", () => {
    const result = submissionsSchema.safeParse(minimalSubmissions);
    expect(result.success).toBe(true);
    expect(result.data?.filings.recent.form).toEqual(["10-K"]);
  });

  it("accepts a numeric cik and an absent fiscalYearEnd", () => {
    const result = submissionsSchema.safeParse({
      ...minimalSubmissions,
      cik: 320193,
      fiscalYearEnd: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.fiscalYearEnd ?? null).toBeNull();
  });

  it("accepts the optional description and items arrays", () => {
    const result = submissionsSchema.safeParse({
      ...minimalSubmissions,
      filings: {
        recent: {
          ...minimalSubmissions.filings.recent,
          primaryDocDescription: ["10-K"],
          items: [""],
        },
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.filings.recent.items).toEqual([""]);
  });

  it("rejects a payload missing filings.recent", () => {
    const result = submissionsSchema.safeParse({
      cik: "0000320193",
      name: "Fixture Manufacturing Co.",
      filings: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a recent block whose form list is not an array of strings", () => {
    const result = submissionsSchema.safeParse({
      ...minimalSubmissions,
      filings: {
        recent: { ...minimalSubmissions.filings.recent, form: "10-K" },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("xbrlFactSchema", () => {
  it("accepts an instant fact with no start date", () => {
    const result = xbrlFactSchema.safeParse({
      end: "2024-12-31",
      val: 61000000,
      accn: "0000999999-25-000010",
      form: "10-K",
      filed: "2025-02-14",
    });
    expect(result.success).toBe(true);
    expect(result.data?.start).toBeUndefined();
  });

  it("rejects a fact missing its period end", () => {
    const result = xbrlFactSchema.safeParse({
      start: "2024-01-01",
      val: 120000000,
      accn: "0000999999-25-000010",
      form: "10-K",
      filed: "2025-02-14",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a numeric-looking string value (no coercion at the boundary)", () => {
    const result = xbrlFactSchema.safeParse({
      end: "2024-12-31",
      val: "120000000",
      accn: "0000999999-25-000010",
      form: "10-K",
      filed: "2025-02-14",
    });
    expect(result.success).toBe(false);
  });
});

describe("xbrlConceptSchema", () => {
  it("accepts a well-formed concept", () => {
    const result = xbrlConceptSchema.safeParse(validConcept);
    expect(result.success).toBe(true);
    expect(result.data?.units["USD"]).toHaveLength(1);
  });

  it("accepts a concept with no label or description", () => {
    const result = xbrlConceptSchema.safeParse({ units: validConcept.units });
    expect(result.success).toBe(true);
  });

  it("rejects a concept whose fact is missing its period end", () => {
    const firstFact = validConcept.units.USD[0];
    if (firstFact === undefined) throw new Error("fixture concept has no fact");
    const { end: _end, ...withoutEnd } = firstFact;

    const result = xbrlConceptSchema.safeParse({
      units: { USD: [withoutEnd] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a concept whose fact value is a string", () => {
    const firstFact = validConcept.units.USD[0];
    if (firstFact === undefined) throw new Error("fixture concept has no fact");

    const result = xbrlConceptSchema.safeParse({
      units: { USD: [{ ...firstFact, val: "15000000" }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a concept with no units map", () => {
    expect(xbrlConceptSchema.safeParse({ label: "Broken" }).success).toBe(false);
  });
});

describe("companyFactsSchema", () => {
  it("parses the sanitized fixture, tolerating its unknown _comment key", () => {
    const result = companyFactsSchema.safeParse(fixtureJson);
    expect(result.success).toBe(true);
    expect(result.data?.cik).toBe(999999);
    expect(result.data?.entityName).toBe("Fixture Manufacturing Co.");
  });

  it("leaves concept bodies unvalidated until a concept is requested", () => {
    const facts = companyFactsSchema.parse(fixtureJson);
    expect(facts.facts["us-gaap"]?.["NetIncomeLoss"]).toBeDefined();
    expect(facts.facts["ifrs-full"]).toBeUndefined();
  });

  it("rejects a payload with a string cik", () => {
    const result = companyFactsSchema.safeParse({
      cik: "0000999999",
      entityName: "Fixture Manufacturing Co.",
      facts: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a payload with no facts object", () => {
    const result = companyFactsSchema.safeParse({
      cik: 999999,
      entityName: "Fixture Manufacturing Co.",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseConcept", () => {
  const facts = companyFactsSchema.parse(fixtureJson);

  it("returns a validated concept for a reported tag", () => {
    const concept = parseConcept(facts, "us-gaap", "NetIncomeLoss");
    expect(concept?.units["USD"]).toHaveLength(3);
    expect(concept?.label).toBe("Net Income (Loss)");
  });

  it("returns null for a tag the filer never reported", () => {
    expect(parseConcept(facts, "us-gaap", "OperatingIncomeLoss")).toBeNull();
    expect(
      parseConcept(facts, "us-gaap", "NetCashProvidedByUsedInOperatingActivities")
    ).toBeNull();
  });

  it("returns null for a taxonomy absent from the payload", () => {
    expect(parseConcept(facts, "ifrs-full", "NetIncomeLoss")).toBeNull();
  });

  it("returns null for a malformed concept instead of throwing", () => {
    const broken = withInjectedConcept("NetIncomeLoss", {
      label: "Net Income (Loss)",
      units: { USD: [{ end: "2024-12-31", val: "15000000" }] },
    });

    expect(parseConcept(broken, "us-gaap", "NetIncomeLoss")).toBeNull();
  });

  it("returns null when a concept is not an object at all", () => {
    const broken = withInjectedConcept("NetIncomeLoss", "not-a-concept");
    expect(parseConcept(broken, "us-gaap", "NetIncomeLoss")).toBeNull();
  });

  /** Clone the fixture and replace one concept body with untrusted input. */
  function withInjectedConcept(tag: string, body: unknown): EdgarCompanyFacts {
    const cloned = companyFactsSchema.parse(structuredClone(fixtureJson));
    const usGaap = cloned.facts["us-gaap"];
    if (usGaap === undefined) throw new Error("fixture has no us-gaap taxonomy");
    usGaap[tag] = body;
    return cloned;
  }
});
