import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** The store is server-only; neutralize the guard for node-env tests. */
vi.mock("server-only", () => ({}));

import * as thesisStore from "@/lib/thesis/store";
import {
  appendNote,
  closeThesisStore,
  countTheses,
  createThesis,
  getThesis,
  listJournal,
  listTheses,
  openThesisStoreAt,
  reviseThesis,
  setThesisStatus,
  type NewThesisInput,
  type ReviseThesisInput,
} from "@/lib/thesis/store";
import type {
  ClaimKind,
  ThesisClaim,
  ThesisStatus,
  ThesisVersion,
  ThesisWithHistory,
} from "@/lib/thesis/types";

/**
 * Every test gets a throwaway SQLite file under the OS temp dir via the
 * `openThesisStoreAt` hook, so the real driver exercises the integrity rules
 * (versions and journal entries are insert-only) without touching the
 * repository's gitignored user-data directory.
 *
 * Timestamps are driven by fake timers: `updated_at` ordering and journal
 * chronology are part of the contract, and real clocks can produce ties
 * within the same millisecond.
 */

const START_TIME = new Date("2026-08-14T09:00:00.000Z");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let dbPath: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
  dbPath = path.join(os.tmpdir(), `mt-thesis-${randomUUID()}`, "theses.sqlite");
  openThesisStoreAt(dbPath);
});

afterEach(() => {
  closeThesisStore();
  // WAL mode leaves sidecar files; remove the whole throwaway directory.
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  vi.useRealTimers();
});

