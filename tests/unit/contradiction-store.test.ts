import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** The store is server-only; neutralize the guard for node-env tests. */
vi.mock("server-only", () => ({}));

import * as evaluationStore from "@/lib/contradiction/store";
import {
  closeEvaluationStore,
  getEvaluation,
  insertEvaluationRun,
  listEvaluationRuns,
  openEvaluationStoreAt,
  setUserOverride,
  type NewEvaluationRow,
} from "@/lib/contradiction/store";
import type {
  ClaimEvaluation,
  EvidenceClassification,
} from "@/lib/contradiction/types";

/**
 * Every test gets a throwaway SQLite file under the OS temp dir via the
 * `openEvaluationStoreAt` hook, so the real driver exercises the append-only
 * rules (a run inserts new rows; an override annotates a row and never
 * replaces the AI classification) without touching the gitignored user-data
 * directory.
 *
 * Timestamps come from fake timers: run ordering is part of the contract and
 * a real clock can produce ties inside one millisecond.
 */

const START_TIME = new Date("2026-08-14T09:00:00.000Z");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const THESIS_ID = "11111111-1111-4111-8111-111111111111";

let dbPath: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
  dbPath = path.join(
    os.tmpdir(),
    `mt-evaluations-${randomUUID()}`,
    "evaluations.sqlite"
  );
  openEvaluationStoreAt(dbPath);
});

afterEach(() => {
  closeEvaluationStore();
  // WAL mode leaves sidecar files; remove the whole throwaway directory.
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  vi.useRealTimers();
});

/** Move the clock forward so the next write gets a strictly later timestamp. */
function tick(seconds = 1): void {
  vi.setSystemTime(new Date(Date.now() + seconds * 1_000));
}

