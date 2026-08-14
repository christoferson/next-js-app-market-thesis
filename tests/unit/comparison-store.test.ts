import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** The store is server-only; neutralize the guard for node-env tests. */
vi.mock("server-only", () => ({}));

import * as comparisonStore from "@/lib/research/analysis/comparison-store";
import {
  closeComparisonStore,
  getLatestComparison,
  listComparisons,
  openComparisonStoreAt,
  saveComparison,
  type SaveComparisonInput,
  type StoredComparison,
} from "@/lib/research/analysis/comparison-store";
import type {
  ComparisonFinding,
  NarrativeComparison,
} from "@/lib/research/analysis/types";

/**
 * Every test gets a throwaway SQLite file under the OS temp dir via the
 * `openComparisonStoreAt` hook, so the real driver exercises the history
 * semantics (a regeneration appends; nothing is overwritten) without touching
 * the gitignored user-data directory.
 *
 * Timestamps come from fake timers: "latest for this filing pair" ordering is
 * part of the contract and a real clock can tie inside one millisecond.
 */

const START_TIME = new Date("2026-08-14T09:00:00.000Z");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUBJECT = "US:DEMO-ACME";
const CURRENT_SOURCE = "0000320193-26-000010";
const PRIOR_SOURCE = "0000320193-25-000008";

/** An EDGAR-shaped filing ref: proves the store keeps caller-owned shapes. */
const EDGAR_REF = {
  accessionNumber: CURRENT_SOURCE,
  filingDate: "2026-02-14",
  form: "10-K",
  periodOfReport: "2025-12-31",
  primaryDocumentUrl:
    "https://www.sec.gov/Archives/edgar/data/9999999/000032019326000010/demo-10k.htm",
} as const;

/** An EDINET-shaped filing ref: a completely different field set. */
const EDINET_REF = {
  docId: "S100DEMO",
  viewerUrl: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100DEMO",
  submitDateTime: "2026-06-25 09:00",
  ordinanceCode: "010",
  formCode: "030000",
  periodEnd: "2026-03-31",
  filerName: "デモ商事株式会社",
} as const;

let dbPath: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
  dbPath = path.join(
    os.tmpdir(),
    `mt-comparisons-${randomUUID()}`,
    "comparisons.sqlite"
  );
  openComparisonStoreAt(dbPath);
});

afterEach(() => {
  closeComparisonStore();
  // WAL mode leaves sidecar files; remove the whole throwaway directory.
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  vi.useRealTimers();
});

/** Move the clock forward so the next write gets a strictly later timestamp. */
function tick(seconds = 1): void {
  vi.setSystemTime(new Date(Date.now() + seconds * 1_000));
}

function makeFinding(
  overrides: Partial<ComparisonFinding> = {}
): ComparisonFinding {
  return {
    classification: "REPORTED_FACT",
    changeType: "modified",
    summary: "The risk factor on supplier concentration gained a named region.",
    currentEvidence: "a single supplier located in one region",
    priorEvidence: "a limited number of suppliers",
    ...overrides,
  };
}

