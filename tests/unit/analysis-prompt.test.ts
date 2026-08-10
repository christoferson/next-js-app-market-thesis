import { describe, expect, it } from "vitest";
import {
  MAX_SECTION_CHARS,
  PROMPT_VERSION,
  comparisonBaseSchema,
  buildSystemPrompt,
  buildUserPrompt,
  comparisonJsonSchema,
  comparisonOutputSchema,
  type ComparisonOutput,
} from "@/lib/research/analysis/prompt";
import type { NarrativeComparisonRequest } from "@/lib/research/analysis/types";

/**
 * The prompt module is the provenance contract: PROMPT_VERSION is stored on
 * every analysis, so any drift in prompt text or output schema must be a
 * deliberate version bump. The wire JSON Schema and the Zod schema are
 * separately authored, so they are cross-checked structurally here.
 */

const request: NarrativeComparisonRequest = {
  companyName: "Fixture Manufacturing Co.",
  sectionTitle: "Item 1A. Risk Factors",
  currentPeriodLabel: "FY2024 (filed 2025-02-14)",
  priorPeriodLabel: "FY2023 (filed 2024-02-16)",
  currentText: "Supply-chain concentration increased during the year.",
  priorText: "Supply-chain concentration was described as stable.",
};

const validOutput: ComparisonOutput = {
  findings: [
    {
      classification: "REPORTED_FACT",
      changeType: "added",
      summary: "A new risk factor on single-source suppliers was added.",
      currentEvidence: "we rely on a single source for certain components",
      priorEvidence: null,
    },
    {
      classification: "AI_INTERPRETATION",
      changeType: "modified",
      summary: "Language around supplier concentration became more specific.",
      currentEvidence: "increased during the year",
      priorEvidence: "described as stable",
    },
  ],
  overallSummary:
    "The section adds supplier-concentration detail and rewords the " +
    "existing discussion. Other risk factors are substantially unchanged.",
};

function makeFinding(
  overrides: Partial<ComparisonOutput["findings"][number]> = {}
): Record<string, unknown> {
  return {
    classification: "MANAGEMENT_CLAIM",
    changeType: "modified",
    summary: "Management restated its expectation for input costs.",
    currentEvidence: null,
    priorEvidence: null,
    ...overrides,
  };
}

describe("PROMPT_VERSION", () => {
  it("is the pinned R2 version", () => {
    // Changing the prompt text or output schema requires bumping this value
    // and updating this assertion deliberately.
    expect(PROMPT_VERSION).toBe("narrative-comparison-v2");
  });

  it("is a non-empty stable identifier", () => {
    expect(PROMPT_VERSION).toMatch(/^[a-z0-9-]+-v\d+$/);
  });
});

describe("MAX_SECTION_CHARS", () => {
  it("is the pinned per-section cap", () => {
    expect(MAX_SECTION_CHARS).toBe(120_000);
  });
});

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("is deterministic across calls", () => {
    expect(buildSystemPrompt()).toBe(prompt);
    expect(buildSystemPrompt()).toBe(buildSystemPrompt());
  });

  it("names all three classifications", () => {
    expect(prompt).toContain("REPORTED_FACT");
    expect(prompt).toContain("MANAGEMENT_CLAIM");
    expect(prompt).toContain("AI_INTERPRETATION");
  });

  it("mentions 'buy' only inside the prohibition instruction", () => {
    expect(prompt).toContain("Never use words like buy");
    const occurrences = prompt.match(/\bbuy\b/gi) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("prohibits the other promotional and predictive terms", () => {
    for (const word of [
      "sell",
      "bullish",
      "bearish",
      "guaranteed",
      "opportunity",
    ]) {
      expect(prompt).toContain(word);
    }
    expect(prompt).toContain("predict price moves");
  });

  it("forbids advice and financial calculation", () => {
    expect(prompt).toContain("do not");
    expect(prompt).toContain("Do not calculate financial ratios or scores.");
  });

  it("caps the number of findings consistently with the output schema", () => {
    expect(prompt).toContain("at most 15");
  });

  it("asks for verbatim evidence", () => {
    expect(prompt).toContain("verbatim evidence");
  });
});

