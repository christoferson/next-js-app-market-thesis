import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createThesisSchema,
  noteSchema,
  reviseThesisSchema,
  statusChangeSchema,
  toValidationFailure,
} from "@/lib/validation/thesis-request";

/**
 * Request-contract tests. These schemas are the only boundary between an
 * untrusted request body and the thesis store, so the tests focus on what is
 * rejected: unknown fields, non-finite numbers, out-of-range importance, and
 * loose date strings.
 */

const VALID_CLAIM = {
  kind: "profitability",
  statement: "Operating margin reaches 15% by FY2027.",
  metricDescription: "operating margin, TTM",
  baselineValue: 0.11,
  targetValue: 0.15,
  invalidationValue: 0.08,
  deadline: "2027-03-31",
  importance: 2,
} as const;

const VALID_BODY = {
  title: "Margin expansion is underestimated",
  summary:
    "Recurring revenue mix is rising while support costs stay flat, so " +
    "operating leverage should show up over the next few years.",
  edge: "The market prices this as a services business.",
  bearCase: "A larger platform bundles the product for free.",
  timeHorizon: "3-5 years",
  claims: [VALID_CLAIM],
} as const;

const VALID_CREATE = {
  subjectRef: "demo:stock-us-northstar-software",
  subjectLabel: "Northstar Software (demo)",
  ...VALID_BODY,
} as const;

const VALID_REVISE = {
  ...VALID_BODY,
  revisionNote: "Raised the margin target after the Q2 disclosure.",
} as const;

/** A create body with claim-level overrides applied to the single claim. */
function withClaim(overrides: Record<string, unknown>): unknown {
  return { ...VALID_CREATE, claims: [{ ...VALID_CLAIM, ...overrides }] };
}

