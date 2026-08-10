import { describe, expect, it } from "vitest";
import { AnalysisError } from "@/lib/research/analysis/types";

/**
 * AnalysisError is the only failure shape the analysis facade exposes. Callers
 * branch on `code` to decide what the UI says and on `retryable` to decide
 * whether a retry is offered, so both must be preserved exactly as passed.
 */

const CODES = [
  "ANALYSIS_NOT_CONFIGURED",
  "ANALYSIS_UNAVAILABLE",
  "ANALYSIS_INVALID_RESPONSE",
  "ANALYSIS_REFUSED",
] as const satisfies readonly AnalysisError["code"][];

describe("AnalysisError construction", () => {
  it("sets code, message, retryable, and name", () => {
    const error = new AnalysisError(
      "ANALYSIS_UNAVAILABLE",
      "The analysis service did not respond.",
      true
    );

    expect(error.code).toBe("ANALYSIS_UNAVAILABLE");
    expect(error.message).toBe("The analysis service did not respond.");
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("AnalysisError");
  });

  it("defaults retryable to false", () => {
    const error = new AnalysisError(
      "ANALYSIS_NOT_CONFIGURED",
      "Analysis is not configured."
    );

    expect(error.retryable).toBe(false);
  });

  it("is an Error and an AnalysisError for instanceof checks", () => {
    const error = new AnalysisError("ANALYSIS_REFUSED", "Refused.");

    expect(error).toBeInstanceOf(AnalysisError);
    expect(error).toBeInstanceOf(Error);
    expect(error.stack).toBeDefined();
  });

  it("is throwable and catchable with its code intact", () => {
    const thrown = (() => {
      try {
        throw new AnalysisError("ANALYSIS_INVALID_RESPONSE", "Bad JSON.", false);
      } catch (caught) {
        return caught;
      }
    })();

    expect(thrown).toBeInstanceOf(AnalysisError);
    expect((thrown as AnalysisError).code).toBe("ANALYSIS_INVALID_RESPONSE");
  });
});

describe("AnalysisError codes", () => {
  it("constructs every code with both retryable values", () => {
    for (const code of CODES) {
      const nonRetryable = new AnalysisError(code, `Failed: ${code}`);
      const retryable = new AnalysisError(code, `Failed: ${code}`, true);

      expect(nonRetryable.code).toBe(code);
      expect(nonRetryable.retryable).toBe(false);
      expect(retryable.code).toBe(code);
      expect(retryable.retryable).toBe(true);
      expect(nonRetryable.name).toBe("AnalysisError");
    }
  });

  it("exposes exactly four distinct codes in the tested set", () => {
    expect(new Set(CODES).size).toBe(4);
  });

  it("does not leak the code into the message automatically", () => {
    // The message is caller-authored user-facing text; the code stays separate
    // so the UI never renders a raw enum value by accident.
    const error = new AnalysisError(
      "ANALYSIS_UNAVAILABLE",
      "Analysis is temporarily unavailable."
    );

    expect(error.message).not.toContain("ANALYSIS_UNAVAILABLE");
  });
});
