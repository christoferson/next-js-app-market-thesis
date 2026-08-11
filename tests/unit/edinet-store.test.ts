import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** The store is server-only; neutralize the guard for node-env tests. */
vi.mock("server-only", () => ({}));

import {
  closeStore,
  countFilings,
  getFiling,
  getSyncCursor,
  listCompanyFilings,
  openStoreAt,
  setSyncCursor,
  upsertFiling,
  type StoredFiling,
} from "@/lib/research/edinet/store";

/**
 * Each test gets a throwaway SQLite file under the OS temp dir via the
 * `openStoreAt` hook, so persistence behavior (including survival across a
 * close/reopen) is exercised against the real driver without touching the
 * repository's gitignored data directory.
 */

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `mt-edinet-${randomUUID()}`, "filings.sqlite");
  openStoreAt(dbPath);
});

afterEach(() => {
  closeStore();
  // WAL mode leaves sidecar files; remove the whole throwaway directory.
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

function makeFiling(overrides: Partial<StoredFiling> = {}): StoredFiling {
  return {
    docId: "S100AAA1",
    edinetCode: "E02367",
    secCode: "79740",
    filerName: "任天堂株式会社",
    docTypeCode: "120",
    periodStart: "2024-04-01",
    periodEnd: "2025-03-31",
    submitDate: "2025-06-27",
    docDescription: "有価証券報告書－第85期",
    riskText: "事業等のリスクの本文",
    riskTextSource: "XBRL/PublicDoc/0102010_honbun.htm",
    fetchedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("upsertFiling and getFiling", () => {
  it("round-trips every field of a stored filing", () => {
    const filing = makeFiling();
    upsertFiling(filing);
    expect(getFiling("S100AAA1")).toEqual(filing);
  });

  it("preserves nulls as nulls rather than turning them into empty strings", () => {
    const filing = makeFiling({
      docId: "S100SPARSE",
      secCode: null,
      filerName: null,
      periodStart: null,
      periodEnd: null,
      docDescription: null,
      riskText: null,
      riskTextSource: null,
    });
    upsertFiling(filing);

    const stored = getFiling("S100SPARSE");
    expect(stored).toEqual(filing);
    expect(stored?.secCode).toBeNull();
    expect(stored?.riskText).toBeNull();
    expect(stored?.riskTextSource).toBeNull();
  });

  it("updates the risk text and fetch timestamp when the same docId is re-upserted", () => {
    upsertFiling(makeFiling({ riskText: null, riskTextSource: null }));
    upsertFiling(
      makeFiling({
        riskText: "抽出されたリスク本文",
        riskTextSource: "XBRL/PublicDoc/0102010_honbun.htm",
        fetchedAt: "2026-08-10T12:00:00.000Z",
      })
    );

    const stored = getFiling("S100AAA1");
    expect(stored?.riskText).toBe("抽出されたリスク本文");
    expect(stored?.riskTextSource).toBe(
      "XBRL/PublicDoc/0102010_honbun.htm"
    );
    expect(stored?.fetchedAt).toBe("2026-08-10T12:00:00.000Z");
    expect(countFilings()).toBe(1);
  });

  it("leaves the immutable metadata alone on conflict", () => {
    // The conflict clause updates only the extracted text and timestamp:
    // EDINET metadata for a published docId does not change.
    upsertFiling(makeFiling());
    upsertFiling(
      makeFiling({
        filerName: "別の会社",
        submitDate: "1999-01-01",
        docTypeCode: "160",
        riskText: "新しい本文",
        fetchedAt: "2026-08-10T12:00:00.000Z",
      })
    );

    const stored = getFiling("S100AAA1");
    expect(stored?.filerName).toBe("任天堂株式会社");
    expect(stored?.submitDate).toBe("2025-06-27");
    expect(stored?.docTypeCode).toBe("120");
    expect(stored?.riskText).toBe("新しい本文");
  });

  it("returns null for an unknown docId", () => {
    upsertFiling(makeFiling());
    expect(getFiling("S100MISSING")).toBeNull();
    expect(getFiling("")).toBeNull();
  });
});

describe("listCompanyFilings", () => {
  beforeEach(() => {
    upsertFiling(
      makeFiling({ docId: "N-2023", submitDate: "2023-06-23" })
    );
    upsertFiling(
      makeFiling({ docId: "N-2025", submitDate: "2025-06-27" })
    );
    upsertFiling(
      makeFiling({ docId: "N-2024", submitDate: "2024-06-25" })
    );
    // Same company, different document type.
    upsertFiling(
      makeFiling({
        docId: "N-SEMI-2025",
        docTypeCode: "160",
        submitDate: "2025-11-06",
      })
    );
    // Another company, same document type.
    upsertFiling(
      makeFiling({
        docId: "T-2025",
        edinetCode: "E02144",
        secCode: "72030",
        filerName: "トヨタ自動車株式会社",
        submitDate: "2025-06-24",
      })
    );
  });

  it("returns only the requested company and document type, newest first", () => {
    const filings = listCompanyFilings("E02367", "120");
    expect(filings.map((f) => f.docId)).toEqual([
      "N-2025",
      "N-2024",
      "N-2023",
    ]);
    for (const filing of filings) {
      expect(filing.edinetCode).toBe("E02367");
      expect(filing.docTypeCode).toBe("120");
    }
  });

  it("respects the limit while keeping the newest filings", () => {
    expect(listCompanyFilings("E02367", "120", 2).map((f) => f.docId)).toEqual([
      "N-2025",
      "N-2024",
    ]);
    expect(listCompanyFilings("E02367", "120", 1).map((f) => f.docId)).toEqual([
      "N-2025",
    ]);
  });

  it("returns an empty array for a limit of zero", () => {
    expect(listCompanyFilings("E02367", "120", 0)).toEqual([]);
  });

  it("isolates document types", () => {
    expect(listCompanyFilings("E02367", "160").map((f) => f.docId)).toEqual([
      "N-SEMI-2025",
    ]);
  });

  it("isolates companies", () => {
    expect(listCompanyFilings("E02144", "120").map((f) => f.docId)).toEqual([
      "T-2025",
    ]);
  });

  it("returns an empty array for a company with no filings", () => {
    expect(listCompanyFilings("E99999", "120")).toEqual([]);
    expect(listCompanyFilings("E02367", "999")).toEqual([]);
  });

  it("maps rows to the domain shape, not raw column names", () => {
    const [first] = listCompanyFilings("E02367", "120", 1);
    expect(first).toBeDefined();
    expect(first?.submitDate).toBe("2025-06-27");
    expect(first?.riskTextSource).toBe("XBRL/PublicDoc/0102010_honbun.htm");
    expect(first && "doc_id" in first).toBe(false);
  });
});

describe("sync cursor", () => {
  it("reports no cursor on a fresh database", () => {
    expect(getSyncCursor()).toEqual({ lastSyncedDate: null });
  });

  it("round-trips a cursor date", () => {
    setSyncCursor("2025-06-27");
    expect(getSyncCursor().lastSyncedDate).toBe("2025-06-27");
  });

  it("overwrites the cursor rather than accumulating rows", () => {
    setSyncCursor("2025-06-27");
    setSyncCursor("2026-08-09");
    expect(getSyncCursor().lastSyncedDate).toBe("2026-08-09");
  });

  it("is independent of the filings table", () => {
    setSyncCursor("2026-08-09");
    expect(countFilings()).toBe(0);
    upsertFiling(makeFiling());
    expect(getSyncCursor().lastSyncedDate).toBe("2026-08-09");
  });
});

describe("countFilings", () => {
  it("counts distinct documents, not upserts", () => {
    expect(countFilings()).toBe(0);
    upsertFiling(makeFiling({ docId: "A" }));
    expect(countFilings()).toBe(1);
    upsertFiling(makeFiling({ docId: "B" }));
    upsertFiling(makeFiling({ docId: "A", fetchedAt: "2026-08-10T00:00:00Z" }));
    expect(countFilings()).toBe(2);
  });
});

describe("persistence", () => {
  it("keeps filings and the cursor across a close and reopen of the same file", () => {
    upsertFiling(makeFiling());
    setSyncCursor("2025-06-27");
    closeStore();

    openStoreAt(dbPath);
    expect(countFilings()).toBe(1);
    expect(getFiling("S100AAA1")?.filerName).toBe("任天堂株式会社");
    expect(getSyncCursor().lastSyncedDate).toBe("2025-06-27");
  });

  it("starts empty when pointed at a different file", () => {
    upsertFiling(makeFiling());
    const otherPath = path.join(path.dirname(dbPath), "other.sqlite");

    openStoreAt(otherPath);
    expect(countFilings()).toBe(0);
    expect(getSyncCursor().lastSyncedDate).toBeNull();

    openStoreAt(dbPath);
    expect(countFilings()).toBe(1);
  });

  it("creates the parent directory for a new database path", () => {
    const nested = path.join(path.dirname(dbPath), "nested", "deep", "db.sqlite");
    openStoreAt(nested);
    upsertFiling(makeFiling());
    expect(countFilings()).toBe(1);
    expect(fs.existsSync(nested)).toBe(true);

    openStoreAt(dbPath);
  });

  it("tolerates closeStore being called twice", () => {
    closeStore();
    expect(() => closeStore()).not.toThrow();
    openStoreAt(dbPath);
  });
});
