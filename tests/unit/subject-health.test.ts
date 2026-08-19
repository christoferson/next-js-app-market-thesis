import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** The read model and both stores are server-only; neutralize the guard. */
vi.mock("server-only", () => ({}));

import {
  getSubjectThesisHealth,
  getThesisHealthBySubject,
  type SubjectThesisHealth,
} from "@/lib/subjects/health";
import {
  closeThesisStore,
  createThesis,
  openThesisStoreAt,
  reviseThesis,
  setThesisStatus,
  type NewThesisInput,
  type ReviseThesisInput,
} from "@/lib/thesis/store";
import {
  closeEvaluationStore,
  getEvaluation,
  insertEvaluationRun,
  listEvaluationRuns,
  openEvaluationStoreAt,
  setUserOverride,
  type NewEvaluationRow,
} from "@/lib/contradiction/store";
import type { ThesisClaim, ThesisWithHistory } from "@/lib/thesis/types";
import type { EvidenceClassification } from "@/lib/contradiction/types";

/**
 * Health joins two independent SQLite stores, so each test points BOTH at
 * throwaway files under the OS temp dir. Timestamps come from fake timers:
 * "newest run wins" and "most recently updated thesis first" are part of the
 * contract, and a real clock can tie inside one millisecond.
 */

const START_TIME = new Date("2026-08-14T09:00:00.000Z");
const SUBJECT = "demo:stock-us-northstar-software";
const OTHER_SUBJECT = "research-jp:toyota";

let tempDir: string;
let thesisDbPath: string;
let evaluationDbPath: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
  tempDir = path.join(os.tmpdir(), `mt-subject-health-${randomUUID()}`);
  thesisDbPath = path.join(tempDir, "theses.sqlite");
  evaluationDbPath = path.join(tempDir, "evaluations.sqlite");
  openThesisStoreAt(thesisDbPath);
  openEvaluationStoreAt(evaluationDbPath);
});

afterEach(() => {
  closeThesisStore();
  closeEvaluationStore();
  // WAL mode leaves sidecar files; remove the whole throwaway directory.
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.useRealTimers();
});

/** Move the clock forward so the next write gets a strictly later timestamp. */
function tick(seconds = 1): void {
  vi.setSystemTime(new Date(Date.now() + seconds * 1_000));
}

/** Index access with a clear failure instead of an `undefined` deep-equal. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index} of ${items.length}.`);
  }
  return item;
}

type HealthEntry = SubjectThesisHealth["theses"][number];
type LastCheck = NonNullable<HealthEntry["lastCheck"]>;

function requireLastCheck(entry: HealthEntry): LastCheck {
  if (entry.lastCheck === null) {
    throw new Error("Expected a last check to be present.");
  }
  return entry.lastCheck;
}

function requireHealth(
  health: SubjectThesisHealth | undefined
): SubjectThesisHealth {
  if (health === undefined) throw new Error("Expected health to be present.");
  return health;
}

function makeClaim(
  overrides: Partial<Omit<ThesisClaim, "id">> = {}
): Omit<ThesisClaim, "id"> {
  return {
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

function makeInput(overrides: Partial<NewThesisInput> = {}): NewThesisInput {
  return {
    subjectRef: SUBJECT,
    subjectLabel: "Northstar Software (demo)",
    title: "Margin expansion is underestimated",
    summary:
      "Recurring revenue mix is rising while support costs stay flat, so " +
      "operating leverage should show up over the next few years.",
    edge: "The market prices this as a services business.",
    bearCase: "A larger platform bundles the product for free.",
    timeHorizon: "3-5 years",
    claims: [makeClaim()],
    ...overrides,
  };
}

function makeRevision(
  overrides: Partial<ReviseThesisInput> = {}
): ReviseThesisInput {
  return {
    title: "Margin expansion is underestimated (revised)",
    summary:
      "Second-quarter gross margin confirmed the mix shift, so the original " +
      "reasoning holds with a tighter margin target.",
    edge: "The market still prices this as a services business.",
    bearCase: "A larger platform bundles the product for free.",
    timeHorizon: "3-5 years",
    claims: [makeClaim({ statement: "Operating margin reaches 17% by FY2028." })],
    revisionNote: "Raised the margin target after the Q2 disclosure.",
    ...overrides,
  };
}

function makeRow(
  thesis: ThesisWithHistory,
  overrides: Partial<NewEvaluationRow> = {}
): NewEvaluationRow {
  return {
    thesisId: thesis.id,
    thesisVersion: thesis.currentVersion,
    claimId: "claim-margin",
    claimStatement: "Operating margin reaches 15% by FY2027.",
    classification: "NEUTRAL",
    rationale: "The filing does not move the margin claim either way.",
    evidenceExcerpts: ["operating margin of 11.4%"],
    evidenceSummary: "Revenue FY2025 vs FY2024 (fixture)",
    evidenceAsOf: "2026-02-14",
    modelId: "fixture-model-id",
    promptVersion: "claim-evaluation-v1",
    ...overrides,
  };
}

/** One row per classification, with sortable claim ids for stable lookup. */
function insertMixedRun(thesis: ThesisWithHistory): { runId: string } {
  const classifications: EvidenceClassification[] = [
    "STRONGLY_CONTRADICTS",
    "MODERATELY_SUPPORTS",
    "NEUTRAL",
    "INSUFFICIENT_EVIDENCE",
  ];
  return insertEvaluationRun(
    classifications.map((classification, index) =>
      makeRow(thesis, {
        claimId: `claim-${index + 1}-${classification.toLowerCase()}`,
        classification,
      })
    )
  );
}

