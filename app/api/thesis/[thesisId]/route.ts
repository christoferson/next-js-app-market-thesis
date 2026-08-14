import { NextRequest, NextResponse } from "next/server";
import {
  noteSchema,
  reviseThesisSchema,
  statusChangeSchema,
  toValidationFailure,
} from "@/lib/validation/thesis-request";
import {
  appendNote,
  getThesis,
  listJournal,
  reviseThesis,
  setThesisStatus,
} from "@/lib/thesis/store";

const ID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ thesisId: string }> }
): Promise<NextResponse> {
  const { thesisId } = await context.params;
  if (!ID_PATTERN.test(thesisId)) return notFound();

  const thesis = getThesis(thesisId);
  if (thesis === null) return notFound();

  return NextResponse.json({
    data: { thesis, journal: listJournal(thesisId) },
  });
}

/**
 * POST with an action discriminator: revise | set-status | add-note.
 * Revisions create a new version; nothing ever overwrites an old one.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ thesisId: string }> }
): Promise<NextResponse> {
  const { thesisId } = await context.params;
  if (!ID_PATTERN.test(thesisId)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("The request body must be valid JSON.", {});
  }

  const action =
    typeof body === "object" && body !== null && "action" in body
      ? String((body as { action: unknown }).action)
      : "";
  const payload =
    typeof body === "object" && body !== null && "payload" in body
      ? (body as { payload: unknown }).payload
      : undefined;

  try {
    if (action === "revise") {
      const parsed = reviseThesisSchema.safeParse(payload);
      if (!parsed.success) {
        const failure = toValidationFailure(parsed.error);
        return invalid(failure.message, failure.details);
      }
      const revised = reviseThesis(thesisId, parsed.data);
      return revised === null ? notFound() : NextResponse.json({ data: revised });
    }

    if (action === "set-status") {
      const parsed = statusChangeSchema.safeParse(payload);
      if (!parsed.success) {
        const failure = toValidationFailure(parsed.error);
        return invalid(failure.message, failure.details);
      }
      const updated = setThesisStatus(
        thesisId,
        parsed.data.status,
        parsed.data.note
      );
      return updated === null ? notFound() : NextResponse.json({ data: updated });
    }

    if (action === "add-note") {
      const parsed = noteSchema.safeParse(payload);
      if (!parsed.success) {
        const failure = toValidationFailure(parsed.error);
        return invalid(failure.message, failure.details);
      }
      const entry = appendNote(thesisId, parsed.data.text);
      return entry === null ? notFound() : NextResponse.json({ data: entry });
    }

    return invalid(
      'Unknown action. Supported: "revise", "set-status", "add-note".',
      { action: [action] }
    );
  } catch (error) {
    console.error(`POST /api/thesis/${thesisId} failed:`, error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The thesis update could not be saved.",
          retryable: true,
          details: {},
        },
      },
      { status: 500 }
    );
  }
}

function notFound(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "No thesis exists with this ID.",
        retryable: false,
        details: {},
      },
    },
    { status: 404 }
  );
}

function invalid(
  message: string,
  details: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: { code: "INVALID_REQUEST", message, retryable: false, details } },
    { status: 400 }
  );
}