describe("createThesisSchema valid input", () => {
  it("parses a full payload", () => {
    const result = createThesisSchema.safeParse(VALID_CREATE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(VALID_CREATE);
  });

  it("parses a minimal payload with every optional field explicitly null", () => {
    const result = createThesisSchema.safeParse({
      subjectRef: "demo:etf-jp-sakura-dividend",
      subjectLabel: "Sakura Dividend ETF (demo)",
      title: "Yield with acceptable concentration",
      summary: "A concise but sufficiently long summary of the reasoning here.",
      edge: null,
      bearCase: null,
      timeHorizon: null,
      claims: [
        {
          kind: "other",
          statement: "Distribution yield stays above 3%.",
          metricDescription: null,
          baselineValue: null,
          targetValue: null,
          invalidationValue: null,
          deadline: null,
          importance: 1,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.edge).toBeNull();
    const claim = result.data.claims[0];
    expect(claim?.baselineValue).toBeNull();
    expect(claim?.deadline).toBeNull();
  });

  it("keeps an explicit zero rather than treating it as missing", () => {
    const result = createThesisSchema.safeParse(
      withClaim({ baselineValue: 0, targetValue: -0.05 })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.claims[0]?.baselineValue).toBe(0);
    expect(result.data.claims[0]?.targetValue).toBe(-0.05);
  });

  it("preserves decimal percentage conventions", () => {
    const result = createThesisSchema.safeParse(
      withClaim({ baselineValue: 0.15, targetValue: 0.0325 })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.claims[0]?.baselineValue).toBe(0.15);
    expect(result.data.claims[0]?.targetValue).toBe(0.0325);
  });

  it("preserves a Japanese subject label", () => {
    const result = createThesisSchema.safeParse({
      ...VALID_CREATE,
      subjectRef: "research-jp:toyota",
      subjectLabel: "トヨタ自動車",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.subjectLabel).toBe("トヨタ自動車");
  });

  it("requires an object body", () => {
    for (const body of [null, undefined, 42, "thesis", []]) {
      expect(createThesisSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("createThesisSchema subjectRef", () => {
  it.each([
    "demo:stock-us-northstar-software",
    "demo:x",
    "research:aapl",
    "research-jp:toyota",
    "research:brk-b",
    "demo:etf-jp-sakura-dividend",
  ])("accepts %s", (subjectRef) => {
    expect(
      createThesisSchema.safeParse({ ...VALID_CREATE, subjectRef }).success
    ).toBe(true);
  });

  it.each([
    ["an unsupported scope", "portfolio:x"],
    ["a missing colon", "demoxyz"],
    ["a bare scope", "demo"],
    ["an empty id", "demo:"],
    ["an uppercase scope", "Demo:x"],
    ["an uppercase id", "demo:Northstar"],
    ["a leading hyphen in the id", "demo:-x"],
    ["a dot in the id", "research:aapl.us"],
    ["an underscore in the id", "research:brk_b"],
    ["leading whitespace", " demo:x"],
    ["a colon inside the id", "demo:stock:us"],
    ["an empty string", ""],
  ])("rejects %s", (_label, subjectRef) => {
    expect(
      createThesisSchema.safeParse({ ...VALID_CREATE, subjectRef }).success
    ).toBe(false);
  });

  it("accepts a 100-character id but not a 101-character one", () => {
    expect(
      createThesisSchema.safeParse({
        ...VALID_CREATE,
        subjectRef: `demo:${"a".repeat(100)}`,
      }).success
    ).toBe(true);
    expect(
      createThesisSchema.safeParse({
        ...VALID_CREATE,
        subjectRef: `demo:${"a".repeat(101)}`,
      }).success
    ).toBe(false);
  });

  it("reports the failure under the subjectRef field with a readable message", () => {
    const result = createThesisSchema.safeParse({
      ...VALID_CREATE,
      subjectRef: "portfolio:x",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toValidationFailure(result.error).details.subjectRef).toEqual([
      "subjectRef must be scope:id (demo:, research:, research-jp:).",
    ]);
  });
});

describe("createThesisSchema text bounds", () => {
  it("accepts a title of 3 and 200 characters", () => {
    for (const length of [3, 200]) {
      expect(
        createThesisSchema.safeParse({
          ...VALID_CREATE,
          title: "a".repeat(length),
        }).success
      ).toBe(true);
    }
  });

  it("rejects a title of 2 and 201 characters", () => {
    for (const length of [2, 201]) {
      expect(
        createThesisSchema.safeParse({
          ...VALID_CREATE,
          title: "a".repeat(length),
        }).success
      ).toBe(false);
    }
  });

  it("applies the length bound after trimming", () => {
    const tooShort = createThesisSchema.safeParse({
      ...VALID_CREATE,
      title: "  ab  ",
    });
    expect(tooShort.success).toBe(false);

    const trimmed = createThesisSchema.safeParse({
      ...VALID_CREATE,
      title: "  Margin expansion  ",
    });
    expect(trimmed.success).toBe(true);
    if (!trimmed.success) return;
    expect(trimmed.data.title).toBe("Margin expansion");
  });

  it("rejects a whitespace-only title, summary, and subjectLabel", () => {
    expect(
      createThesisSchema.safeParse({ ...VALID_CREATE, title: "     " }).success
    ).toBe(false);
    expect(
      createThesisSchema.safeParse({ ...VALID_CREATE, summary: "     " }).success
    ).toBe(false);
    expect(
      createThesisSchema.safeParse({ ...VALID_CREATE, subjectLabel: "   " })
        .success
    ).toBe(false);
  });

  it("accepts a summary of 20 and 10000 characters", () => {
    for (const length of [20, 10_000]) {
      expect(
        createThesisSchema.safeParse({
          ...VALID_CREATE,
          summary: "a".repeat(length),
        }).success
      ).toBe(true);
    }
  });

  it("rejects a summary of 19 and 10001 characters", () => {
    for (const length of [19, 10_001]) {
      expect(
        createThesisSchema.safeParse({
          ...VALID_CREATE,
          summary: "a".repeat(length),
        }).success
      ).toBe(false);
    }
  });

  it("bounds edge and bearCase at 5000 characters", () => {
    for (const field of ["edge", "bearCase"] as const) {
      expect(
        createThesisSchema.safeParse({
          ...VALID_CREATE,
          [field]: "a".repeat(5_000),
        }).success
      ).toBe(true);
      expect(
        createThesisSchema.safeParse({
          ...VALID_CREATE,
          [field]: "a".repeat(5_001),
        }).success
      ).toBe(false);
    }
  });

  it("bounds timeHorizon at 100 characters", () => {
    expect(
      createThesisSchema.safeParse({
        ...VALID_CREATE,
        timeHorizon: "a".repeat(100),
      }).success
    ).toBe(true);
    expect(
      createThesisSchema.safeParse({
        ...VALID_CREATE,
        timeHorizon: "a".repeat(101),
      }).success
    ).toBe(false);
  });

  it("bounds subjectLabel at 200 characters", () => {
    expect(
      createThesisSchema.safeParse({
        ...VALID_CREATE,
        subjectLabel: "a".repeat(200),
      }).success
    ).toBe(true);
    expect(
      createThesisSchema.safeParse({
        ...VALID_CREATE,
        subjectLabel: "a".repeat(201),
      }).success
    ).toBe(false);
  });

  it("requires the nullable fields to be present, not omitted", () => {
    const { edge: _edge, ...withoutEdge } = VALID_CREATE;
    expect(createThesisSchema.safeParse(withoutEdge).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    for (const field of [
      "subjectRef",
      "subjectLabel",
      "title",
      "summary",
      "claims",
    ] as const) {
      const body: Record<string, unknown> = { ...VALID_CREATE };
      delete body[field];
      expect(createThesisSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("createThesisSchema claims", () => {
  function claims(count: number): unknown[] {
    return Array.from({ length: count }, (_unused, index) => ({
      ...VALID_CLAIM,
      statement: `Claim number ${index + 1} of the thesis.`,
    }));
  }

  it("accepts 1 and 12 claims", () => {
    for (const count of [1, 12]) {
      const result = createThesisSchema.safeParse({
        ...VALID_CREATE,
        claims: claims(count),
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.claims).toHaveLength(count);
    }
  });

  it("rejects 0 and 13 claims", () => {
    for (const count of [0, 13]) {
      expect(
        createThesisSchema.safeParse({ ...VALID_CREATE, claims: claims(count) })
          .success
      ).toBe(false);
    }
  });

  it("rejects claims that are not an array", () => {
    for (const value of [null, {}, "growth", 1]) {
      expect(
        createThesisSchema.safeParse({ ...VALID_CREATE, claims: value }).success
      ).toBe(false);
    }
  });

  it("accepts a statement of 5 and 500 characters", () => {
    for (const length of [5, 500]) {
      expect(
        createThesisSchema.safeParse(withClaim({ statement: "a".repeat(length) }))
          .success
      ).toBe(true);
    }
  });

  it("rejects a statement of 4 and 501 characters", () => {
    for (const length of [4, 501]) {
      expect(
        createThesisSchema.safeParse(withClaim({ statement: "a".repeat(length) }))
          .success
      ).toBe(false);
    }
  });

  it("trims the statement before bounding it", () => {
    expect(
      createThesisSchema.safeParse(withClaim({ statement: "  ab  " })).success
    ).toBe(false);

    const result = createThesisSchema.safeParse(
      withClaim({ statement: "  Margin rises.  " })
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.claims[0]?.statement).toBe("Margin rises.");
  });

  it("bounds metricDescription at 200 characters", () => {
    expect(
      createThesisSchema.safeParse(
        withClaim({ metricDescription: "a".repeat(200) })
      ).success
    ).toBe(true);
    expect(
      createThesisSchema.safeParse(
        withClaim({ metricDescription: "a".repeat(201) })
      ).success
    ).toBe(false);
  });

  it("accepts every claim kind", () => {
    for (const kind of [
      "growth",
      "profitability",
      "capital-allocation",
      "competitive-position",
      "valuation",
      "other",
    ]) {
      expect(createThesisSchema.safeParse(withClaim({ kind })).success).toBe(true);
    }
  });

  it("rejects an unknown claim kind", () => {
    for (const kind of ["momentum", "Growth", "", null, 1]) {
      expect(createThesisSchema.safeParse(withClaim({ kind })).success).toBe(
        false
      );
    }
  });

  it("accepts an ISO deadline and null", () => {
    expect(
      createThesisSchema.safeParse(withClaim({ deadline: "2027-03-31" })).success
    ).toBe(true);
    expect(
      createThesisSchema.safeParse(withClaim({ deadline: null })).success
    ).toBe(true);
  });

  it.each(["2027-02-30", "2027-13-01", "2027-00-15", "2027-04-31"])(
    "rejects the impossible calendar date %s",
    (deadline) => {
      const result = createThesisSchema.safeParse(withClaim({ deadline }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        toValidationFailure(result.error).details["claims.0.deadline"]
      ).toEqual(["This is not a real calendar date."]);
    }
  );

  it("accepts a leap-day deadline in a leap year only", () => {
    expect(
      createThesisSchema.safeParse(withClaim({ deadline: "2028-02-29" })).success
    ).toBe(true);
    expect(
      createThesisSchema.safeParse(withClaim({ deadline: "2027-02-29" })).success
    ).toBe(false);
  });

  it.each([
    "March 2027",
    "2027-3-31",
    "31-03-2027",
    "2027/03/31",
    "2027-03-31T00:00:00.000Z",
    "2027",
    "",
  ])("rejects the deadline %s", (deadline) => {
    expect(createThesisSchema.safeParse(withClaim({ deadline })).success).toBe(
      false
    );
  });

  it("reports a readable message for a malformed deadline", () => {
    const result = createThesisSchema.safeParse(
      withClaim({ deadline: "March 2027" })
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toValidationFailure(result.error).details["claims.0.deadline"]).toEqual(
      ["Use an ISO date (YYYY-MM-DD)."]
    );
  });

  it.each([1, 2, 3])("accepts importance %i", (importance) => {
    const result = createThesisSchema.safeParse(withClaim({ importance }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.claims[0]?.importance).toBe(importance);
  });

  it.each([0, 4, 2.5, -1, "2", null, true])(
    "rejects the importance %p",
    (importance) => {
      expect(
        createThesisSchema.safeParse(withClaim({ importance })).success
      ).toBe(false);
    }
  );

  it.each([
    "baselineValue",
    "targetValue",
    "invalidationValue",
  ] as const)("rejects NaN and Infinity for %s", (field) => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(createThesisSchema.safeParse(withClaim({ [field]: value })).success).toBe(
        false
      );
    }
  });

  it("rejects a numeric string in place of a number", () => {
    expect(
      createThesisSchema.safeParse(withClaim({ baselineValue: "0.15" })).success
    ).toBe(false);
  });

  it("rejects an unknown claim field", () => {
    expect(
      createThesisSchema.safeParse(withClaim({ confidence: 0.9 })).success
    ).toBe(false);
    expect(
      createThesisSchema.safeParse(withClaim({ score: 100 })).success
    ).toBe(false);
  });

  it("rejects a claim missing a required field", () => {
    for (const field of [
      "kind",
      "statement",
      "metricDescription",
      "baselineValue",
      "targetValue",
      "invalidationValue",
      "deadline",
      "importance",
    ] as const) {
      const claim: Record<string, unknown> = { ...VALID_CLAIM };
      delete claim[field];
      expect(
        createThesisSchema.safeParse({ ...VALID_CREATE, claims: [claim] }).success
      ).toBe(false);
    }
  });

  it("rejects claim ids on CREATE (the store assigns them)", () => {
    // Ids sent on create used to validate and then be silently discarded;
    // the create schema now rejects them outright (strict, no id field).
    expect(
      createThesisSchema.safeParse(withClaim({ id: randomUUID() })).success
    ).toBe(false);
  });

  it("accepts a uuid claim id on REVISE and rejects a non-uuid one", () => {
    const revise = (id: unknown) =>
      reviseThesisSchema.safeParse({
        ...VALID_REVISE,
        claims: [{ ...VALID_CLAIM, id }],
      });
    expect(revise(randomUUID()).success).toBe(true);
    expect(revise("claim-1").success).toBe(false);
  });
});

describe("createThesisSchema strictness", () => {
  it("rejects an unknown top-level field", () => {
    expect(
      createThesisSchema.safeParse({ ...VALID_CREATE, notes: "extra" }).success
    ).toBe(false);
  });

  it("rejects an attempt to set server-owned fields", () => {
    for (const injected of [
      { id: randomUUID() },
      { status: "active" },
      { currentVersion: 5 },
      { createdAt: "2026-01-01T00:00:00.000Z" },
      { updatedAt: "2026-01-01T00:00:00.000Z" },
      { versions: [] },
    ]) {
      expect(
        createThesisSchema.safeParse({ ...VALID_CREATE, ...injected }).success
      ).toBe(false);
    }
  });
});

describe("reviseThesisSchema", () => {
  it("parses a full revision payload", () => {
    const result = reviseThesisSchema.safeParse(VALID_REVISE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(VALID_REVISE);
  });

  it("requires a revisionNote", () => {
    const { revisionNote: _note, ...withoutNote } = VALID_REVISE;

    const result = reviseThesisSchema.safeParse(withoutNote);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      toValidationFailure(result.error).details.revisionNote
    ).toBeDefined();
  });

  it("accepts a revisionNote of 5 and 2000 characters", () => {
    for (const length of [5, 2_000]) {
      expect(
        reviseThesisSchema.safeParse({
          ...VALID_REVISE,
          revisionNote: "a".repeat(length),
        }).success
      ).toBe(true);
    }
  });

  it("rejects a revisionNote of 4 and 2001 characters", () => {
    for (const length of [4, 2_001]) {
      expect(
        reviseThesisSchema.safeParse({
          ...VALID_REVISE,
          revisionNote: "a".repeat(length),
        }).success
      ).toBe(false);
    }
  });

  it("rejects a whitespace-only revisionNote and trims a valid one", () => {
    expect(
      reviseThesisSchema.safeParse({ ...VALID_REVISE, revisionNote: "        " })
        .success
    ).toBe(false);

    const result = reviseThesisSchema.safeParse({
      ...VALID_REVISE,
      revisionNote: "  Q2 changed the target.  ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.revisionNote).toBe("Q2 changed the target.");
  });

  it("applies the same body rules as creation", () => {
    expect(
      reviseThesisSchema.safeParse({ ...VALID_REVISE, title: "ab" }).success
    ).toBe(false);
    expect(
      reviseThesisSchema.safeParse({ ...VALID_REVISE, summary: "too short" })
        .success
    ).toBe(false);
    expect(
      reviseThesisSchema.safeParse({ ...VALID_REVISE, claims: [] }).success
    ).toBe(false);
    expect(
      reviseThesisSchema.safeParse({
        ...VALID_REVISE,
        claims: [{ ...VALID_CLAIM, importance: 4 }],
      }).success
    ).toBe(false);
    expect(
      reviseThesisSchema.safeParse({
        ...VALID_REVISE,
        claims: [{ ...VALID_CLAIM, deadline: "March 2027" }],
      }).success
    ).toBe(false);
  });

  it("accepts a claim carrying an existing uuid id", () => {
    const claimId = randomUUID();
    const result = reviseThesisSchema.safeParse({
      ...VALID_REVISE,
      claims: [{ ...VALID_CLAIM, id: claimId }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.claims[0]?.id).toBe(claimId);
  });

  it("rejects a claim id that is not a uuid", () => {
    for (const id of ["claim-1", "", "123", randomUUID().replace(/-/g, "")]) {
      const result = reviseThesisSchema.safeParse({
        ...VALID_REVISE,
        claims: [{ ...VALID_CLAIM, id }],
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        toValidationFailure(result.error).details["claims.0.id"]
      ).toBeDefined();
    }
  });

  it("treats the claim id as optional", () => {
    const result = reviseThesisSchema.safeParse(VALID_REVISE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.claims[0]?.id).toBeUndefined();
  });

  it("rejects an unknown top-level field, including subjectRef", () => {
    expect(
      reviseThesisSchema.safeParse({
        ...VALID_REVISE,
        subjectRef: "demo:stock-us-northstar-software",
      }).success
    ).toBe(false);
    expect(
      reviseThesisSchema.safeParse({ ...VALID_REVISE, version: 2 }).success
    ).toBe(false);
    expect(
      reviseThesisSchema.safeParse({ ...VALID_REVISE, status: "active" }).success
    ).toBe(false);
  });
});

describe("statusChangeSchema", () => {
  it.each(["active", "invalidated", "realized", "abandoned"])(
    "accepts the status %s",
    (status) => {
      const result = statusChangeSchema.safeParse({
        status,
        note: "Recording the reason for this change.",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe(status);
    }
  );

  it.each(["closed", "open", "Active", "watching", "", null, 1])(
    "rejects the status %p",
    (status) => {
      expect(
        statusChangeSchema.safeParse({ status, note: "A sufficient note." })
          .success
      ).toBe(false);
    }
  );

  it("requires a note", () => {
    const result = statusChangeSchema.safeParse({ status: "realized" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toValidationFailure(result.error).details.note).toBeDefined();
  });

  it("bounds the note at 5 and 2000 characters", () => {
    for (const length of [5, 2_000]) {
      expect(
        statusChangeSchema.safeParse({
          status: "abandoned",
          note: "a".repeat(length),
        }).success
      ).toBe(true);
    }
    for (const length of [4, 2_001]) {
      expect(
        statusChangeSchema.safeParse({
          status: "abandoned",
          note: "a".repeat(length),
        }).success
      ).toBe(false);
    }
  });

  it("rejects a whitespace-only note", () => {
    expect(
      statusChangeSchema.safeParse({ status: "realized", note: "        " })
        .success
    ).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(
      statusChangeSchema.safeParse({
        status: "realized",
        note: "A sufficient note.",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }).success
    ).toBe(false);
  });
});

describe("noteSchema", () => {
  it("accepts a note of 1 and 5000 characters", () => {
    for (const length of [1, 5_000]) {
      expect(noteSchema.safeParse({ text: "a".repeat(length) }).success).toBe(
        true
      );
    }
  });

  it("rejects a note of 0 and 5001 characters", () => {
    expect(noteSchema.safeParse({ text: "" }).success).toBe(false);
    expect(noteSchema.safeParse({ text: "a".repeat(5_001) }).success).toBe(false);
  });

  it("rejects a whitespace-only note after trimming", () => {
    for (const text of [" ", "   ", "\n\t "]) {
      expect(noteSchema.safeParse({ text }).success).toBe(false);
    }
  });

  it("returns the trimmed text", () => {
    const result = noteSchema.safeParse({
      text: "  Read the risk factors today.  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.text).toBe("Read the risk factors today.");
  });

  it("preserves Japanese note text", () => {
    const result = noteSchema.safeParse({ text: "有価証券報告書を読んだ。" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.text).toBe("有価証券報告書を読んだ。");
  });

  it("requires the text field and rejects unknown fields", () => {
    expect(noteSchema.safeParse({}).success).toBe(false);
    expect(noteSchema.safeParse({ note: "wrong key" }).success).toBe(false);
    expect(
      noteSchema.safeParse({ text: "A note.", kind: "note" }).success
    ).toBe(false);
    expect(noteSchema.safeParse({ text: 42 }).success).toBe(false);
  });
});

describe("toValidationFailure", () => {
  it("returns a stable failure shape", () => {
    const result = createThesisSchema.safeParse({
      ...VALID_CREATE,
      title: "ab",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const failure = toValidationFailure(result.error);
    expect(failure.ok).toBe(false);
    expect(failure.message).toBe("The thesis request is invalid.");
    expect(failure.details.title).toBeInstanceOf(Array);
    expect(typeof failure.details.title?.[0]).toBe("string");
  });

  it("keys details by field name", () => {
    const result = createThesisSchema.safeParse({
      ...VALID_CREATE,
      subjectRef: "portfolio:x",
      subjectLabel: "   ",
      title: "ab",
      summary: "short",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(toValidationFailure(result.error).details).sort()).toEqual([
      "subjectLabel",
      "subjectRef",
      "summary",
      "title",
    ]);
  });

  it("joins a nested path with dots", () => {
    const result = createThesisSchema.safeParse({
      ...VALID_CREATE,
      claims: [
        { ...VALID_CLAIM },
        { ...VALID_CLAIM, statement: "ab", importance: 9 },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const details = toValidationFailure(result.error).details;
    expect(Object.keys(details).sort()).toEqual([
      "claims.1.importance",
      "claims.1.statement",
    ]);
    expect(details["claims.1.statement"]?.length).toBeGreaterThan(0);
  });

  it("uses the request key when the issue has no path", () => {
    const result = createThesisSchema.safeParse(null);

    expect(result.success).toBe(false);
    if (result.success) return;
    const details = toValidationFailure(result.error).details;
    expect(Object.keys(details)).toEqual(["request"]);
    expect(details.request?.length).toBeGreaterThan(0);
  });

  it("collects multiple issues for the same field into one array", () => {
    const result = createThesisSchema.safeParse({
      ...VALID_CREATE,
      subjectRef: 42,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = toValidationFailure(result.error).details.subjectRef;
    expect(issues).toBeInstanceOf(Array);
    expect(issues?.length).toBeGreaterThanOrEqual(1);
  });

  it("does not leak a data payload on failure", () => {
    const result = createThesisSchema.safeParse({ ...VALID_CREATE, title: "ab" });

    expect(result.success).toBe(false);
    if (result.success) return;
    const failure = toValidationFailure(result.error);
    expect("data" in failure).toBe(false);
    expect("request" in failure).toBe(false);
  });
});