/** The stored evaluation whose AI classification is the given one. */
function evaluationIdByClassification(
  thesisId: string,
  classification: EvidenceClassification
): string {
  const run = at(listEvaluationRuns(thesisId), 0);
  const found = run.evaluations.find(
    (evaluation) => evaluation.classification === classification
  );
  if (found === undefined) {
    throw new Error(`Expected an evaluation classified ${classification}.`);
  }
  return found.id;
}

describe("getSubjectThesisHealth", () => {
  it("returns an empty list for a subject with no theses", () => {
    expect(getSubjectThesisHealth(SUBJECT)).toEqual({
      subjectRef: SUBJECT,
      theses: [],
    });
  });

  it("returns an empty list on completely empty stores", () => {
    expect(getSubjectThesisHealth("research:msft").theses).toEqual([]);
  });

  it("echoes the requested ref even when it is not a known subject", () => {
    // Health is a read model, not a validator: resolving a ref is the
    // registry's job, so an unknown ref reads as "no theses", not an error.
    expect(getSubjectThesisHealth("portfolio:1")).toEqual({
      subjectRef: "portfolio:1",
      theses: [],
    });
  });

  it("lists a newly created thesis with no check yet", () => {
    const thesis = createThesis(makeInput());

    const health = getSubjectThesisHealth(SUBJECT);
    expect(health.subjectRef).toBe(SUBJECT);
    expect(health.theses).toHaveLength(1);

    const entry = at(health.theses, 0);
    expect(entry.thesisId).toBe(thesis.id);
    expect(entry.title).toBe("Margin expansion is underestimated");
    expect(entry.status).toBe("active");
    expect(entry.currentVersion).toBe(1);
    expect(entry.updatedAt).toBe(START_TIME.toISOString());
    expect(entry.lastCheck).toBeNull();
  });

  it("exposes only the documented entry fields", () => {
    createThesis(makeInput());

    expect(Object.keys(at(getSubjectThesisHealth(SUBJECT).theses, 0)).sort()).toEqual([
      "currentVersion",
      "lastCheck",
      "status",
      "thesisId",
      "title",
      "updatedAt",
    ]);
  });

  it("scopes theses to their own subject", () => {
    const mine = createThesis(makeInput());
    tick();
    createThesis(
      makeInput({
        subjectRef: OTHER_SUBJECT,
        subjectLabel: "Toyota Motor Corporation (7203)",
      })
    );

    expect(
      getSubjectThesisHealth(SUBJECT).theses.map((entry) => entry.thesisId)
    ).toEqual([mine.id]);
    expect(getSubjectThesisHealth(OTHER_SUBJECT).theses).toHaveLength(1);
  });

  it("reflects a status change without inventing a check", () => {
    const thesis = createThesis(makeInput());
    tick();
    setThesisStatus(thesis.id, "invalidated", "The margin claim broke.");

    const entry = at(getSubjectThesisHealth(SUBJECT).theses, 0);
    expect(entry.status).toBe("invalidated");
    expect(entry.lastCheck).toBeNull();
  });
});