function makeComparison(
  overrides: Partial<NarrativeComparison> = {}
): NarrativeComparison {
  return {
    findings: [
      makeFinding(),
      makeFinding({
        classification: "MANAGEMENT_CLAIM",
        changeType: "added",
        summary: "Management added a claim about pricing power.",
        priorEvidence: null,
      }),
      makeFinding({
        classification: "AI_INTERPRETATION",
        changeType: "removed",
        summary: "The prior discussion of a discontinued segment is gone.",
        currentEvidence: null,
      }),
    ],
    overallSummary:
      "The section is broadly unchanged. Supplier concentration is described " +
      "more specifically and a discontinued segment discussion was dropped.",
    modelId: "fixture-model-id",
    promptVersion: "narrative-comparison-v1",
    generatedAt: START_TIME.toISOString(),
    inputTokens: 8_412,
    outputTokens: 733,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<SaveComparisonInput> = {}
): SaveComparisonInput {
  return {
    subjectRef: SUBJECT,
    sectionTitle: "Item 1A. Risk Factors",
    currentSource: CURRENT_SOURCE,
    priorSource: PRIOR_SOURCE,
    currentRef: EDGAR_REF,
    priorRef: EDINET_REF,
    crossLingualNote: null,
    comparison: makeComparison(),
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

function requireComparison(
  stored: StoredComparison | null
): StoredComparison {
  if (stored === null) throw new Error("Expected the comparison to exist.");
  return stored;
}

describe("saveComparison", () => {
  it("returns a generated id and the write timestamp", () => {
    const stored = saveComparison(makeInput());

    expect(stored.id).toMatch(UUID_PATTERN);
    expect(stored.createdAt).toBe(START_TIME.toISOString());
  });

  it("gives every save its own id", () => {
    const first = saveComparison(makeInput());
    tick();
    const second = saveComparison(makeInput());

    expect(second.id).not.toBe(first.id);
    expect(second.id).toMatch(UUID_PATTERN);
  });

  it("round-trips every field through the database", () => {
    const input = makeInput();
    const written = saveComparison(input);

    const read = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(read).toEqual(written);
    expect(read.subjectRef).toBe(input.subjectRef);
    expect(read.sectionTitle).toBe(input.sectionTitle);
    expect(read.currentSource).toBe(input.currentSource);
    expect(read.priorSource).toBe(input.priorSource);
    expect(read.crossLingualNote).toBeNull();
    expect(read.comparison).toEqual(input.comparison);
  });

  it("round-trips the findings array with its ordering and null evidence", () => {
    const input = makeInput();
    saveComparison(input);

    const findings = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).comparison.findings;
    expect(findings).toHaveLength(3);
    expect(findings).toEqual(input.comparison.findings);
    expect(findings.map((finding) => finding.classification)).toEqual([
      "REPORTED_FACT",
      "MANAGEMENT_CLAIM",
      "AI_INTERPRETATION",
    ]);
    expect(findings.map((finding) => finding.changeType)).toEqual([
      "modified",
      "added",
      "removed",
    ]);
    expect(at(findings, 1).priorEvidence).toBeNull();
    expect(at(findings, 2).currentEvidence).toBeNull();
  });

  it("round-trips an empty findings array as an array, not null", () => {
    saveComparison(
      makeInput({
        comparison: makeComparison({
          findings: [],
          overallSummary: "No narrative changes were identified.",
        }),
      })
    );

    const findings = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).comparison.findings;
    expect(findings).toEqual([]);
    expect(Array.isArray(findings)).toBe(true);
  });

  it("preserves null token counts as null, not zero", () => {
    saveComparison(
      makeInput({
        comparison: makeComparison({ inputTokens: null, outputTokens: null }),
      })
    );

    const comparison = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).comparison;
    expect(comparison.inputTokens).toBeNull();
    expect(comparison.outputTokens).toBeNull();
    expect(comparison.inputTokens).not.toBe(0);
  });

  it("keeps an EDGAR-shaped current ref verbatim", () => {
    saveComparison(makeInput());

    expect(
      requireComparison(
        getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
      ).currentRef
    ).toEqual(EDGAR_REF);
  });

  it("keeps an EDINET-shaped prior ref verbatim, proving shape-agnosticism", () => {
    saveComparison(makeInput());

    const read = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    // The two refs share no field names: the store persists whatever JSON the
    // calling service owns rather than a single normalized filing-ref shape.
    expect(read.priorRef).toEqual(EDINET_REF);
    const edgarKeys = new Set<string>(Object.keys(EDGAR_REF));
    const sharedKeys = Object.keys(EDINET_REF).filter((key) =>
      edgarKeys.has(key)
    );
    expect(sharedKeys).toEqual([]);
  });

  it("round-trips arbitrary ref JSON shapes, including nesting and arrays", () => {
    const currentRef = {
      docId: "S100NEST",
      documents: [
        { seq: 1, title: "有価証券報告書", pages: null },
        { seq: 2, title: 'Exhibit "A"', pages: 12 },
      ],
      meta: { nested: { deeply: true }, tags: [] as string[] },
    };
    const priorRef = ["a bare array is also valid JSON", 42, null];
    saveComparison(makeInput({ currentRef, priorRef }));

    const read = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(read.currentRef).toEqual(currentRef);
    expect(read.priorRef).toEqual(priorRef);
  });

  it("round-trips a non-null cross-lingual note", () => {
    const note =
      "The prior filing is Japanese (EDINET); quotes were compared in " +
      "translation, so wording differences may be translation artifacts.";
    saveComparison(makeInput({ crossLingualNote: note }));

    expect(
      requireComparison(
        getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
      ).crossLingualNote
    ).toBe(note);
  });

  it("stores an empty cross-lingual note as an empty string, not null", () => {
    saveComparison(makeInput({ crossLingualNote: "" }));

    const read = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(read.crossLingualNote).toBe("");
    expect(read.crossLingualNote).not.toBeNull();
  });

  it("round-trips quotes, newlines and non-ASCII text in the comparison", () => {
    const comparison = makeComparison({
      findings: [
        makeFinding({
          summary: 'Management said margins "normalized"\nabove 15%.',
          currentEvidence: "営業利益率は13.4%に上昇した。",
          priorEvidence: "Revenue: 1,320,000,000 → 1,180,000,000 (-10.6%)",
        }),
      ],
      overallSummary: "リスク要因の記述が具体化した。\nSupplier名が追加された。",
    });
    saveComparison(
      makeInput({ sectionTitle: "事業等のリスク", comparison })
    );

    const read = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(read.sectionTitle).toBe("事業等のリスク");
    expect(read.comparison).toEqual(comparison);
  });

  it("exposes the domain shape rather than raw column names", () => {
    expect(Object.keys(saveComparison(makeInput())).sort()).toEqual([
      "comparison",
      "createdAt",
      "crossLingualNote",
      "currentRef",
      "currentSource",
      "id",
      "priorRef",
      "priorSource",
      "sectionTitle",
      "subjectRef",
    ]);
  });

  it("returns the same object that a later read produces", () => {
    const written = saveComparison(makeInput({ crossLingualNote: "note" }));

    expect(at(listComparisons(SUBJECT), 0)).toEqual(written);
  });
});