describe("buildUserPrompt content", () => {
  const prompt = buildUserPrompt(request);

  it("includes the company name and section title", () => {
    expect(prompt).toContain("Company: Fixture Manufacturing Co.");
    expect(prompt).toContain("Section: Item 1A. Risk Factors");
  });

  it("includes both period labels", () => {
    expect(prompt).toContain(request.priorPeriodLabel);
    expect(prompt).toContain(request.currentPeriodLabel);
  });

  it("includes both section texts", () => {
    expect(prompt).toContain(request.priorText);
    expect(prompt).toContain(request.currentText);
  });

  it("places the prior filing before the current filing", () => {
    const priorIndex = prompt.indexOf("=== PRIOR FILING");
    const currentIndex = prompt.indexOf("=== CURRENT FILING");
    expect(priorIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(priorIndex);
    expect(prompt.indexOf(request.priorText)).toBeLessThan(
      prompt.indexOf(request.currentText)
    );
  });

  it("names the structured-output tool", () => {
    expect(prompt).toContain("report_comparison");
  });

  it("is deterministic for the same request", () => {
    expect(buildUserPrompt(request)).toBe(prompt);
  });
});

describe("buildUserPrompt clipping", () => {
  /**
   * Text of exactly `length` characters carrying three markers: at the start,
   * ending exactly at the cap, and at the very end. Only the last must be lost.
   */
  function markedText(length: number, label: string): string {
    const head = `HEAD_${label}`;
    const nearCap = `NEARCAP_${label}`;
    const tail = `TAIL_${label}`;
    const body = "x".repeat(length);
    const withHead = head + body.slice(head.length);
    const withNearCap =
      withHead.slice(0, MAX_SECTION_CHARS - nearCap.length) +
      nearCap +
      withHead.slice(MAX_SECTION_CHARS);
    return withNearCap.slice(0, length - tail.length) + tail;
  }

  const overLength = MAX_SECTION_CHARS + 1000;
  const oversized: NarrativeComparisonRequest = {
    ...request,
    currentText: markedText(overLength, "CUR"),
    priorText: markedText(overLength, "PRI"),
  };

  it("keeps text up to the cap and drops the tail for both sections", () => {
    expect(oversized.currentText).toHaveLength(overLength);
    expect(oversized.priorText).toHaveLength(overLength);

    const prompt = buildUserPrompt(oversized);

    expect(prompt).toContain("NEARCAP_CUR");
    expect(prompt).toContain("NEARCAP_PRI");
    expect(prompt).toContain("HEAD_CUR");
    expect(prompt).toContain("HEAD_PRI");
    expect(prompt).not.toContain("TAIL_CUR");
    expect(prompt).not.toContain("TAIL_PRI");
  });

  it("clips only the oversized side", () => {
    const prompt = buildUserPrompt({
      ...request,
      currentText: markedText(overLength, "CUR"),
      priorText: "Short prior section. TAIL_PRI",
    });

    expect(prompt).not.toContain("TAIL_CUR");
    expect(prompt).toContain("TAIL_PRI");
  });

  it("leaves text at exactly the cap untouched", () => {
    const atCap = "x".repeat(MAX_SECTION_CHARS - 8) + "TAIL_CUR";
    const prompt = buildUserPrompt({ ...request, currentText: atCap });
    expect(atCap).toHaveLength(MAX_SECTION_CHARS);
    expect(prompt).toContain("TAIL_CUR");
  });
});

describe("comparisonOutputSchema", () => {
  it("accepts a valid payload", () => {
    const result = comparisonOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    expect(result.data?.findings).toHaveLength(2);
  });

  it("accepts zero findings", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: [],
      overallSummary: "The sections are substantially identical.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null evidence on either side", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: [
        makeFinding({ currentEvidence: null, priorEvidence: null }),
        makeFinding({ currentEvidence: "quoted", priorEvidence: null }),
      ],
      overallSummary: "Evidence is unavailable for one change.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects omitted evidence keys (null must be explicit)", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: [
        {
          classification: "REPORTED_FACT",
          changeType: "added",
          summary: "A new risk factor was added.",
        },
      ],
      overallSummary: "One addition.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a classification outside the enum", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ classification: "OPINION" as never })],
      overallSummary: "Invalid classification.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a changeType outside the enum", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ changeType: "unchanged" as never })],
      overallSummary: "Invalid change type.",
    });
    expect(result.success).toBe(false);
  });

  // v2 semantics: an over-long or over-populated response is a PAID model
  // call — length problems are clipped after validation rather than
  // rejected; only structural problems (enums, missing fields) reject.
  it("keeps 15 findings and clips a 16th instead of rejecting", () => {
    const build = (count: number) => ({
      findings: Array.from({ length: count }, () => makeFinding()),
      overallSummary: "Many changes.",
    });

    const atLimit = comparisonOutputSchema.safeParse(build(15));
    expect(atLimit.success).toBe(true);
    expect(atLimit.data?.findings).toHaveLength(15);

    const overLimit = comparisonOutputSchema.safeParse(build(16));
    expect(overLimit.success).toBe(true);
    expect(overLimit.data?.findings).toHaveLength(15);
  });

  it("clips a finding summary longer than 500 characters", () => {
    const atLimit = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ summary: "s".repeat(500) })],
      overallSummary: "Bounded.",
    });
    expect(atLimit.success).toBe(true);
    expect(atLimit.data?.findings[0]?.summary).toHaveLength(500);

    const overLimit = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ summary: "s".repeat(600) })],
      overallSummary: "Clipped.",
    });
    expect(overLimit.success).toBe(true);
    expect(overLimit.data?.findings[0]?.summary).toHaveLength(500);
    expect(overLimit.data?.findings[0]?.summary.endsWith("…")).toBe(true);
  });

  it("accepts an empty finding summary (clip semantics do not enforce min)", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ summary: "" })],
      overallSummary: "Empty summary.",
    });
    expect(result.success).toBe(true);
  });

  it("clips evidence longer than 600 characters", () => {
    const atLimit = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ currentEvidence: "e".repeat(600) })],
      overallSummary: "Bounded evidence.",
    });
    expect(atLimit.success).toBe(true);

    const overLimit = comparisonOutputSchema.safeParse({
      findings: [makeFinding({ priorEvidence: "e".repeat(700) })],
      overallSummary: "Clipped evidence.",
    });
    expect(overLimit.success).toBe(true);
    expect(overLimit.data?.findings[0]?.priorEvidence).toHaveLength(600);
  });

  it("rejects a missing overallSummary", () => {
    const result = comparisonOutputSchema.safeParse({
      findings: validOutput.findings,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty overallSummary and clips one over 1200 characters", () => {
    expect(
      comparisonOutputSchema.safeParse({ findings: [], overallSummary: "" })
        .success
    ).toBe(true);
    const clipped = comparisonOutputSchema.safeParse({
      findings: [],
      overallSummary: "o".repeat(1500),
    });
    expect(clipped.success).toBe(true);
    expect(clipped.data?.overallSummary).toHaveLength(1200);
    expect(clipped.data?.overallSummary.endsWith("…")).toBe(true);
  });

  it("rejects a missing findings array and a non-array findings value", () => {
    expect(
      comparisonOutputSchema.safeParse({ overallSummary: "No findings key." })
        .success
    ).toBe(false);
    expect(
      comparisonOutputSchema.safeParse({
        findings: "none",
        overallSummary: "Wrong type.",
      }).success
    ).toBe(false);
  });

  it("strips unknown keys rather than rejecting them", () => {
    // Plain z.object() is strip-mode: extra model output is dropped, so the
    // domain never sees unvalidated fields.
    const result = comparisonOutputSchema.safeParse({
      ...validOutput,
      confidence: 0.9,
      findings: [{ ...makeFinding(), severity: "high" }],
    });

    expect(result.success).toBe(true);
    expect(result.data && Object.keys(result.data).sort()).toEqual([
      "findings",
      "overallSummary",
    ]);
    const first = result.data?.findings[0];
    expect(first && Object.keys(first).sort()).toEqual([
      "changeType",
      "classification",
      "currentEvidence",
      "priorEvidence",
      "summary",
    ]);
  });
});

