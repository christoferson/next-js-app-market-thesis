import { describe, expect, it } from "vitest";
import {
  CLASSIFICATIONS,
  EVAL_PROMPT_VERSION,
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  evaluationBaseSchema,
  evaluationJsonSchema,
  evaluationOutputSchema,
  type EvaluationPromptInput,
} from "@/lib/contradiction/prompt";
import type { EvidenceItem } from "@/lib/contradiction/types";
import type { ThesisClaim } from "@/lib/thesis/types";

/**
 * The claim-evaluation prompt module is a provenance contract: the version
 * string is stored on every evaluation row, so drift in prompt text or output
 * schema must be a deliberate bump. The wire JSON Schema and the Zod schema
 * are authored separately, so they are cross-checked structurally here.
 *
 * Everything in this file is pure — no store, no network.
 */

function makeClaim(overrides: Partial<ThesisClaim> = {}): ThesisClaim {
  return {
    id: "claim-margin",
    kind: "profitability",
    statement: "Operating margin reaches 15% by FY2027.",
    metricDescription: "operating margin, TTM",
    baselineValue: 0.11,
    targetValue: 0.15,
    invalidationValue: 0.08,
    deadline: "2027-03-31",
    importance: 3,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    kind: "numeric-change",
    label: "Revenue FY2025 vs FY2024",
    content: "Revenue: 1,200,000,000 → 1,320,000,000 (+10.0%)",
    asOf: "2026-02-14",
    source: "0000320193-26-000010",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/fixture/index.json",
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<EvaluationPromptInput> = {}
): EvaluationPromptInput {
  return {
    companyLabel: "Fixture Manufacturing Co. (research)",
    claims: [makeClaim()],
    evidence: [makeEvidence()],
    ...overrides,
  };
}

/** Index access with a clear failure instead of an `undefined` deep-equal. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index} of ${items.length}.`);
  }
  return item;
}

function makeEvaluation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    claimId: "claim-margin",
    classification: "MODERATELY_SUPPORTS",
    rationale: "Reported operating margin rose toward the stated target.",
    evidenceExcerpts: ["operating margin of 13.4%"],
    ...overrides,
  };
}

/** Drop one key so "the model omitted a required field" can be asserted. */
function without(
  payload: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const copy = { ...payload };
  delete copy[key];
  return copy;
}

describe("EVAL_PROMPT_VERSION", () => {
  it("is the pinned C1 version", () => {
    // Changing prompt text or the output schema requires bumping this value
    // and updating this assertion deliberately.
    expect(EVAL_PROMPT_VERSION).toBe("claim-evaluation-v1");
  });

  it("is a stable lowercase identifier ending in a version number", () => {
    expect(EVAL_PROMPT_VERSION).toMatch(/^[a-z0-9-]+-v\d+$/);
  });
});

describe("CLASSIFICATIONS", () => {
  it("is exactly the six SPEC classifications, in scale order", () => {
    expect([...CLASSIFICATIONS]).toEqual([
      "STRONGLY_SUPPORTS",
      "MODERATELY_SUPPORTS",
      "NEUTRAL",
      "MODERATELY_CONTRADICTS",
      "STRONGLY_CONTRADICTS",
      "INSUFFICIENT_EVIDENCE",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(CLASSIFICATIONS).size).toBe(CLASSIFICATIONS.length);
  });
});

describe("buildEvaluationSystemPrompt", () => {
  const prompt = buildEvaluationSystemPrompt();

  it("is deterministic across calls", () => {
    expect(buildEvaluationSystemPrompt()).toBe(prompt);
    expect(buildEvaluationSystemPrompt()).toBe(buildEvaluationSystemPrompt());
  });

  it("names every classification the schema accepts", () => {
    for (const classification of CLASSIFICATIONS) {
      expect(prompt).toContain(classification);
    }
  });

  it("requires INSUFFICIENT_EVIDENCE instead of guessing", () => {
    expect(prompt).toContain("INSUFFICIENT_EVIDENCE — never guess");
    expect(prompt).toContain("never guess");
  });

  it("frames a contradiction as a reason to review, never to act", () => {
    expect(prompt).toContain("REVIEW");
    expect(prompt).toContain("Never suggest buying, selling");
    expect(prompt).toContain("Never predict prices.");
  });

  it("requires rationales grounded in the supplied evidence only", () => {
    expect(prompt).toContain("Judge only from the evidence provided");
    expect(prompt).toContain("verbatim");
  });

  it("forbids inventing new financial calculations", () => {
    expect(prompt).toContain("Do not calculate new financial ratios");
  });

  it("states the decimal percentage convention", () => {
    expect(prompt).toContain("decimals");
    expect(prompt).toContain("0.15 means 15%");
  });

  it("asks for neutral research language", () => {
    expect(prompt).toContain("neutral research language");
  });
});

describe("buildEvaluationUserPrompt", () => {
  const input = makeInput();
  const prompt = buildEvaluationUserPrompt(input);

  it("is deterministic for the same input", () => {
    expect(buildEvaluationUserPrompt(input)).toBe(prompt);
    expect(buildEvaluationUserPrompt(makeInput())).toBe(prompt);
  });

  it("includes the company label", () => {
    expect(prompt).toContain("Company: Fixture Manufacturing Co. (research)");
  });

  it("includes every claim id and statement", () => {
    const claims = [
      makeClaim({ id: "claim-a", statement: "Revenue grows 12% annually." }),
      makeClaim({ id: "claim-b", statement: "Net debt stays below one turn." }),
      makeClaim({ id: "claim-c", statement: "Retention stays above 95%." }),
    ];
    const withClaims = buildEvaluationUserPrompt(makeInput({ claims }));

    for (const claim of claims) {
      expect(withClaims).toContain(`Claim ${claim.id}:`);
      expect(withClaims).toContain(`Statement: ${claim.statement}`);
    }
  });

  it("renders every optional claim field when present", () => {
    expect(prompt).toContain("Metric: operating margin, TTM");
    expect(prompt).toContain("Baseline: 0.11");
    expect(prompt).toContain("Target: 0.15");
    expect(prompt).toContain("Invalidation threshold: 0.08");
    expect(prompt).toContain("Deadline: 2027-03-31");
  });

  it("omits optional claim lines that are null rather than printing empties", () => {
    const bare = buildEvaluationUserPrompt(
      makeInput({
        claims: [
          makeClaim({
            statement: "The moat widens as switching costs rise.",
            metricDescription: null,
            baselineValue: null,
            targetValue: null,
            invalidationValue: null,
            deadline: null,
          }),
        ],
      })
    );

    expect(bare).toContain("Claim claim-margin:");
    expect(bare).toContain("Statement: The moat widens as switching costs rise.");
    expect(bare).not.toContain("Metric:");
    expect(bare).not.toContain("Baseline:");
    expect(bare).not.toContain("Target:");
    expect(bare).not.toContain("Invalidation threshold:");
    expect(bare).not.toContain("Deadline:");
    expect(bare).not.toContain("null");
  });

  it("renders a quantified zero rather than dropping it as missing", () => {
    const zeroed = buildEvaluationUserPrompt(
      makeInput({
        claims: [makeClaim({ baselineValue: 0, targetValue: null })],
      })
    );

    expect(zeroed).toContain("Baseline: 0");
    expect(zeroed).not.toContain("Target:");
  });

  it("numbers evidence items from 1 with kind, label, source and as-of date", () => {
    const withEvidence = buildEvaluationUserPrompt(
      makeInput({
        evidence: [
          makeEvidence(),
          makeEvidence({
            kind: "narrative",
            label: "Item 1A. Risk Factors — supplier concentration",
            content: "We now rely on a single source for certain components.",
            asOf: "2026-03-01",
            source: "S100ABCD",
          }),
        ],
      })
    );

    expect(withEvidence).toContain(
      "Evidence 1 [numeric-change] — Revenue FY2025 vs FY2024"
    );
    expect(withEvidence).toContain(
      "Evidence 2 [narrative] — Item 1A. Risk Factors — supplier concentration"
    );
    expect(withEvidence).toContain(
      "Source: 0000320193-26-000010 (as of 2026-02-14)"
    );
    expect(withEvidence).toContain("Source: S100ABCD (as of 2026-03-01)");
    expect(withEvidence).not.toContain("Evidence 0 ");
    expect(withEvidence).not.toContain("Evidence 3 ");
  });

  it("includes the evidence content verbatim", () => {
    const content = 'Management said margins "normalized"\nabove 15%.';
    const withContent = buildEvaluationUserPrompt(
      makeInput({ evidence: [makeEvidence({ content })] })
    );

    expect(withContent).toContain(content);
  });

  it("omits the as-of parenthetical when the evidence date is unknown", () => {
    const undated = buildEvaluationUserPrompt(
      makeInput({ evidence: [makeEvidence({ asOf: null })] })
    );

    expect(undated).toContain("Source: 0000320193-26-000010");
    expect(undated).not.toContain("as of");
  });

  it("places the claims section before the evidence section", () => {
    const claimsIndex = prompt.indexOf("=== THESIS CLAIMS ===");
    const evidenceIndex = prompt.indexOf("=== FILING EVIDENCE ===");

    expect(claimsIndex).toBeGreaterThanOrEqual(0);
    expect(evidenceIndex).toBeGreaterThan(claimsIndex);
    expect(prompt.indexOf(at(makeInput().claims, 0).statement)).toBeLessThan(
      prompt.indexOf(at(makeInput().evidence, 0).content)
    );
  });

  it("names the structured-output tool and asks for one evaluation per claim", () => {
    expect(prompt).toContain("report_evaluations");
    expect(prompt).toContain("one evaluation per claim");
    expect(prompt).toContain("exact id");
  });

  it("keeps the caller's claim and evidence ordering", () => {
    const ordered = buildEvaluationUserPrompt(
      makeInput({
        claims: [
          makeClaim({ id: "claim-second-alphabetically" }),
          makeClaim({ id: "claim-first" }),
        ],
        evidence: [
          makeEvidence({ label: "Second supplied" }),
          makeEvidence({ label: "First supplied" }),
        ],
      })
    );

    expect(ordered.indexOf("claim-second-alphabetically")).toBeLessThan(
      ordered.indexOf("claim-first")
    );
    expect(ordered.indexOf("Second supplied")).toBeLessThan(
      ordered.indexOf("First supplied")
    );
  });

  it("still renders both section headers with no claims or evidence", () => {
    const empty = buildEvaluationUserPrompt(
      makeInput({ claims: [], evidence: [] })
    );

    expect(empty).toContain("=== THESIS CLAIMS ===");
    expect(empty).toContain("=== FILING EVIDENCE ===");
    expect(empty).toContain("report_evaluations");
  });
});

describe("evaluationOutputSchema", () => {
  it("accepts a valid payload for several claims", () => {
    const result = evaluationOutputSchema.safeParse({
      evaluations: [
        makeEvaluation(),
        makeEvaluation({
          claimId: "claim-growth",
          classification: "STRONGLY_CONTRADICTS",
          rationale: "Revenue declined against a claim of 12% growth.",
          evidenceExcerpts: ["Revenue: 1,320 → 1,180", "-10.6%"],
        }),
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.evaluations).toHaveLength(2);
    expect(result.data?.evaluations[1]?.classification).toBe(
      "STRONGLY_CONTRADICTS"
    );
  });

  it.each(CLASSIFICATIONS)("accepts the %s classification", (classification) => {
    const result = evaluationOutputSchema.safeParse({
      evaluations: [makeEvaluation({ classification })],
    });

    expect(result.success).toBe(true);
    expect(result.data?.evaluations[0]?.classification).toBe(classification);
  });

  it("rejects a classification outside the enum", () => {
    for (const classification of [
      "SUPPORTS",
      "strongly_supports",
      "STRONG_BUY",
      "",
      null,
      3,
    ]) {
      expect(
        evaluationOutputSchema.safeParse({
          evaluations: [makeEvaluation({ classification })],
        }).success
      ).toBe(false);
    }
  });

  it("rejects a missing claimId", () => {
    expect(
      evaluationOutputSchema.safeParse({
        evaluations: [without(makeEvaluation(), "claimId")],
      }).success
    ).toBe(false);
  });

  it("rejects a missing classification, rationale, or excerpt array", () => {
    for (const key of [
      "classification",
      "rationale",
      "evidenceExcerpts",
    ] as const) {
      expect(
        evaluationOutputSchema.safeParse({
          evaluations: [without(makeEvaluation(), key)],
        }).success
      ).toBe(false);
    }
  });

  it("rejects a missing evaluations key and a non-array value", () => {
    expect(evaluationOutputSchema.safeParse({}).success).toBe(false);
    expect(
      evaluationOutputSchema.safeParse({ evaluations: "none" }).success
    ).toBe(false);
    expect(
      evaluationOutputSchema.safeParse({ evaluations: null }).success
    ).toBe(false);
  });

  it("accepts an empty evaluations array at the schema level", () => {
    // Structural validity only; the service decides what a missing evaluation
    // for a claim means.
    const result = evaluationOutputSchema.safeParse({ evaluations: [] });

    expect(result.success).toBe(true);
    expect(result.data?.evaluations).toEqual([]);
  });

  it("keeps a 1000-character rationale and clips a longer one", () => {
    const atLimit = evaluationOutputSchema.safeParse({
      evaluations: [makeEvaluation({ rationale: "r".repeat(1_000) })],
    });
    expect(atLimit.success).toBe(true);
    expect(atLimit.data?.evaluations[0]?.rationale).toHaveLength(1_000);
    expect(atLimit.data?.evaluations[0]?.rationale.endsWith("…")).toBe(false);

    const overLimit = evaluationOutputSchema.safeParse({
      evaluations: [makeEvaluation({ rationale: "r".repeat(4_000) })],
    });
    expect(overLimit.success).toBe(true);
    expect(overLimit.data?.evaluations[0]?.rationale).toHaveLength(1_000);
    expect(overLimit.data?.evaluations[0]?.rationale.endsWith("…")).toBe(true);
  });

  it("accepts an empty rationale (clip semantics enforce no minimum)", () => {
    const result = evaluationOutputSchema.safeParse({
      evaluations: [makeEvaluation({ rationale: "" })],
    });

    expect(result.success).toBe(true);
    expect(result.data?.evaluations[0]?.rationale).toBe("");
  });

  it("keeps four excerpts and clips a fifth instead of rejecting", () => {
    const build = (count: number) => ({
      evaluations: [
        makeEvaluation({
          evidenceExcerpts: Array.from(
            { length: count },
            (_unused, index) => `excerpt ${index + 1}`
          ),
        }),
      ],
    });

    const atLimit = evaluationOutputSchema.safeParse(build(4));
    expect(atLimit.success).toBe(true);
    expect(atLimit.data?.evaluations[0]?.evidenceExcerpts).toEqual([
      "excerpt 1",
      "excerpt 2",
      "excerpt 3",
      "excerpt 4",
    ]);

    const overLimit = evaluationOutputSchema.safeParse(build(9));
    expect(overLimit.success).toBe(true);
    expect(overLimit.data?.evaluations[0]?.evidenceExcerpts).toHaveLength(4);
    expect(overLimit.data?.evaluations[0]?.evidenceExcerpts).toEqual([
      "excerpt 1",
      "excerpt 2",
      "excerpt 3",
      "excerpt 4",
    ]);
  });

  it("accepts an empty excerpt array", () => {
    const result = evaluationOutputSchema.safeParse({
      evaluations: [
        makeEvaluation({
          classification: "INSUFFICIENT_EVIDENCE",
          evidenceExcerpts: [],
        }),
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.evaluations[0]?.evidenceExcerpts).toEqual([]);
  });

  it("keeps a 500-character excerpt and clips a longer one", () => {
    const atLimit = evaluationOutputSchema.safeParse({
      evaluations: [makeEvaluation({ evidenceExcerpts: ["e".repeat(500)] })],
    });
    expect(atLimit.success).toBe(true);
    expect(atLimit.data?.evaluations[0]?.evidenceExcerpts[0]).toHaveLength(500);
    expect(
      atLimit.data?.evaluations[0]?.evidenceExcerpts[0]?.endsWith("…")
    ).toBe(false);

    const overLimit = evaluationOutputSchema.safeParse({
      evaluations: [
        makeEvaluation({
          evidenceExcerpts: ["short one", "e".repeat(900)],
        }),
      ],
    });
    expect(overLimit.success).toBe(true);
    expect(overLimit.data?.evaluations[0]?.evidenceExcerpts[0]).toBe("short one");
    expect(overLimit.data?.evaluations[0]?.evidenceExcerpts[1]).toHaveLength(500);
    expect(
      overLimit.data?.evaluations[0]?.evidenceExcerpts[1]?.endsWith("…")
    ).toBe(true);
  });

  it("clips the fifth-and-later excerpts away before length clipping matters", () => {
    const result = evaluationOutputSchema.safeParse({
      evaluations: [
        makeEvaluation({
          evidenceExcerpts: ["a", "b", "c", "d", "z".repeat(2_000)],
        }),
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.evaluations[0]?.evidenceExcerpts).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("rejects non-string excerpts", () => {
    expect(
      evaluationOutputSchema.safeParse({
        evaluations: [makeEvaluation({ evidenceExcerpts: ["ok", 42] })],
      }).success
    ).toBe(false);
    expect(
      evaluationOutputSchema.safeParse({
        evaluations: [makeEvaluation({ evidenceExcerpts: "not an array" })],
      }).success
    ).toBe(false);
  });

  it("strips unknown keys rather than rejecting them", () => {
    const result = evaluationOutputSchema.safeParse({
      evaluations: [{ ...makeEvaluation(), confidence: 0.9 }],
      runNote: "extra",
    });

    expect(result.success).toBe(true);
    expect(result.data && Object.keys(result.data)).toEqual(["evaluations"]);
    const first = result.data?.evaluations[0];
    expect(first && Object.keys(first).sort()).toEqual([
      "claimId",
      "classification",
      "evidenceExcerpts",
      "rationale",
    ]);
  });

  it("leaves short values untouched (clipping is not lossy below the caps)", () => {
    const payload = {
      evaluations: [
        makeEvaluation({
          rationale: "Margin of 13.4% moved toward the 15% target.",
          evidenceExcerpts: ["operating margin of 13.4%"],
        }),
      ],
    };

    expect(evaluationOutputSchema.parse(payload)).toEqual(payload);
  });
});

describe("evaluationBaseSchema", () => {
  it("does not clip, so the base schema stays the structural contract", () => {
    const parsed = evaluationBaseSchema.parse({
      evaluations: [
        makeEvaluation({
          rationale: "r".repeat(4_000),
          evidenceExcerpts: ["a", "b", "c", "d", "e"],
        }),
      ],
    });

    expect(parsed.evaluations[0]?.rationale).toHaveLength(4_000);
    expect(parsed.evaluations[0]?.evidenceExcerpts).toHaveLength(5);
  });
});

describe("evaluationJsonSchema wire contract", () => {
  const evaluations = evaluationJsonSchema.properties.evaluations as {
    type: string;
    items: {
      type: string;
      properties: Record<string, { type: unknown; enum?: string[] }>;
      required: string[];
      additionalProperties: boolean;
    };
  };

  it("declares an object root holding an array of objects", () => {
    expect(evaluationJsonSchema.type).toBe("object");
    expect(evaluations.type).toBe("array");
    expect(evaluations.items.type).toBe("object");
  });

  it("closes additionalProperties at both levels", () => {
    expect(evaluationJsonSchema.additionalProperties).toBe(false);
    expect(evaluations.items.additionalProperties).toBe(false);
  });

  it("requires every top-level key present in the Zod schema", () => {
    const zodKeys = Object.keys(evaluationBaseSchema.shape).sort();

    expect([...evaluationJsonSchema.required].sort()).toEqual(zodKeys);
    expect(Object.keys(evaluationJsonSchema.properties).sort()).toEqual(zodKeys);
  });

  it("requires every evaluation key present in the Zod item schema", () => {
    const zodItemKeys = Object.keys(
      evaluationBaseSchema.shape.evaluations.element.shape
    ).sort();

    expect([...evaluations.items.required].sort()).toEqual(zodItemKeys);
    expect(Object.keys(evaluations.items.properties).sort()).toEqual(zodItemKeys);
  });

  it("declares the same classification enum as the Zod schema and CLASSIFICATIONS", () => {
    expect(evaluations.items.properties.classification?.enum).toEqual(
      evaluationBaseSchema.shape.evaluations.element.shape.classification.options
    );
    expect(evaluations.items.properties.classification?.enum).toEqual([
      ...CLASSIFICATIONS,
    ]);
  });

  it("declares plain string and string-array types with no nullable fields", () => {
    expect(evaluations.items.properties.claimId?.type).toBe("string");
    expect(evaluations.items.properties.rationale?.type).toBe("string");
    expect(evaluations.items.properties.classification?.type).toBe("string");
    expect(evaluations.items.properties.evidenceExcerpts?.type).toBe("array");
    for (const property of Object.values(evaluations.items.properties)) {
      expect(Array.isArray(property.type)).toBe(false);
    }
  });

  it("copies the classification enum rather than aliasing CLASSIFICATIONS", () => {
    // A shared reference would let a consumer mutate the domain constant.
    expect(evaluations.items.properties.classification?.enum).not.toBe(
      CLASSIFICATIONS
    );
  });
});