describe("last check counts", () => {
  it("summarizes a mixed run by classification family", () => {
    const thesis = createThesis(makeInput());
    tick();
    const { runId } = insertMixedRun(thesis);

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.runId).toBe(runId);
    expect(check.checkedAt).toBe(
      new Date(START_TIME.getTime() + 1_000).toISOString()
    );
    expect(check.claimCount).toBe(4);
    expect(check.contradictedCount).toBe(1);
    expect(check.supportedCount).toBe(1);
    expect(check.insufficientCount).toBe(1);
    expect(check.hasOverrides).toBe(false);
  });

  it("exposes only the documented check fields", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);

    expect(
      Object.keys(requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0))).sort()
    ).toEqual([
      "checkedAt",
      "claimCount",
      "contradictedCount",
      "hasOverrides",
      "insufficientCount",
      "runId",
      "supportedCount",
    ]);
  });

  it("counts a neutral-only run as neither supported nor contradicted", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertEvaluationRun([
      makeRow(thesis, { claimId: "claim-a", classification: "NEUTRAL" }),
      makeRow(thesis, { claimId: "claim-b", classification: "NEUTRAL" }),
    ]);

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.claimCount).toBe(2);
    expect(check.contradictedCount).toBe(0);
    expect(check.supportedCount).toBe(0);
    expect(check.insufficientCount).toBe(0);
  });

  it("counts both strengths of contradiction and support", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertEvaluationRun([
      makeRow(thesis, { claimId: "claim-a", classification: "STRONGLY_CONTRADICTS" }),
      makeRow(thesis, { claimId: "claim-b", classification: "MODERATELY_CONTRADICTS" }),
      makeRow(thesis, { claimId: "claim-c", classification: "STRONGLY_SUPPORTS" }),
      makeRow(thesis, { claimId: "claim-d", classification: "MODERATELY_SUPPORTS" }),
    ]);

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.claimCount).toBe(4);
    expect(check.contradictedCount).toBe(2);
    expect(check.supportedCount).toBe(2);
    expect(check.insufficientCount).toBe(0);
  });

  it("keeps insufficient evidence out of the supported and contradicted counts", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertEvaluationRun([
      makeRow(thesis, { claimId: "claim-a", classification: "INSUFFICIENT_EVIDENCE" }),
      makeRow(thesis, { claimId: "claim-b", classification: "INSUFFICIENT_EVIDENCE" }),
    ]);

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.insufficientCount).toBe(2);
    expect(check.contradictedCount).toBe(0);
    expect(check.supportedCount).toBe(0);
  });

  it("does not attribute another thesis's run to this thesis", () => {
    const mine = createThesis(makeInput());
    tick();
    const other = createThesis(
      makeInput({ subjectRef: OTHER_SUBJECT, subjectLabel: "Toyota" })
    );
    tick();
    insertMixedRun(other);

    expect(at(getSubjectThesisHealth(SUBJECT).theses, 0).thesisId).toBe(mine.id);
    expect(at(getSubjectThesisHealth(SUBJECT).theses, 0).lastCheck).toBeNull();
    expect(
      requireLastCheck(at(getSubjectThesisHealth(OTHER_SUBJECT).theses, 0)).claimCount
    ).toBe(4);
  });
});

describe("user overrides", () => {
  it("treats an override as the effective reading and flags it", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    const contradicting = evaluationIdByClassification(
      thesis.id,
      "STRONGLY_CONTRADICTS"
    );

    tick();
    setUserOverride(
      contradicting,
      "NEUTRAL",
      "The decline was a disclosed one-off, so it does not cut against the claim."
    );

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.contradictedCount).toBe(0);
    expect(check.supportedCount).toBe(1);
    expect(check.insufficientCount).toBe(1);
    expect(check.claimCount).toBe(4);
    expect(check.hasOverrides).toBe(true);
  });

  it("leaves the AI classification untouched in the store", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    const contradicting = evaluationIdByClassification(
      thesis.id,
      "STRONGLY_CONTRADICTS"
    );

    tick();
    setUserOverride(contradicting, "NEUTRAL", "I read the evidence differently.");

    const stored = getEvaluation(contradicting);
    expect(stored?.classification).toBe("STRONGLY_CONTRADICTS");
    expect(stored?.userOverride).toBe("NEUTRAL");
    expect(stored?.rationale).toBe(
      "The filing does not move the margin claim either way."
    );
  });

  it("raises the contradicted count when the user overrides toward contradiction", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    const neutral = evaluationIdByClassification(thesis.id, "NEUTRAL");

    tick();
    setUserOverride(
      neutral,
      "MODERATELY_CONTRADICTS",
      "Reading the same disclosure, this cuts against the margin claim."
    );

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.contradictedCount).toBe(2);
    expect(check.supportedCount).toBe(1);
    expect(check.insufficientCount).toBe(1);
    expect(check.hasOverrides).toBe(true);
    expect(getEvaluation(neutral)?.classification).toBe("NEUTRAL");
  });

  it("moves a row out of the insufficient count when overridden", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    const insufficient = evaluationIdByClassification(
      thesis.id,
      "INSUFFICIENT_EVIDENCE"
    );

    tick();
    setUserOverride(
      insufficient,
      "MODERATELY_SUPPORTS",
      "The segment disclosure I found covers this claim."
    );

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.insufficientCount).toBe(0);
    expect(check.supportedCount).toBe(2);
    expect(check.contradictedCount).toBe(1);
  });

  it("counts an override that agrees with the AI without changing the totals", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    const contradicting = evaluationIdByClassification(
      thesis.id,
      "STRONGLY_CONTRADICTS"
    );

    tick();
    setUserOverride(
      contradicting,
      "STRONGLY_CONTRADICTS",
      "Agreed, though for a different reason."
    );

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.contradictedCount).toBe(1);
    expect(check.supportedCount).toBe(1);
    expect(check.hasOverrides).toBe(true);
  });

  it("ignores an override recorded on an older run", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    const oldContradicting = evaluationIdByClassification(
      thesis.id,
      "STRONGLY_CONTRADICTS"
    );
    tick();
    setUserOverride(oldContradicting, "NEUTRAL", "Overriding the first run.");

    tick();
    insertMixedRun(thesis);

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.hasOverrides).toBe(false);
    expect(check.contradictedCount).toBe(1);
  });
});