/** Move the clock forward so the next write gets a strictly later timestamp. */
function tick(seconds = 1): void {
  vi.setSystemTime(new Date(Date.now() + seconds * 1_000));
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
    subjectRef: "demo:stock-us-northstar-software",
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

/** Index access with a clear failure instead of an `undefined` deep-equal. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index} of ${items.length}.`);
  }
  return item;
}

function versionOf(thesis: ThesisWithHistory, version: number): ThesisVersion {
  const found = thesis.versions.find((entry) => entry.version === version);
  if (found === undefined) {
    throw new Error(`Expected version ${version} to exist.`);
  }
  return found;
}

function requireThesis(thesis: ThesisWithHistory | null): ThesisWithHistory {
  if (thesis === null) throw new Error("Expected the thesis to exist.");
  return thesis;
}

describe("createThesis", () => {
  it("returns a thesis at version 1 with active status", () => {
    const thesis = createThesis(makeInput());

    expect(thesis.id).toMatch(UUID_PATTERN);
    expect(thesis.subjectRef).toBe("demo:stock-us-northstar-software");
    expect(thesis.subjectLabel).toBe("Northstar Software (demo)");
    expect(thesis.status).toBe("active");
    expect(thesis.currentVersion).toBe(1);
    expect(thesis.versions).toHaveLength(1);
    expect(at(thesis.versions, 0).version).toBe(1);
  });

  it("stores the whole version body, nullable fields included", () => {
    const input = makeInput();
    const version = versionOf(createThesis(input), 1);

    expect(version.title).toBe(input.title);
    expect(version.summary).toBe(input.summary);
    expect(version.edge).toBe(input.edge);
    expect(version.bearCase).toBe(input.bearCase);
    expect(version.timeHorizon).toBe(input.timeHorizon);
    expect(version.createdAt).toBe(START_TIME.toISOString());
  });

  it("preserves nulls in the version body rather than empty strings", () => {
    const thesis = createThesis(
      makeInput({ edge: null, bearCase: null, timeHorizon: null })
    );
    const version = versionOf(thesis, 1);

    expect(version.edge).toBeNull();
    expect(version.bearCase).toBeNull();
    expect(version.timeHorizon).toBeNull();
  });

  it("stamps createdAt and updatedAt with the same ISO timestamp", () => {
    const thesis = createThesis(makeInput());

    expect(thesis.createdAt).toBe(START_TIME.toISOString());
    expect(thesis.updatedAt).toBe(START_TIME.toISOString());
  });

  it("generates a distinct UUID for every claim", () => {
    const thesis = createThesis(
      makeInput({
        claims: [
          makeClaim({ statement: "Revenue grows 12% annually through FY2028." }),
          makeClaim({ statement: "Free cash flow margin exceeds 20%." }),
          makeClaim({ statement: "Net debt stays below one turn of EBITDA." }),
        ],
      })
    );
    const claims = versionOf(thesis, 1).claims;
    const ids = claims.map((claim) => claim.id);

    expect(ids).toHaveLength(3);
    for (const id of ids) expect(id).toMatch(UUID_PATTERN);
    expect(new Set(ids).size).toBe(3);
  });

  it("writes one created journal entry pointing at version 1", () => {
    const thesis = createThesis(makeInput());
    const journal = listJournal(thesis.id);

    expect(journal).toHaveLength(1);
    const entry = at(journal, 0);
    expect(entry.kind).toBe("created");
    expect(entry.version).toBe(1);
    expect(entry.thesisId).toBe(thesis.id);
    expect(entry.id).toMatch(UUID_PATTERN);
    expect(entry.createdAt).toBe(START_TIME.toISOString());
    expect(entry.text.length).toBeGreaterThan(0);
  });

  it("gives each thesis its own id and its own journal", () => {
    const first = createThesis(makeInput());
    const second = createThesis(makeInput({ subjectRef: "research:aapl" }));

    expect(second.id).not.toBe(first.id);
    expect(listJournal(first.id)).toHaveLength(1);
    expect(listJournal(second.id)).toHaveLength(1);
    expect(countTheses()).toBe(2);
  });

  it("round-trips through getThesis unchanged", () => {
    const created = createThesis(makeInput());

    expect(getThesis(created.id)).toEqual(created);
  });
});

describe("getThesis", () => {
  it("returns null for an unknown id", () => {
    createThesis(makeInput());

    expect(getThesis(randomUUID())).toBeNull();
    expect(getThesis("")).toBeNull();
    expect(getThesis("not-an-id")).toBeNull();
  });

  it("returns versions in ascending order", () => {
    const created = createThesis(makeInput());
    tick();
    reviseThesis(created.id, makeRevision());
    tick();
    reviseThesis(created.id, makeRevision());

    const thesis = requireThesis(getThesis(created.id));
    expect(thesis.versions.map((version) => version.version)).toEqual([1, 2, 3]);
  });
});

describe("listTheses", () => {
  it("returns an empty array on a fresh database", () => {
    expect(listTheses()).toEqual([]);
  });

  it("orders by updated_at descending", () => {
    const first = createThesis(makeInput({ subjectLabel: "First" }));
    tick();
    const second = createThesis(makeInput({ subjectLabel: "Second" }));

    expect(listTheses().map((thesis) => thesis.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("moves a revised thesis to the front of the list", () => {
    const first = createThesis(makeInput({ subjectLabel: "First" }));
    tick();
    const second = createThesis(makeInput({ subjectLabel: "Second" }));
    expect(listTheses().map((thesis) => thesis.id)).toEqual([
      second.id,
      first.id,
    ]);

    tick();
    reviseThesis(first.id, makeRevision());

    const listed = listTheses();
    expect(listed.map((thesis) => thesis.id)).toEqual([first.id, second.id]);
    expect(at(listed, 0).currentVersion).toBe(2);
  });

  it("moves a thesis to the front when only its status changes", () => {
    const first = createThesis(makeInput({ subjectLabel: "First" }));
    tick();
    createThesis(makeInput({ subjectLabel: "Second" }));

    tick();
    setThesisStatus(first.id, "realized", "Target reached; taking the gain.");

    expect(at(listTheses(), 0).id).toBe(first.id);
  });

  it("returns list rows without version history", () => {
    createThesis(makeInput());

    const listed = at(listTheses(), 0);
    expect("versions" in listed).toBe(false);
    expect(Object.keys(listed).sort()).toEqual([
      "createdAt",
      "currentVersion",
      "id",
      "status",
      "subjectLabel",
      "subjectRef",
      "updatedAt",
    ]);
  });
});

describe("reviseThesis", () => {
  it("creates version 2 and bumps the current version", () => {
    const created = createThesis(makeInput());
    tick();
    const revised = requireThesis(reviseThesis(created.id, makeRevision()));

    expect(revised.currentVersion).toBe(2);
    expect(revised.versions.map((version) => version.version)).toEqual([1, 2]);
    const second = versionOf(revised, 2);
    expect(second.title).toBe("Margin expansion is underestimated (revised)");
    expect(second.createdAt).toBe(
      new Date(START_TIME.getTime() + 1_000).toISOString()
    );
  });

  it("leaves version 1 byte-identical after a revision", () => {
    const created = createThesis(makeInput());
    const before = versionOf(created, 1);
    const beforeSnapshot = structuredClone(before);
    const beforeJson = JSON.stringify(before);

    tick();
    const revised = requireThesis(reviseThesis(created.id, makeRevision()));
    const after = versionOf(revised, 1);

    expect(after).toEqual(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(beforeJson);
    // Re-reading from the database must agree with the in-memory snapshot.
    expect(versionOf(requireThesis(getThesis(created.id)), 1)).toEqual(
      beforeSnapshot
    );
  });

  it("keeps createdAt but advances updatedAt", () => {
    const created = createThesis(makeInput());
    tick(60);
    const revised = requireThesis(reviseThesis(created.id, makeRevision()));

    expect(revised.createdAt).toBe(created.createdAt);
    expect(revised.updatedAt).not.toBe(created.updatedAt);
    expect(
      new Date(revised.updatedAt).getTime() >
        new Date(created.updatedAt).getTime()
    ).toBe(true);
  });

  it("appends a revised journal entry carrying the revision note", () => {
    const created = createThesis(makeInput());
    tick();
    reviseThesis(
      created.id,
      makeRevision({ revisionNote: "Cut the target after the guidance reset." })
    );

    const journal = listJournal(created.id);
    expect(journal.map((entry) => entry.kind)).toEqual(["created", "revised"]);
    const revisedEntry = at(journal, 1);
    expect(revisedEntry.text).toBe("Cut the target after the guidance reset.");
    expect(revisedEntry.version).toBe(2);
  });

  it("keeps claim ids that were supplied and generates the rest", () => {
    const created = createThesis(makeInput());
    const existingClaimId = at(versionOf(created, 1).claims, 0).id;

    tick();
    const revised = requireThesis(
      reviseThesis(
        created.id,
        makeRevision({
          claims: [
            makeClaim({
              statement: "Operating margin reaches 17% by FY2028.",
            }),
            makeClaim({
              statement: "Retention stays above 95% on a net revenue basis.",
            }),
          ].map((claim, index) =>
            index === 0 ? { ...claim, id: existingClaimId } : claim
          ),
        })
      )
    );

    const claims = versionOf(revised, 2).claims;
    expect(claims).toHaveLength(2);
    expect(at(claims, 0).id).toBe(existingClaimId);
    expect(at(claims, 1).id).toMatch(UUID_PATTERN);
    expect(at(claims, 1).id).not.toBe(existingClaimId);
  });

  it("does not change the status", () => {
    const created = createThesis(makeInput());
    tick();
    setThesisStatus(created.id, "invalidated", "The moat claim broke.");
    tick();
    const revised = requireThesis(reviseThesis(created.id, makeRevision()));

    expect(revised.status).toBe("invalidated");
  });

  it("returns null for an unknown thesis and writes nothing", () => {
    const created = createThesis(makeInput());
    const strangerId = randomUUID();

    expect(reviseThesis(strangerId, makeRevision())).toBeNull();
    expect(listJournal(strangerId)).toEqual([]);
    expect(requireThesis(getThesis(created.id)).currentVersion).toBe(1);
    expect(countTheses()).toBe(1);
  });

  it("does not touch a sibling thesis", () => {
    const first = createThesis(makeInput({ subjectLabel: "First" }));
    const second = createThesis(makeInput({ subjectLabel: "Second" }));
    const secondBefore = requireThesis(getThesis(second.id));

    tick();
    reviseThesis(first.id, makeRevision());

    expect(getThesis(second.id)).toEqual(secondBefore);
    expect(listJournal(second.id)).toHaveLength(1);
  });
});

describe("multiple revisions", () => {
  it("keeps every version with its own claims snapshot", () => {
    const created = createThesis(
      makeInput({
        title: "Version 1 title",
        claims: [makeClaim({ statement: "Claim as written in version 1." })],
      })
    );

    for (const version of [2, 3, 4]) {
      tick();
      reviseThesis(
        created.id,
        makeRevision({
          title: `Version ${version} title`,
          claims: [
            makeClaim({
              statement: `Claim as written in version ${version}.`,
              targetValue: 0.15 + version / 100,
              importance: version === 2 ? 1 : version === 3 ? 2 : 3,
            }),
          ],
          revisionNote: `Revision note for version ${version}.`,
        })
      );
    }

    const thesis = requireThesis(getThesis(created.id));
    expect(thesis.currentVersion).toBe(4);
    expect(thesis.versions.map((version) => version.version)).toEqual([
      1, 2, 3, 4,
    ]);

    for (const version of [1, 2, 3, 4]) {
      const stored = versionOf(thesis, version);
      expect(stored.title).toBe(`Version ${version} title`);
      expect(stored.claims).toHaveLength(1);
      expect(at(stored.claims, 0).statement).toBe(
        `Claim as written in version ${version}.`
      );
    }
    expect(at(versionOf(thesis, 2).claims, 0).importance).toBe(1);
    expect(at(versionOf(thesis, 4).claims, 0).importance).toBe(3);
    expect(at(versionOf(thesis, 3).claims, 0).targetValue).toBeCloseTo(0.18, 10);
  });

  it("records one journal entry per revision, in version order", () => {
    const created = createThesis(makeInput());
    for (const version of [2, 3, 4]) {
      tick();
      reviseThesis(
        created.id,
        makeRevision({ revisionNote: `Revision note for version ${version}.` })
      );
    }

    const journal = listJournal(created.id);
    expect(journal.map((entry) => entry.kind)).toEqual([
      "created",
      "revised",
      "revised",
      "revised",
    ]);
    expect(journal.map((entry) => entry.version)).toEqual([1, 2, 3, 4]);
    expect(at(journal, 3).text).toBe("Revision note for version 4.");
  });

  it("keeps a growing and shrinking claim list per version", () => {
    const created = createThesis(
      makeInput({
        claims: [
          makeClaim({ statement: "First claim, present in version 1." }),
          makeClaim({ statement: "Second claim, dropped in version 2." }),
        ],
      })
    );

    tick();
    reviseThesis(
      created.id,
      makeRevision({
        claims: [makeClaim({ statement: "First claim, present in version 1." })],
      })
    );

    const thesis = requireThesis(getThesis(created.id));
    expect(versionOf(thesis, 1).claims).toHaveLength(2);
    expect(versionOf(thesis, 2).claims).toHaveLength(1);
  });
});

describe("setThesisStatus", () => {
  const statuses: ThesisStatus[] = [
    "active",
    "invalidated",
    "realized",
    "abandoned",
  ];

  it.each(statuses)("stores the %s status", (status) => {
    const created = createThesis(makeInput());
    tick();
    const updated = requireThesis(
      setThesisStatus(created.id, status, "Closing the loop on this thesis.")
    );

    expect(updated.status).toBe(status);
    expect(requireThesis(getThesis(created.id)).status).toBe(status);
  });

  it("appends a status-changed journal entry with the note", () => {
    const created = createThesis(makeInput());
    tick();
    setThesisStatus(
      created.id,
      "invalidated",
      "Margin target missed two years running."
    );

    const journal = listJournal(created.id);
    expect(journal.map((entry) => entry.kind)).toEqual([
      "created",
      "status-changed",
    ]);
    const entry = at(journal, 1);
    expect(entry.text).toBe("Margin target missed two years running.");
    expect(entry.version).toBeNull();
  });

  it("leaves the version history untouched", () => {
    const created = createThesis(makeInput());
    tick();
    reviseThesis(created.id, makeRevision());
    const before = structuredClone(
      requireThesis(getThesis(created.id)).versions
    );

    tick();
    const updated = requireThesis(
      setThesisStatus(created.id, "abandoned", "Better use for the capital.")
    );

    expect(updated.versions).toEqual(before);
    expect(updated.currentVersion).toBe(2);
  });

  it("advances updatedAt without changing createdAt", () => {
    const created = createThesis(makeInput());
    tick(120);
    const updated = requireThesis(
      setThesisStatus(created.id, "realized", "Thesis played out as expected.")
    );

    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it("records each status change as its own entry", () => {
    const created = createThesis(makeInput());
    tick();
    setThesisStatus(created.id, "invalidated", "The growth claim broke.");
    tick();
    setThesisStatus(created.id, "active", "Reopening after the restructuring.");

    const journal = listJournal(created.id);
    expect(journal.filter((entry) => entry.kind === "status-changed")).toHaveLength(
      2
    );
    expect(at(journal, 1).text).toBe("The growth claim broke.");
    expect(at(journal, 2).text).toBe("Reopening after the restructuring.");
    expect(requireThesis(getThesis(created.id)).status).toBe("active");
  });

  it("returns null for an unknown thesis", () => {
    createThesis(makeInput());
    const strangerId = randomUUID();

    expect(setThesisStatus(strangerId, "realized", "No such thesis.")).toBeNull();
    expect(listJournal(strangerId)).toEqual([]);
  });
});

describe("appendNote", () => {
  it("returns the appended entry", () => {
    const created = createThesis(makeInput());
    tick();
    const entry = appendNote(created.id, "Read the 10-K risk factors today.");

    expect(entry).not.toBeNull();
    expect(entry?.id).toMatch(UUID_PATTERN);
    expect(entry?.thesisId).toBe(created.id);
    expect(entry?.kind).toBe("note");
    expect(entry?.text).toBe("Read the 10-K risk factors today.");
    expect(entry?.version).toBeNull();
    expect(entry?.createdAt).toBe(
      new Date(START_TIME.getTime() + 1_000).toISOString()
    );
  });

  it("stores the entry so it comes back from listJournal", () => {
    const created = createThesis(makeInput());
    tick();
    const entry = appendNote(created.id, "Checked the competitor's pricing page.");

    const journal = listJournal(created.id);
    expect(journal).toHaveLength(2);
    expect(at(journal, 1)).toEqual(entry);
  });

  it("accumulates notes chronologically, interleaved with other entry kinds", () => {
    const created = createThesis(makeInput());
    tick();
    appendNote(created.id, "Note one.");
    tick();
    reviseThesis(created.id, makeRevision({ revisionNote: "Revision note." }));
    tick();
    appendNote(created.id, "Note two.");
    tick();
    setThesisStatus(created.id, "realized", "Status note.");
    tick();
    appendNote(created.id, "Note three.");

    const journal = listJournal(created.id);
    expect(journal.map((entry) => entry.kind)).toEqual([
      "created",
      "note",
      "revised",
      "note",
      "status-changed",
      "note",
    ]);
    expect(
      journal
        .filter((entry) => entry.kind === "note")
        .map((entry) => entry.text)
    ).toEqual(["Note one.", "Note two.", "Note three."]);

    const timestamps = journal.map((entry) =>
      new Date(entry.createdAt).getTime()
    );
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  it("does not change the thesis status, version, or updatedAt", () => {
    const created = createThesis(makeInput());
    tick();
    appendNote(created.id, "A note is an observation, not a revision.");

    const thesis = requireThesis(getThesis(created.id));
    expect(thesis.status).toBe("active");
    expect(thesis.currentVersion).toBe(1);
    expect(thesis.updatedAt).toBe(created.updatedAt);
    expect(thesis.versions).toEqual(created.versions);
  });

  it("returns null for an unknown thesis and appends nothing", () => {
    const created = createThesis(makeInput());
    const strangerId = randomUUID();

    expect(appendNote(strangerId, "Nowhere to put this.")).toBeNull();
    expect(listJournal(strangerId)).toEqual([]);
    expect(listJournal(created.id)).toHaveLength(1);
  });
});

describe("listJournal", () => {
  it("returns an empty array for an unknown thesis", () => {
    expect(listJournal(randomUUID())).toEqual([]);
    expect(listJournal("")).toEqual([]);
  });

  it("scopes entries to one thesis", () => {
    const first = createThesis(makeInput({ subjectLabel: "First" }));
    const second = createThesis(makeInput({ subjectLabel: "Second" }));
    tick();
    appendNote(first.id, "Belongs to the first thesis.");
    tick();
    appendNote(second.id, "Belongs to the second thesis.");

    expect(
      listJournal(first.id).map((entry) => entry.text)
    ).toEqual(["Thesis created.", "Belongs to the first thesis."]);
    expect(
      listJournal(second.id).every((entry) => entry.thesisId === second.id)
    ).toBe(true);
  });

  it("maps rows to the domain shape rather than raw column names", () => {
    const created = createThesis(makeInput());
    const entry = at(listJournal(created.id), 0);

    expect(Object.keys(entry).sort()).toEqual([
      "createdAt",
      "id",
      "kind",
      "text",
      "thesisId",
      "version",
    ]);
  });
});

describe("store module surface", () => {
  it("exposes no update or delete operation for versions or journal entries", () => {
    // The append-only contract is enforced by the absence of destructive
    // operations. A new export here should be a deliberate decision, so this
    // asserts the exact surface rather than a denylist of names.
    expect(Object.keys(thesisStore).sort()).toEqual([
      "appendNote",
      "closeThesisStore",
      "countTheses",
      "createThesis",
      "getThesis",
      "listJournal",
      "listTheses",
      "openThesisStoreAt",
      "reviseThesis",
      "setThesisStatus",
    ]);
  });
});

describe("claims round-trip", () => {
  it("preserves decimal ratios exactly", () => {
    const created = createThesis(
      makeInput({
        claims: [
          makeClaim({
            baselineValue: 0.15,
            targetValue: 0.0325,
            invalidationValue: -0.05,
          }),
        ],
      })
    );

    const claim = at(versionOf(requireThesis(getThesis(created.id)), 1).claims, 0);
    expect(claim.baselineValue).toBe(0.15);
    expect(claim.targetValue).toBe(0.0325);
    expect(claim.invalidationValue).toBe(-0.05);
  });

  it("preserves nulls as nulls, not zeros", () => {
    const created = createThesis(
      makeInput({
        claims: [
          makeClaim({
            metricDescription: null,
            baselineValue: null,
            targetValue: null,
            invalidationValue: null,
            deadline: null,
          }),
        ],
      })
    );

    const claim = at(versionOf(requireThesis(getThesis(created.id)), 1).claims, 0);
    expect(claim.metricDescription).toBeNull();
    expect(claim.baselineValue).toBeNull();
    expect(claim.targetValue).toBeNull();
    expect(claim.invalidationValue).toBeNull();
    expect(claim.deadline).toBeNull();
    expect(claim.baselineValue).not.toBe(0);
  });

  it("preserves a zero value distinctly from a missing one", () => {
    const created = createThesis(
      makeInput({
        claims: [
          makeClaim({ baselineValue: 0, targetValue: null }),
        ],
      })
    );

    const claim = at(versionOf(requireThesis(getThesis(created.id)), 1).claims, 0);
    expect(claim.baselineValue).toBe(0);
    expect(claim.targetValue).toBeNull();
  });

  it("preserves large native-currency values", () => {
    const created = createThesis(
      makeInput({
        subjectRef: "research-jp:toyota",
        subjectLabel: "トヨタ自動車 (research)",
        claims: [
          makeClaim({
            metricDescription: "営業利益 (JPY)",
            baselineValue: 4_500_000_000_000,
            targetValue: 6_000_000_000_000,
            invalidationValue: 3_000_000_000_000,
          }),
        ],
      })
    );

    const thesis = requireThesis(getThesis(created.id));
    expect(thesis.subjectLabel).toBe("トヨタ自動車 (research)");
    const claim = at(versionOf(thesis, 1).claims, 0);
    expect(claim.baselineValue).toBe(4_500_000_000_000);
    expect(claim.metricDescription).toBe("営業利益 (JPY)");
  });

  it("preserves deadline strings verbatim", () => {
    const created = createThesis(
      makeInput({
        claims: [
          makeClaim({ statement: "Claim with a March deadline.", deadline: "2027-03-31" }),
          makeClaim({ statement: "Claim with a December deadline.", deadline: "2030-12-31" }),
          makeClaim({ statement: "Claim without a deadline.", deadline: null }),
        ],
      })
    );

    const claims = versionOf(requireThesis(getThesis(created.id)), 1).claims;
    expect(claims.map((claim) => claim.deadline)).toEqual([
      "2027-03-31",
      "2030-12-31",
      null,
    ]);
  });

  it.each([1, 2, 3] as const)("preserves importance %i", (importance) => {
    const created = createThesis(
      makeInput({ claims: [makeClaim({ importance })] })
    );

    expect(
      at(versionOf(requireThesis(getThesis(created.id)), 1).claims, 0).importance
    ).toBe(importance);
  });

  it("preserves every claim kind", () => {
    const kinds: ClaimKind[] = [
      "growth",
      "profitability",
      "capital-allocation",
      "competitive-position",
      "valuation",
      "other",
    ];
    const created = createThesis(
      makeInput({
        claims: kinds.map((kind) =>
          makeClaim({ kind, statement: `A ${kind} claim worth testing.` })
        ),
      })
    );

    const claims = versionOf(requireThesis(getThesis(created.id)), 1).claims;
    expect(claims.map((claim) => claim.kind)).toEqual(kinds);
  });

  it("preserves text containing quotes and newlines", () => {
    const statement = 'Margin "normalizes" above 15%\nby FY2027 — per management.';
    const created = createThesis(
      makeInput({ claims: [makeClaim({ statement })] })
    );

    expect(
      at(versionOf(requireThesis(getThesis(created.id)), 1).claims, 0).statement
    ).toBe(statement);
  });

  it("keeps the claim ordering supplied by the caller", () => {
    const statements = [
      "Third alphabetically but first supplied.",
      "First alphabetically but second supplied.",
      "Second alphabetically but third supplied.",
    ];
    const created = createThesis(
      makeInput({
        claims: statements.map((statement) => makeClaim({ statement })),
      })
    );

    expect(
      versionOf(requireThesis(getThesis(created.id)), 1).claims.map(
        (claim) => claim.statement
      )
    ).toEqual(statements);
  });
});

describe("countTheses", () => {
  it("counts theses, not versions or journal entries", () => {
    expect(countTheses()).toBe(0);

    const first = createThesis(makeInput());
    expect(countTheses()).toBe(1);

    tick();
    reviseThesis(first.id, makeRevision());
    appendNote(first.id, "A note does not create a thesis.");
    expect(countTheses()).toBe(1);

    createThesis(makeInput({ subjectRef: "research:aapl" }));
    expect(countTheses()).toBe(2);
  });
});

describe("persistence", () => {
  it("keeps theses, versions, and the journal across a close and reopen", () => {
    const created = createThesis(makeInput());
    tick();
    reviseThesis(created.id, makeRevision());
    tick();
    appendNote(created.id, "Survives a restart.");
    tick();
    setThesisStatus(created.id, "invalidated", "The margin claim broke.");
    const before = requireThesis(getThesis(created.id));
    const journalBefore = listJournal(created.id);

    closeThesisStore();
    openThesisStoreAt(dbPath);

    expect(countTheses()).toBe(1);
    expect(getThesis(created.id)).toEqual(before);
    expect(listJournal(created.id)).toEqual(journalBefore);
    expect(requireThesis(getThesis(created.id)).status).toBe("invalidated");
  });

  it("starts empty when pointed at a different file", () => {
    createThesis(makeInput());
    const otherPath = path.join(path.dirname(dbPath), "other.sqlite");

    openThesisStoreAt(otherPath);
    expect(countTheses()).toBe(0);
    expect(listTheses()).toEqual([]);

    openThesisStoreAt(dbPath);
    expect(countTheses()).toBe(1);
  });

  it("creates the parent directory for a new database path", () => {
    const nested = path.join(path.dirname(dbPath), "nested", "deep", "db.sqlite");
    openThesisStoreAt(nested);
    createThesis(makeInput());

    expect(countTheses()).toBe(1);
    expect(fs.existsSync(nested)).toBe(true);

    openThesisStoreAt(dbPath);
  });

  it("tolerates closeThesisStore being called twice", () => {
    closeThesisStore();
    expect(() => closeThesisStore()).not.toThrow();
    openThesisStoreAt(dbPath);
  });
});
