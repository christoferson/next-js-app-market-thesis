import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkThesisAgainstEvidence } from "@/lib/contradiction/service";
import { listEvaluationRuns, setUserOverride } from "@/lib/contradiction/store";
import { CLASSIFICATIONS } from "@/lib/contradiction/prompt";
import { AnalysisError } from "@/lib/research/analysis/types";
import { MarketDataError } from "@/lib/market-data/errors";

const ID_PATTERN = /^[0-9a-f-]{36}$/i;

/** GET: evaluation history. POST: run a new check, or record an override. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ thesisId: string }> }
): Promise<NextResponse> {
  const { thesisId } = await context.params;
  if (!ID_PATTERN.test(thesisId)) return notFound();
  return NextResponse.json({ data: { runs: listEvaluationRuns(thesisId) } });
}

const overrideSchema = z
  .object({
    action: z.literal("override"),
    evaluationId: z.string().uuid(),
    classification: z.enum(CLASSIFICATIONS),
    note: z.string().trim().min(5).max(2_000),
  })
  .strict();

const runSchema = z.object({ action: z.literal("run") }).strict();

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
    return invalid("The request body must be valid JSON.");
  }

  const asRun = runSchema.safeParse(body);
  if (asRun.success) {
    try {
      const outcome = await checkThesisAgainstEvidence(thesisId);
      if (outcome === null) return notFound();
      return NextResponse.json({ data: outcome });
    } catch (error) {
      return mapError(error, thesisId);
    }
  }

  const asOverride = overrideSchema.safeParse(body);
  if (asOverride.success) {
    const updated = setUserOverride(
      asOverride.data.evaluationId,
      asOverride.data.classification,
      asOverride.data.note
    );
    if (updated === null || updated.thesisId !== thesisId) {
      return notFound();
    }
    return NextResponse.json({ data: updated });
  }

  return invalid('Unknown action. Supported: {"action":"run"} or an override.');
}

function mapError(error: unknown, thesisId: string): NextResponse {
  if (error instanceof AnalysisError) {
    const status =
      error.code === "ANALYSIS_NOT_CONFIGURED"
        ? 501
        : error.code === "ANALYSIS_INVALID_RESPONSE"
          ? 500
          : 503;
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: {},
        },
      },
      { status }
    );
  }
  if (error instanceof MarketDataError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: {},
        },
      },
      { status: 502 }
    );
  }
  console.error(`POST /api/thesis/${thesisId}/check failed:`, error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The evidence check could not be completed.",
        retryable: true,
        details: {},
      },
    },
    { status: 500 }
  );
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

function invalid(message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "INVALID_REQUEST",
        message,
        retryable: false,
        details: {},
      },
    },
    { status: 400 }
  );
}