describe("multiple runs", () => {
  it("reports only the newest run", () => {
    const thesis = createThesis(makeInput());
    tick();
    const first = insertEvaluationRun([
      makeRow(thesis, { claimId: "claim-a", classification: "STRONGLY_SUPPORTS" }),
      makeRow(thesis, { claimId: "claim-b", classification: "MODERATELY_SUPPORTS" }),
      makeRow(thesis, { claimId: "claim-c", classification: "NEUTRAL" }),
    ]);

    tick(86_400);
    const second = insertEvaluationRun([
      makeRow(thesis, { claimId: "claim-a", classification: "STRONGLY_CONTRADICTS" }),
    ]);

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.runId).toBe(second.runId);
    expect(check.runId).not.toBe(first.runId);
    expect(check.checkedAt).toBe(second.createdAt);
    expect(check.claimCount).toBe(1);
    expect(check.contradictedCount).toBe(1);
    expect(check.supportedCount).toBe(0);
  });

  it("follows the newest run across three checks", () => {
    const thesis = createThesis(makeInput());
    const runIds: string[] = [];
    for (const classification of [
      "NEUTRAL",
      "MODERATELY_SUPPORTS",
      "STRONGLY_CONTRADICTS",
    ] as const) {
      tick();
      runIds.push(
        insertEvaluationRun([makeRow(thesis, { classification })]).runId
      );
    }

    const check = requireLastCheck(at(getSubjectThesisHealth(SUBJECT).theses, 0));
    expect(check.runId).toBe(at(runIds, 2));
    expect(check.contradictedCount).toBe(1);
  });
});

describe("revised theses", () => {
  it("titles the entry from the current version", () => {
    const thesis = createThesis(makeInput({ title: "Version 1 title" }));
    tick();
    reviseThesis(thesis.id, makeRevision({ title: "Version 2 title" }));

    const entry = at(getSubjectThesisHealth(SUBJECT).theses, 0);
    expect(entry.title).toBe("Version 2 title");
    expect(entry.currentVersion).toBe(2);
    expect(entry.updatedAt).toBe(
      new Date(START_TIME.getTime() + 1_000).toISOString()
    );
  });

  it("keeps following the latest title across several revisions", () => {
    const thesis = createThesis(makeInput({ title: "Version 1 title" }));
    for (const version of [2, 3, 4]) {
      tick();
      reviseThesis(thesis.id, makeRevision({ title: `Version ${version} title` }));
    }

    const entry = at(getSubjectThesisHealth(SUBJECT).theses, 0);
    expect(entry.title).toBe("Version 4 title");
    expect(entry.currentVersion).toBe(4);
  });

  it("keeps the earlier run as the last check after a revision", () => {
    const thesis = createThesis(makeInput());
    tick();
    const run = insertEvaluationRun([
      makeRow(thesis, { classification: "STRONGLY_CONTRADICTS" }),
    ]);
    tick();
    reviseThesis(thesis.id, makeRevision({ title: "Version 2 title" }));

    const entry = at(getSubjectThesisHealth(SUBJECT).theses, 0);
    expect(entry.currentVersion).toBe(2);
    expect(requireLastCheck(entry).runId).toBe(run.runId);
    expect(requireLastCheck(entry).contradictedCount).toBe(1);
  });
});