describe("getLatestComparison", () => {
  it("matches on subject and both filing sources", () => {
    const written = saveComparison(makeInput());

    expect(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).toEqual(written);
  });

  it("returns null on a fresh database", () => {
    expect(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).toBeNull();
  });

  it("returns null for an unknown subject", () => {
    saveComparison(makeInput());

    expect(
      getLatestComparison("US:UNKNOWN", CURRENT_SOURCE, PRIOR_SOURCE)
    ).toBeNull();
    expect(getLatestComparison("", CURRENT_SOURCE, PRIOR_SOURCE)).toBeNull();
  });

  it("returns null for the right subject with the wrong filing pair", () => {
    saveComparison(makeInput());

    expect(
      getLatestComparison(SUBJECT, "0000320193-27-000001", PRIOR_SOURCE)
    ).toBeNull();
    expect(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, "0000320193-24-000004")
    ).toBeNull();
    // A swapped pair is a different pair, not the same comparison reversed.
    expect(
      getLatestComparison(SUBJECT, PRIOR_SOURCE, CURRENT_SOURCE)
    ).toBeNull();
  });

  it("returns null for the same filing pair under a different subject", () => {
    saveComparison(makeInput({ subjectRef: "JP:DEMO-7203" }));

    expect(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).toBeNull();
    expect(
      getLatestComparison("JP:DEMO-7203", CURRENT_SOURCE, PRIOR_SOURCE)
    ).not.toBeNull();
  });

  it("does not match on the section title, only subject and pair", () => {
    // Section title is stored for display; it is not part of the read key.
    const written = saveComparison(
      makeInput({ sectionTitle: "Item 7. MD&A" })
    );

    expect(
      requireComparison(
        getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
      ).sectionTitle
    ).toBe(written.sectionTitle);
  });
});