function makeRow(overrides: Partial<NewEvaluationRow> = {}): NewEvaluationRow {
  return {
    thesisId: THESIS_ID,
    thesisVersion: 2,
    claimId: "claim-margin",
    claimStatement: "Operating margin reaches 15% by FY2027.",
    classification: "MODERATELY_SUPPORTS",
    rationale: "Reported operating margin moved from 11.2% to 13.4%.",
    evidenceExcerpts: ["operating margin of 13.4%", "up from 11.2%"],
    evidenceSummary:
      "Revenue FY2025 vs FY2024 (0000320193-26-000010); Item 7 MD&A excerpt",
    evidenceAsOf: "2026-02-14",
    modelId: "fixture-model-id",
    promptVersion: "claim-evaluation-v1",
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

function requireEvaluation(
  evaluation: ClaimEvaluation | null
): ClaimEvaluation {
  if (evaluation === null) throw new Error("Expected the evaluation to exist.");
  return evaluation;
}

/** The single evaluation of a single-row run, read back from the store. */
function insertOne(overrides: Partial<NewEvaluationRow> = {}): ClaimEvaluation {
  insertEvaluationRun([makeRow(overrides)]);
  const runs = listEvaluationRuns(overrides.thesisId ?? THESIS_ID);
  return at(at(runs, 0).evaluations, 0);
}

/** The AI-authored fields, which an override must never touch. */
function aiFields(evaluation: ClaimEvaluation) {
  return {
    id: evaluation.id,
    thesisId: evaluation.thesisId,
    thesisVersion: evaluation.thesisVersion,
    claimId: evaluation.claimId,
    claimStatement: evaluation.claimStatement,
    classification: evaluation.classification,
    rationale: evaluation.rationale,
    evidenceExcerpts: evaluation.evidenceExcerpts,
    evidenceSummary: evaluation.evidenceSummary,
    evidenceAsOf: evaluation.evidenceAsOf,
    modelId: evaluation.modelId,
    promptVersion: evaluation.promptVersion,
    createdAt: evaluation.createdAt,
  };
}

describe("insertEvaluationRun", () => {
  it("returns a run id and the run timestamp", () => {
    const result = insertEvaluationRun([makeRow()]);

    expect(result.runId).toMatch(UUID_PATTERN);
    expect(result.createdAt).toBe(START_TIME.toISOString());
  });

  it("groups every row of one call under a single run", () => {
    const { runId, createdAt } = insertEvaluationRun([
      makeRow({ claimId: "claim-a" }),
      makeRow({ claimId: "claim-b" }),
      makeRow({ claimId: "claim-c" }),
    ]);

    const runs = listEvaluationRuns(THESIS_ID);
    expect(runs).toHaveLength(1);
    const run = at(runs, 0);
    expect(run.runId).toBe(runId);
    expect(run.createdAt).toBe(createdAt);
    expect(run.thesisVersion).toBe(2);
    expect(run.evaluations).toHaveLength(3);
    expect(run.evaluations.map((evaluation) => evaluation.claimId)).toEqual([
      "claim-a",
      "claim-b",
      "claim-c",
    ]);
    for (const evaluation of run.evaluations) {
      expect(evaluation.createdAt).toBe(createdAt);
    }
  });

  it("gives every row its own evaluation id", () => {
    insertEvaluationRun([
      makeRow({ claimId: "claim-a" }),
      makeRow({ claimId: "claim-b" }),
    ]);

    const ids = at(listEvaluationRuns(THESIS_ID), 0).evaluations.map(
      (evaluation) => evaluation.id
    );
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(UUID_PATTERN);
    expect(new Set(ids).size).toBe(2);
  });

  it("round-trips every field of the row", () => {
    const row = makeRow();
    const evaluation = insertOne();

    expect(evaluation.thesisId).toBe(row.thesisId);
    expect(evaluation.thesisVersion).toBe(row.thesisVersion);
    expect(evaluation.claimId).toBe(row.claimId);
    expect(evaluation.claimStatement).toBe(row.claimStatement);
    expect(evaluation.classification).toBe(row.classification);
    expect(evaluation.rationale).toBe(row.rationale);
    expect(evaluation.evidenceExcerpts).toEqual(row.evidenceExcerpts);
    expect(evaluation.evidenceSummary).toBe(row.evidenceSummary);
    expect(evaluation.evidenceAsOf).toBe(row.evidenceAsOf);
    expect(evaluation.modelId).toBe(row.modelId);
    expect(evaluation.promptVersion).toBe(row.promptVersion);
    expect(evaluation.createdAt).toBe(START_TIME.toISOString());
  });

  it("leaves the override fields null until a user overrides", () => {
    const evaluation = insertOne();

    expect(evaluation.userOverride).toBeNull();
    expect(evaluation.userOverrideNote).toBeNull();
    expect(evaluation.userOverrideAt).toBeNull();
  });

  it("maps rows to the domain shape rather than raw column names", () => {
    expect(Object.keys(insertOne()).sort()).toEqual([
      "claimId",
      "claimStatement",
      "classification",
      "createdAt",
      "evidenceAsOf",
      "evidenceExcerpts",
      "evidenceSummary",
      "id",
      "modelId",
      "promptVersion",
      "rationale",
      "thesisId",
      "thesisVersion",
      "userOverride",
      "userOverrideAt",
      "userOverrideNote",
    ]);
  });

  const classifications: EvidenceClassification[] = [
    "STRONGLY_SUPPORTS",
    "MODERATELY_SUPPORTS",
    "NEUTRAL",
    "MODERATELY_CONTRADICTS",
    "STRONGLY_CONTRADICTS",
    "INSUFFICIENT_EVIDENCE",
  ];

  it.each(classifications)("stores the %s classification", (classification) => {
    expect(insertOne({ classification }).classification).toBe(classification);
  });

  it("preserves a null evidence date as null, not an empty string", () => {
    const evaluation = insertOne({ evidenceAsOf: null });

    expect(evaluation.evidenceAsOf).toBeNull();
    expect(evaluation.evidenceAsOf).not.toBe("");
  });

  it("preserves a non-null evidence date verbatim", () => {
    expect(insertOne({ evidenceAsOf: "2025-12-31" }).evidenceAsOf).toBe(
      "2025-12-31"
    );
  });

  it("round-trips an empty excerpt array as an array, not null", () => {
    const evaluation = insertOne({
      classification: "INSUFFICIENT_EVIDENCE",
      evidenceExcerpts: [],
    });

    expect(evaluation.evidenceExcerpts).toEqual([]);
    expect(Array.isArray(evaluation.evidenceExcerpts)).toBe(true);
  });

  it("round-trips excerpts containing quotes, newlines and non-ASCII text", () => {
    const excerpts = [
      'Management said margins "normalized"\nabove 15%.',
      "営業利益率は13.4%に上昇した。",
      "Revenue: 1,320,000,000 → 1,180,000,000 (-10.6%)",
    ];
    const evaluation = insertOne({
      claimStatement: "営業利益率が15%に達する。",
      evidenceExcerpts: excerpts,
    });

    expect(evaluation.evidenceExcerpts).toEqual(excerpts);
    expect(evaluation.claimStatement).toBe("営業利益率が15%に達する。");
  });

  it("keeps the excerpt ordering supplied by the caller", () => {
    const excerpts = ["third supplied first", "first", "second"];

    expect(insertOne({ evidenceExcerpts: excerpts }).evidenceExcerpts).toEqual(
      excerpts
    );
  });

  it("accepts an empty run without creating a phantom run", () => {
    const result = insertEvaluationRun([]);

    expect(result.runId).toMatch(UUID_PATTERN);
    expect(listEvaluationRuns(THESIS_ID)).toEqual([]);
  });

  it("scopes rows to their own thesis", () => {
    const otherThesisId = "22222222-2222-4222-8222-222222222222";
    insertEvaluationRun([makeRow()]);
    insertEvaluationRun([makeRow({ thesisId: otherThesisId })]);

    expect(listEvaluationRuns(THESIS_ID)).toHaveLength(1);
    expect(listEvaluationRuns(otherThesisId)).toHaveLength(1);
    expect(
      at(at(listEvaluationRuns(otherThesisId), 0).evaluations, 0).thesisId
    ).toBe(otherThesisId);
  });
});

describe("listEvaluationRuns", () => {
  it("returns an empty array for an unknown thesis", () => {
    insertEvaluationRun([makeRow()]);

    expect(listEvaluationRuns(randomUUID())).toEqual([]);
    expect(listEvaluationRuns("")).toEqual([]);
    expect(listEvaluationRuns("not-an-id")).toEqual([]);
  });

  it("returns an empty array on a fresh database", () => {
    expect(listEvaluationRuns(THESIS_ID)).toEqual([]);
  });

  it("returns one group per run, newest run first", () => {
    const first = insertEvaluationRun([
      makeRow({ claimId: "claim-a", rationale: "First run rationale." }),
      makeRow({ claimId: "claim-b", rationale: "First run rationale." }),
    ]);
    tick();
    const second = insertEvaluationRun([
      makeRow({ claimId: "claim-a", rationale: "Second run rationale." }),
      makeRow({ claimId: "claim-b", rationale: "Second run rationale." }),
    ]);

    const runs = listEvaluationRuns(THESIS_ID);
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.runId)).toEqual([second.runId, first.runId]);
    expect(runs.map((run) => run.createdAt)).toEqual([
      second.createdAt,
      first.createdAt,
    ]);
    expect(at(runs, 0).evaluations).toHaveLength(2);
    expect(at(at(runs, 0).evaluations, 0).rationale).toBe(
      "Second run rationale."
    );
    expect(at(at(runs, 1).evaluations, 0).rationale).toBe("First run rationale.");
  });

  it("keeps a re-run as new history instead of replacing the earlier verdict", () => {
    insertEvaluationRun([
      makeRow({ classification: "MODERATELY_SUPPORTS" }),
    ]);
    tick(86_400);
    insertEvaluationRun([
      makeRow({
        thesisVersion: 3,
        classification: "STRONGLY_CONTRADICTS",
        rationale: "Revenue declined against the growth claim.",
      }),
    ]);

    const runs = listEvaluationRuns(THESIS_ID);
    expect(runs).toHaveLength(2);
    expect(at(at(runs, 0).evaluations, 0).classification).toBe(
      "STRONGLY_CONTRADICTS"
    );
    expect(at(runs, 0).thesisVersion).toBe(3);
    expect(at(at(runs, 1).evaluations, 0).classification).toBe(
      "MODERATELY_SUPPORTS"
    );
    expect(at(runs, 1).thesisVersion).toBe(2);
  });

  it("orders evaluations inside a run by claim id", () => {
    insertEvaluationRun([
      makeRow({ claimId: "claim-c" }),
      makeRow({ claimId: "claim-a" }),
      makeRow({ claimId: "claim-b" }),
    ]);

    expect(
      at(listEvaluationRuns(THESIS_ID), 0).evaluations.map(
        (evaluation) => evaluation.claimId
      )
    ).toEqual(["claim-a", "claim-b", "claim-c"]);
  });

  it("keeps three runs distinct and ordered", () => {
    const runIds: string[] = [];
    for (const version of [1, 2, 3]) {
      runIds.push(
        insertEvaluationRun([makeRow({ thesisVersion: version })]).runId
      );
      tick();
    }

    const runs = listEvaluationRuns(THESIS_ID);
    expect(runs.map((run) => run.runId)).toEqual([...runIds].reverse());
    expect(runs.map((run) => run.thesisVersion)).toEqual([3, 2, 1]);
  });

  it("exposes only run metadata plus evaluations", () => {
    insertEvaluationRun([makeRow()]);

    expect(Object.keys(at(listEvaluationRuns(THESIS_ID), 0)).sort()).toEqual([
      "createdAt",
      "evaluations",
      "runId",
      "thesisVersion",
    ]);
  });
});