describe("comparisonJsonSchema wire contract", () => {
  const findings = comparisonJsonSchema.properties.findings as {
    type: string;
    items: {
      type: string;
      properties: Record<string, { type: unknown; enum?: string[] }>;
      required: string[];
      additionalProperties: boolean;
    };
  };

  it("closes additionalProperties at both levels", () => {
    expect(comparisonJsonSchema.additionalProperties).toBe(false);
    expect(findings.items.additionalProperties).toBe(false);
  });

  it("declares an object root with an array of objects", () => {
    expect(comparisonJsonSchema.type).toBe("object");
    expect(findings.type).toBe("array");
    expect(findings.items.type).toBe("object");
  });

  it("requires every top-level key present in the Zod schema", () => {
    expect([...comparisonJsonSchema.required].sort()).toEqual(
      Object.keys(comparisonBaseSchema.shape).sort()
    );
    expect(Object.keys(comparisonJsonSchema.properties).sort()).toEqual(
      Object.keys(comparisonBaseSchema.shape).sort()
    );
  });

  it("requires every finding key present in the Zod finding schema", () => {
    const zodFindingKeys = Object.keys(
      comparisonBaseSchema.shape.findings.element.shape
    ).sort();

    expect([...findings.items.required].sort()).toEqual(zodFindingKeys);
    expect(Object.keys(findings.items.properties).sort()).toEqual(
      zodFindingKeys
    );
  });

  it("declares the same classification enum as the Zod schema", () => {
    expect(findings.items.properties.classification?.enum).toEqual(
      comparisonBaseSchema.shape.findings.element.shape.classification.options
    );
  });

  it("declares the same changeType enum as the Zod schema", () => {
    expect(findings.items.properties.changeType?.enum).toEqual(
      comparisonBaseSchema.shape.findings.element.shape.changeType.options
    );
  });

  it("declares nullable evidence fields and non-nullable strings elsewhere", () => {
    expect(findings.items.properties.currentEvidence?.type).toEqual([
      "string",
      "null",
    ]);
    expect(findings.items.properties.priorEvidence?.type).toEqual([
      "string",
      "null",
    ]);
    expect(findings.items.properties.summary?.type).toBe("string");
    expect(
      (comparisonJsonSchema.properties.overallSummary as { type: string }).type
    ).toBe("string");
  });
});
