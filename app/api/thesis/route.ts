import { NextRequest, NextResponse } from "next/server";
import { createThesisSchema, toValidationFailure } from "@/lib/validation/thesis-request";
import { createThesis, listTheses } from "@/lib/thesis/store";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ data: listTheses() });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("The request body must be valid JSON.", {});
  }

  const parsed = createThesisSchema.safeParse(body);
  if (!parsed.success) {
    const failure = toValidationFailure(parsed.error);
    return invalid(failure.message, failure.details);
  }

  try {
    const thesis = createThesis(parsed.data);
    return NextResponse.json({ data: thesis }, { status: 201 });
  } catch (error) {
    console.error("POST /api/thesis failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The thesis could not be saved.",
          retryable: true,
          details: {},
        },
      },
      { status: 500 }
    );
  }
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