describe("getEvaluation", () => {
  it("returns the stored evaluation for a known id", () => {
    const stored = insertOne();

    expect(getEvaluation(stored.id)).toEqual(stored);
  });

  it("returns null for an unknown id", () => {
    insertEvaluationRun([makeRow()]);

    expect(getEvaluation(randomUUID())).toBeNull();
    expect(getEvaluation("")).toBeNull();
    expect(getEvaluation("not-an-id")).toBeNull();
  });

  it("fetches the requested row out of a multi-row run", () => {
    insertEvaluationRun([
      makeRow({ claimId: "claim-a", rationale: "Rationale A." }),
      makeRow({ claimId: "claim-b", rationale: "Rationale B." }),
    ]);
    const evaluations = at(listEvaluationRuns(THESIS_ID), 0).evaluations;

    expect(requireEvaluation(getEvaluation(at(evaluations, 1).id)).rationale).toBe(
      "Rationale B."
    );
  });
});

describe("setUserOverride", () => {
  it("records the override, note and timestamp", () => {
    const stored = insertOne();
    tick(30);
    const updated = requireEvaluation(
      setUserOverride(
        stored.id,
        "MODERATELY_CONTRADICTS",
        "The margin gain came from a one-off, so this cuts against the claim."
      )
    );

    expect(updated.userOverride).toBe("MODERATELY_CONTRADICTS");
    expect(updated.userOverrideNote).toBe(
      "The margin gain came from a one-off, so this cuts against the claim."
    );
    expect(updated.userOverrideAt).toBe(
      new Date(START_TIME.getTime() + 30_000).toISOString()
    );
  });

  it("annotates without replacing any AI-authored field", () => {
    const stored = insertOne();
    const before = aiFields(stored);

    tick();
    const updated = requireEvaluation(
      setUserOverride(stored.id, "NEUTRAL", "I read the evidence differently.")
    );

    expect(aiFields(updated)).toEqual(before);
    expect(updated.classification).toBe(stored.classification);
    expect(updated.rationale).toBe(stored.rationale);
    expect(updated.createdAt).toBe(stored.createdAt);
    expect(updated.userOverride).not.toBe(updated.classification);
  });

  it("persists the annotation, leaving the AI fields intact on re-read", () => {
    const stored = insertOne();
    const before = aiFields(stored);
    tick();
    setUserOverride(stored.id, "STRONGLY_CONTRADICTS", "Override note.");

    const reread = requireEvaluation(getEvaluation(stored.id));
    expect(aiFields(reread)).toEqual(before);
    expect(reread.userOverride).toBe("STRONGLY_CONTRADICTS");

    const listed = at(at(listEvaluationRuns(THESIS_ID), 0).evaluations, 0);
    expect(listed).toEqual(reread);
  });

  it("replaces only the override fields on a second override", () => {
    const stored = insertOne();
    const before = aiFields(stored);

    tick();
    const first = requireEvaluation(
      setUserOverride(stored.id, "NEUTRAL", "First reading.")
    );
    tick(600);
    const second = requireEvaluation(
      setUserOverride(
        stored.id,
        "STRONGLY_SUPPORTS",
        "Second reading, after the annual report."
      )
    );

    expect(second.userOverride).toBe("STRONGLY_SUPPORTS");
    expect(second.userOverrideNote).toBe(
      "Second reading, after the annual report."
    );
    expect(second.userOverrideAt).not.toBe(first.userOverrideAt);
    expect(
      new Date(second.userOverrideAt ?? "").getTime() >
        new Date(first.userOverrideAt ?? "").getTime()
    ).toBe(true);
    expect(aiFields(second)).toEqual(before);
  });

  const classifications: EvidenceClassification[] = [
    "STRONGLY_SUPPORTS",
    "MODERATELY_SUPPORTS",
    "NEUTRAL",
    "MODERATELY_CONTRADICTS",
    "STRONGLY_CONTRADICTS",
    "INSUFFICIENT_EVIDENCE",
  ];

  it.each(classifications)("accepts %s as an override", (override) => {
    const stored = insertOne();
    tick();

    expect(
      requireEvaluation(setUserOverride(stored.id, override, "Reasoned note."))
        .userOverride
    ).toBe(override);
  });

  it("accepts an override that agrees with the AI classification", () => {
    const stored = insertOne({ classification: "NEUTRAL" });
    tick();
    const updated = requireEvaluation(
      setUserOverride(stored.id, "NEUTRAL", "Agreed, for a different reason.")
    );

    expect(updated.classification).toBe("NEUTRAL");
    expect(updated.userOverride).toBe("NEUTRAL");
  });

  it("stores an empty note as an empty string, not null", () => {
    const stored = insertOne();
    tick();
    const updated = requireEvaluation(
      setUserOverride(stored.id, "NEUTRAL", "")
    );

    expect(updated.userOverrideNote).toBe("");
    expect(updated.userOverrideNote).not.toBeNull();
  });

  it("returns null for an unknown evaluation and writes nothing", () => {
    const stored = insertOne();

    expect(
      setUserOverride(randomUUID(), "NEUTRAL", "No such evaluation.")
    ).toBeNull();
    expect(setUserOverride("", "NEUTRAL", "No such evaluation.")).toBeNull();
    expect(getEvaluation(stored.id)).toEqual(stored);
  });

  it("does not touch sibling evaluations in the same run", () => {
    insertEvaluationRun([
      makeRow({ claimId: "claim-a" }),
      makeRow({ claimId: "claim-b" }),
    ]);
    const evaluations = at(listEvaluationRuns(THESIS_ID), 0).evaluations;
    const sibling = at(evaluations, 1);

    tick();
    setUserOverride(at(evaluations, 0).id, "NEUTRAL", "Only the first claim.");

    expect(getEvaluation(sibling.id)).toEqual(sibling);
    expect(requireEvaluation(getEvaluation(sibling.id)).userOverride).toBeNull();
  });
});