describe("history semantics", () => {
  it("returns the second save for the same subject and pair", () => {
    saveComparison(
      makeInput({
        comparison: makeComparison({ overallSummary: "First generation." }),
      })
    );
    tick();
    const second = saveComparison(
      makeInput({
        comparison: makeComparison({ overallSummary: "Second generation." }),
      })
    );

    const latest = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(latest.id).toBe(second.id);
    expect(latest.comparison.overallSummary).toBe("Second generation.");
  });

  it("keeps both saves in the history, newest first", () => {
    const first = saveComparison(
      makeInput({
        comparison: makeComparison({ overallSummary: "First generation." }),
      })
    );
    tick();
    const second = saveComparison(
      makeInput({
        comparison: makeComparison({ overallSummary: "Second generation." }),
      })
    );

    const history = listComparisons(SUBJECT);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(history.map((entry) => entry.createdAt)).toEqual([
      second.createdAt,
      first.createdAt,
    ]);
  });

  it("leaves the earlier save fully retrievable, nothing overwritten", () => {
    const first = saveComparison(
      makeInput({
        crossLingualNote: "First run note.",
        currentRef: EDGAR_REF,
        comparison: makeComparison({
          findings: [makeFinding({ summary: "First run finding." })],
          overallSummary: "First generation.",
          modelId: "model-a",
          inputTokens: 1_000,
        }),
      })
    );
    tick();
    saveComparison(
      makeInput({
        crossLingualNote: null,
        comparison: makeComparison({
          overallSummary: "Second generation.",
          modelId: "model-b",
        }),
      })
    );

    // A regeneration costs money; the earlier answer must survive intact.
    const earlier = at(listComparisons(SUBJECT), 1);
    expect(earlier).toEqual(first);
    expect(earlier.crossLingualNote).toBe("First run note.");
    expect(earlier.currentRef).toEqual(EDGAR_REF);
    expect(earlier.comparison.modelId).toBe("model-a");
    expect(earlier.comparison.inputTokens).toBe(1_000);
    expect(earlier.comparison.findings).toHaveLength(1);
    expect(at(earlier.comparison.findings, 0).summary).toBe(
      "First run finding."
    );
  });

  it("keeps three regenerations of one pair ordered newest first", () => {
    const ids: string[] = [];
    for (const label of ["first", "second", "third"]) {
      ids.push(
        saveComparison(
          makeInput({
            comparison: makeComparison({ overallSummary: `The ${label} run.` }),
          })
        ).id
      );
      tick();
    }

    const history = listComparisons(SUBJECT);
    expect(history.map((entry) => entry.id)).toEqual([...ids].reverse());
    expect(history.map((entry) => entry.comparison.overallSummary)).toEqual([
      "The third run.",
      "The second run.",
      "The first run.",
    ]);
    expect(
      requireComparison(
        getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
      ).id
    ).toBe(at(ids, 2));
  });
});

describe("new filing pairs", () => {
  const NEWER_SOURCE = "0000320193-27-000012";

  it("returns the new comparison for the new pair", () => {
    saveComparison(
      makeInput({
        comparison: makeComparison({ overallSummary: "FY2025 vs FY2024." }),
      })
    );
    tick(86_400);
    const newer = saveComparison(
      makeInput({
        currentSource: NEWER_SOURCE,
        priorSource: CURRENT_SOURCE,
        comparison: makeComparison({ overallSummary: "FY2026 vs FY2025." }),
      })
    );

    const latest = requireComparison(
      getLatestComparison(SUBJECT, NEWER_SOURCE, CURRENT_SOURCE)
    );
    expect(latest.id).toBe(newer.id);
    expect(latest.comparison.overallSummary).toBe("FY2026 vs FY2025.");
  });

  it("still returns the old comparison for the old pair", () => {
    const older = saveComparison(
      makeInput({
        comparison: makeComparison({ overallSummary: "FY2025 vs FY2024." }),
      })
    );
    tick(86_400);
    saveComparison(
      makeInput({
        currentSource: NEWER_SOURCE,
        priorSource: CURRENT_SOURCE,
        comparison: makeComparison({ overallSummary: "FY2026 vs FY2025." }),
      })
    );

    // Both pairs coexist: a new filing does not invalidate earlier analysis,
    // it simply stops matching the current read key.
    const old = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(old).toEqual(older);
    expect(old.comparison.overallSummary).toBe("FY2025 vs FY2024.");
    expect(listComparisons(SUBJECT)).toHaveLength(2);
  });

  it("lists every pair for the subject in one history", () => {
    saveComparison(makeInput());
    tick();
    saveComparison(
      makeInput({ currentSource: NEWER_SOURCE, priorSource: CURRENT_SOURCE })
    );

    const history = listComparisons(SUBJECT);
    expect(
      history.map((entry) => [entry.currentSource, entry.priorSource])
    ).toEqual([
      [NEWER_SOURCE, CURRENT_SOURCE],
      [CURRENT_SOURCE, PRIOR_SOURCE],
    ]);
  });
});

