/**
 * Reading the portfolio API's replies in the browser. The API returns a
 * readable message plus per-field `details`; internals are never surfaced, and
 * an unparseable body falls back to a plain sentence rather than to silence.
 */

export type FieldErrors = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function errorMessageFrom(payload: unknown): string | null {
  const message = asRecord(asRecord(payload)?.error)?.message;
  return typeof message === "string" && message !== "" ? message : null;
}

/** Maps `details` field paths to their first message, for display inline. */
export function fieldErrorsFrom(payload: unknown): FieldErrors {
  const details = asRecord(asRecord(asRecord(payload)?.error)?.details);
  if (details === null) return {};

  const mapped: FieldErrors = {};
  for (const [path, messages] of Object.entries(details)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === "string" && first !== "") {
      mapped[path] = first;
    }
  }
  return mapped;
}

export interface PortfolioPostResult {
  ok: boolean;
  message: string | null;
  fieldErrors: FieldErrors;
}

export async function postPortfolio(
  action: "add-transaction" | "add-mark" | "delete-transaction",
  payload: unknown,
  fallbackMessage: string
): Promise<PortfolioPostResult> {
  try {
    const response = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (response.ok) return { ok: true, message: null, fieldErrors: {} };

    const body: unknown = await response.json().catch((): unknown => null);
    return {
      ok: false,
      message: errorMessageFrom(body) ?? fallbackMessage,
      fieldErrors: fieldErrorsFrom(body),
    };
  } catch {
    return {
      ok: false,
      message: `${fallbackMessage} Check your connection and try again.`,
      fieldErrors: {},
    };
  }
}