describe("store module surface", () => {
  it("exposes no update or delete operation beyond the override annotation", () => {
    // Evaluation history is append-only: a re-run inserts new rows and an
    // override annotates one row. A new export here should be a deliberate
    // decision, so this asserts the exact surface rather than a denylist.
    expect(Object.keys(evaluationStore).sort()).toEqual([
      "closeEvaluationStore",
      "getEvaluation",
      "insertEvaluationRun",
      "listEvaluationRuns",
      "openEvaluationStoreAt",
      "setUserOverride",
    ]);
  });
});

describe("persistence", () => {
  it("keeps runs and overrides across a close and reopen", () => {
    insertEvaluationRun([
      makeRow({ claimId: "claim-a" }),
      makeRow({ claimId: "claim-b" }),
    ]);
    tick();
    insertEvaluationRun([makeRow({ claimId: "claim-a", thesisVersion: 3 })]);
    const overrideTarget = at(
      at(listEvaluationRuns(THESIS_ID), 0).evaluations,
      0
    );
    tick();
    setUserOverride(
      overrideTarget.id,
      "MODERATELY_CONTRADICTS",
      "Survives a restart."
    );
    const before = listEvaluationRuns(THESIS_ID);

    closeEvaluationStore();
    openEvaluationStoreAt(dbPath);

    expect(listEvaluationRuns(THESIS_ID)).toEqual(before);
    expect(
      requireEvaluation(getEvaluation(overrideTarget.id)).userOverrideNote
    ).toBe("Survives a restart.");
  });

  it("starts empty when pointed at a different file", () => {
    insertEvaluationRun([makeRow()]);
    const otherPath = path.join(path.dirname(dbPath), "other.sqlite");

    openEvaluationStoreAt(otherPath);
    expect(listEvaluationRuns(THESIS_ID)).toEqual([]);

    openEvaluationStoreAt(dbPath);
    expect(listEvaluationRuns(THESIS_ID)).toHaveLength(1);
  });

  it("creates the parent directory for a new database path", () => {
    const nested = path.join(path.dirname(dbPath), "nested", "deep", "db.sqlite");
    openEvaluationStoreAt(nested);
    insertEvaluationRun([makeRow()]);

    expect(listEvaluationRuns(THESIS_ID)).toHaveLength(1);
    expect(fs.existsSync(nested)).toBe(true);

    openEvaluationStoreAt(dbPath);
  });

  it("tolerates closeEvaluationStore being called twice", () => {
    closeEvaluationStore();
    expect(() => closeEvaluationStore()).not.toThrow();
    openEvaluationStoreAt(dbPath);
  });
});