describe("model and prompt changes", () => {
  it("returns the newest row regardless of the model that produced it", () => {
    saveComparison(
      makeInput({
        comparison: makeComparison({
          modelId: "model-a",
          overallSummary: "Generated by model A.",
        }),
      })
    );
    tick();
    const withModelB = saveComparison(
      makeInput({
        comparison: makeComparison({
          modelId: "model-b",
          overallSummary: "Generated by model B.",
        }),
      })
    );

    const latest = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(latest.id).toBe(withModelB.id);
    expect(latest.comparison.modelId).toBe("model-b");
  });

  it("still returns a row whose model differs from the current config", () => {
    // The read takes no model argument at all, so a config change cannot hide
    // an existing comparison; regeneration is an explicit user action.
    const stored = saveComparison(
      makeInput({
        comparison: makeComparison({ modelId: "retired-model-id" }),
      })
    );

    expect(getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)).toEqual(
      stored
    );
    expect(getLatestComparison).toHaveLength(3);
  });

  it("returns the newest row regardless of the prompt version", () => {
    saveComparison(
      makeInput({
        comparison: makeComparison({ promptVersion: "narrative-comparison-v1" }),
      })
    );
    tick();
    const v2 = saveComparison(
      makeInput({
        comparison: makeComparison({ promptVersion: "narrative-comparison-v2" }),
      })
    );

    const latest = requireComparison(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    );
    expect(latest.id).toBe(v2.id);
    expect(latest.comparison.promptVersion).toBe("narrative-comparison-v2");
  });

  it("keeps the older model's result in the history", () => {
    const modelA = saveComparison(
      makeInput({
        comparison: makeComparison({ modelId: "model-a" }),
      })
    );
    tick();
    saveComparison(
      makeInput({ comparison: makeComparison({ modelId: "model-b" }) })
    );

    const history = listComparisons(SUBJECT);
    expect(history.map((entry) => entry.comparison.modelId)).toEqual([
      "model-b",
      "model-a",
    ]);
    expect(at(history, 1)).toEqual(modelA);
  });
});

describe("listComparisons", () => {
  it("returns an empty array for an unknown subject", () => {
    saveComparison(makeInput());

    expect(listComparisons("US:UNKNOWN")).toEqual([]);
    expect(listComparisons("")).toEqual([]);
    expect(listComparisons("not-a-subject-ref")).toEqual([]);
  });

  it("returns an empty array on a fresh database", () => {
    expect(listComparisons(SUBJECT)).toEqual([]);
  });

  it("scopes the history to one subject", () => {
    saveComparison(makeInput());
    tick();
    saveComparison(makeInput({ subjectRef: "JP:DEMO-7203" }));

    expect(listComparisons(SUBJECT)).toHaveLength(1);
    expect(at(listComparisons(SUBJECT), 0).subjectRef).toBe(SUBJECT);
    expect(listComparisons("JP:DEMO-7203")).toHaveLength(1);
    expect(at(listComparisons("JP:DEMO-7203"), 0).subjectRef).toBe(
      "JP:DEMO-7203"
    );
  });
});

describe("store module surface", () => {
  it("exposes exactly the save, read and test-hook operations", () => {
    // Comparison history is append-only: a regeneration inserts a new row.
    // A new export here should be a deliberate decision, so this asserts the
    // exact surface rather than a denylist.
    expect(Object.keys(comparisonStore).sort()).toEqual([
      "closeComparisonStore",
      "getLatestComparison",
      "listComparisons",
      "openComparisonStoreAt",
      "saveComparison",
    ]);
  });
});

describe("persistence", () => {
  it("keeps every saved comparison across a close and reopen", () => {
    saveComparison(makeInput({ crossLingualNote: "Survives a restart." }));
    tick();
    saveComparison(
      makeInput({ currentSource: "0000320193-27-000012", priorSource: CURRENT_SOURCE })
    );
    const before = listComparisons(SUBJECT);

    closeComparisonStore();
    openComparisonStoreAt(dbPath);

    expect(listComparisons(SUBJECT)).toEqual(before);
    expect(
      requireComparison(
        getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
      ).crossLingualNote
    ).toBe("Survives a restart.");
  });

  it("starts empty when pointed at a different file", () => {
    saveComparison(makeInput());
    const otherPath = path.join(path.dirname(dbPath), "other.sqlite");

    openComparisonStoreAt(otherPath);
    expect(listComparisons(SUBJECT)).toEqual([]);
    expect(
      getLatestComparison(SUBJECT, CURRENT_SOURCE, PRIOR_SOURCE)
    ).toBeNull();

    openComparisonStoreAt(dbPath);
    expect(listComparisons(SUBJECT)).toHaveLength(1);
  });

  it("creates the parent directory for a new database path", () => {
    const nested = path.join(path.dirname(dbPath), "nested", "deep", "db.sqlite");
    openComparisonStoreAt(nested);
    saveComparison(makeInput());

    expect(listComparisons(SUBJECT)).toHaveLength(1);
    expect(fs.existsSync(nested)).toBe(true);

    openComparisonStoreAt(dbPath);
  });

  it("tolerates closeComparisonStore being called twice", () => {
    closeComparisonStore();
    expect(() => closeComparisonStore()).not.toThrow();
    openComparisonStoreAt(dbPath);
  });
});