describe("multiple theses on one subject", () => {
  it("orders them most recently updated first", () => {
    const first = createThesis(makeInput({ title: "First thesis" }));
    tick();
    const second = createThesis(makeInput({ title: "Second thesis" }));
    tick();
    const third = createThesis(makeInput({ title: "Third thesis" }));

    expect(
      getSubjectThesisHealth(SUBJECT).theses.map((entry) => entry.thesisId)
    ).toEqual([third.id, second.id, first.id]);
    expect(
      getSubjectThesisHealth(SUBJECT).theses.map((entry) => entry.title)
    ).toEqual(["Third thesis", "Second thesis", "First thesis"]);
  });

  it("moves a revised thesis to the front", () => {
    const first = createThesis(makeInput({ title: "First thesis" }));
    tick();
    const second = createThesis(makeInput({ title: "Second thesis" }));

    tick();
    reviseThesis(first.id, makeRevision({ title: "First thesis, revised" }));

    const theses = getSubjectThesisHealth(SUBJECT).theses;
    expect(theses.map((entry) => entry.thesisId)).toEqual([first.id, second.id]);
    expect(at(theses, 0).title).toBe("First thesis, revised");
    expect(at(theses, 0).currentVersion).toBe(2);
  });

  it("gives each thesis its own last check", () => {
    const withCheck = createThesis(makeInput({ title: "Checked thesis" }));
    tick();
    const withoutCheck = createThesis(makeInput({ title: "Unchecked thesis" }));
    tick();
    insertMixedRun(withCheck);

    const byId = new Map(
      getSubjectThesisHealth(SUBJECT).theses.map((entry) => [
        entry.thesisId,
        entry,
      ])
    );
    expect(byId.get(withoutCheck.id)?.lastCheck).toBeNull();
    expect(byId.get(withCheck.id)?.lastCheck).not.toBeNull();
    expect(byId.get(withCheck.id)?.lastCheck?.claimCount).toBe(4);
  });
});

describe("getThesisHealthBySubject", () => {
  it("keys the map uniquely even when the input repeats a subject", () => {
    createThesis(makeInput());

    const map = getThesisHealthBySubject([
      SUBJECT,
      SUBJECT,
      OTHER_SUBJECT,
      SUBJECT,
      OTHER_SUBJECT,
    ]);

    expect(map.size).toBe(2);
    expect([...map.keys()].sort()).toEqual([OTHER_SUBJECT, SUBJECT].sort());
    expect(requireHealth(map.get(SUBJECT)).theses).toHaveLength(1);
  });

  it("includes subjects without theses as empty entries", () => {
    createThesis(makeInput());

    const map = getThesisHealthBySubject([SUBJECT, OTHER_SUBJECT, "research:msft"]);

    expect(map.size).toBe(3);
    expect(requireHealth(map.get(OTHER_SUBJECT))).toEqual({
      subjectRef: OTHER_SUBJECT,
      theses: [],
    });
    expect(requireHealth(map.get("research:msft")).theses).toEqual([]);
  });

  it("returns an empty map for an empty input", () => {
    createThesis(makeInput());

    expect(getThesisHealthBySubject([]).size).toBe(0);
  });

  it("agrees with the single-subject lookup for every key", () => {
    const thesis = createThesis(makeInput());
    tick();
    insertMixedRun(thesis);
    tick();
    createThesis(
      makeInput({ subjectRef: OTHER_SUBJECT, subjectLabel: "Toyota" })
    );

    const refs = [SUBJECT, OTHER_SUBJECT, "research:aapl"];
    const map = getThesisHealthBySubject(refs);

    for (const ref of refs) {
      expect(requireHealth(map.get(ref))).toEqual(getSubjectThesisHealth(ref));
    }
  });

  it("does not leak one subject's theses into another key", () => {
    createThesis(makeInput({ title: "Northstar thesis" }));
    tick();
    createThesis(
      makeInput({
        subjectRef: OTHER_SUBJECT,
        subjectLabel: "Toyota",
        title: "Toyota thesis",
      })
    );

    const map = getThesisHealthBySubject([SUBJECT, OTHER_SUBJECT]);

    expect(
      requireHealth(map.get(SUBJECT)).theses.map((entry) => entry.title)
    ).toEqual(["Northstar thesis"]);
    expect(
      requireHealth(map.get(OTHER_SUBJECT)).theses.map((entry) => entry.title)
    ).toEqual(["Toyota thesis"]);
  });
});
