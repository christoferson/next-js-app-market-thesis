import { describe, expect, it, vi } from "vitest";

/**
 * `lib/research/edinet/client.ts` imports "server-only", whose guard throws
 * under Vitest's node environment (Vitest does not apply the react-server
 * condition). Neutralizing the module lets the file's PURE exports —
 * redaction, the boundary schema, and the doc-type constants — be tested
 * without touching the network paths.
 */
vi.mock("server-only", () => ({}));

// `vi.mock` is hoisted above these imports, so the guard never runs.
import {
  ANNUAL_REPORT_DOC_TYPE,
  SEMIANNUAL_REPORT_DOC_TYPE,
  edinetDocumentSchema,
  redactUrl,
} from "@/lib/research/edinet/client";

describe("redactUrl", () => {
  it("redacts the key when it is the only query parameter", () => {
    expect(
      redactUrl(
        "https://api.edinet-fsa.go.jp/api/v2/documents.json?Subscription-Key=abc123"
      )
    ).toBe(
      "https://api.edinet-fsa.go.jp/api/v2/documents.json?Subscription-Key=REDACTED"
    );
  });

  it("redacts the key when it is the last parameter", () => {
    expect(
      redactUrl(
        "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2025-06-27&type=2&Subscription-Key=secret-token"
      )
    ).toBe(
      "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2025-06-27&type=2&Subscription-Key=REDACTED"
    );
  });

  it("redacts the key mid-query and preserves the parameters after it", () => {
    const redacted = redactUrl(
      "https://api.edinet-fsa.go.jp/api/v2/documents/S100XYZ1?Subscription-Key=secret-token&type=1&date=2025-06-27"
    );
    expect(redacted).toBe(
      "https://api.edinet-fsa.go.jp/api/v2/documents/S100XYZ1?Subscription-Key=REDACTED&type=1&date=2025-06-27"
    );
    expect(redacted).not.toContain("secret-token");
  });

  it("matches the parameter name case-insensitively", () => {
    expect(redactUrl("https://example.test/?subscription-key=abc")).toBe(
      "https://example.test/?Subscription-Key=REDACTED"
    );
    expect(redactUrl("https://example.test/?SUBSCRIPTION-KEY=abc&type=1")).toBe(
      "https://example.test/?Subscription-Key=REDACTED&type=1"
    );
  });

  it("redacts every occurrence when the key appears more than once", () => {
    const redacted = redactUrl(
      "https://example.test/?Subscription-Key=one&type=2&Subscription-Key=two"
    );
    expect(redacted).toBe(
      "https://example.test/?Subscription-Key=REDACTED&type=2&Subscription-Key=REDACTED"
    );
    expect(redacted).not.toMatch(/one|two/);
  });

  it("leaves a URL without a key unchanged", () => {
    const url = "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2025-06-27&type=2";
    expect(redactUrl(url)).toBe(url);
  });

  it("redacts an empty key value without consuming the next parameter", () => {
    expect(redactUrl("https://example.test/?Subscription-Key=&type=2")).toBe(
      "https://example.test/?Subscription-Key=REDACTED&type=2"
    );
  });
});

const fullEntry = {
  docID: "S100XYZ1",
  edinetCode: "E02367",
  secCode: "79740",
  filerName: "任天堂株式会社",
  docTypeCode: "120",
  periodStart: "2024-04-01",
  periodEnd: "2025-03-31",
  submitDateTime: "2025-06-27 09:30",
  docDescription: "有価証券報告書－第85期",
  xbrlFlag: "1",
  withdrawalStatus: "0",
};

describe("edinetDocumentSchema", () => {
  it("parses a complete list entry", () => {
    const result = edinetDocumentSchema.safeParse(fullEntry);
    expect(result.success).toBe(true);
    expect(result.data?.docID).toBe("S100XYZ1");
    expect(result.data?.edinetCode).toBe("E02367");
    expect(result.data?.docTypeCode).toBe("120");
    expect(result.data?.filerName).toBe("任天堂株式会社");
  });

  it("accepts null for every nullable metadata field", () => {
    const result = edinetDocumentSchema.safeParse({
      docID: "S100XYZ1",
      edinetCode: null,
      secCode: null,
      filerName: null,
      docTypeCode: null,
      periodStart: null,
      periodEnd: null,
      submitDateTime: null,
      docDescription: null,
      xbrlFlag: null,
      withdrawalStatus: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.secCode).toBeNull();
    expect(result.data?.periodEnd).toBeNull();
  });

  it("rejects an entry with no docID", () => {
    const { docID: _docID, ...withoutDocId } = fullEntry;
    expect(edinetDocumentSchema.safeParse(withoutDocId).success).toBe(false);
  });

  it("rejects an entry whose docID is null (the one required field)", () => {
    expect(
      edinetDocumentSchema.safeParse({ ...fullEntry, docID: null }).success
    ).toBe(false);
  });

  it("rejects an entry missing a nullable field entirely", () => {
    // Nullable is not optional: EDINET always sends the key, so an absent
    // field means the payload shape changed and must not be trusted.
    const { secCode: _secCode, ...withoutSecCode } = fullEntry;
    expect(edinetDocumentSchema.safeParse(withoutSecCode).success).toBe(false);
  });

  it("rejects a non-string docTypeCode instead of coercing it", () => {
    expect(
      edinetDocumentSchema.safeParse({ ...fullEntry, docTypeCode: 120 }).success
    ).toBe(false);
  });

  it("tolerates the extra keys EDINET sends and strips them", () => {
    const result = edinetDocumentSchema.safeParse({
      ...fullEntry,
      seqNumber: 1,
      ordinanceCode: "010",
      formCode: "030000",
      pdfFlag: "1",
      attachDocFlag: "1",
      legalStatus: "1",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(fullEntry);
    expect(result.data && "seqNumber" in result.data).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(edinetDocumentSchema.safeParse(null).success).toBe(false);
    expect(edinetDocumentSchema.safeParse("S100XYZ1").success).toBe(false);
    expect(edinetDocumentSchema.safeParse([fullEntry]).success).toBe(false);
  });
});

describe("document type constants", () => {
  it("uses EDINET's codes for the annual and semiannual reports", () => {
    expect(ANNUAL_REPORT_DOC_TYPE).toBe("120");
    expect(SEMIANNUAL_REPORT_DOC_TYPE).toBe("160");
  });
});
