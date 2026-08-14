import { NextRequest, NextResponse } from "next/server";
import {
  createPriceMarkSchema,
  createTransactionSchema,
  zodDetails,
} from "@/lib/validation/portfolio-request";
import { getPortfolio, validateSellQuantity } from "@/lib/portfolio/service";
import {
  deleteTransaction,
  insertPriceMark,
  insertTransaction,
  listTransactions,
} from "@/lib/portfolio/store";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ data: getPortfolio() });
}

/**
 * POST actions: add-transaction | add-mark | delete-transaction.
 * Sells are validated against holdings as of their date — a ledger that
 * goes negative is rejected, not silently recorded.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    if (action === "add-transaction") {
      const parsed = createTransactionSchema.safeParse(payload);
      if (!parsed.success) {
        return invalid("The transaction is invalid.", zodDetails(parsed.error));
      }

      if (parsed.data.kind === "sell") {
        const candidate = {
          ...parsed.data,
          id: "candidate",
          createdAt: new Date().toISOString(),
        };
        const check = validateSellQuantity(candidate, {
          subjectRef: parsed.data.subjectRef,
          existing: listTransactions(parsed.data.subjectRef),
        });
        if (!check.ok) {
          return invalid(check.message, { quantity: [check.message] });
        }
      }

      const transaction = insertTransaction(parsed.data);
      return NextResponse.json({ data: transaction }, { status: 201 });
    }

    if (action === "add-mark") {
      const parsed = createPriceMarkSchema.safeParse(payload);
      if (!parsed.success) {
        return invalid("The price mark is invalid.", zodDetails(parsed.error));
      }
      const mark = insertPriceMark(parsed.data);
      return NextResponse.json({ data: mark }, { status: 201 });
    }

    if (action === "delete-transaction") {
      const id =
        typeof payload === "object" && payload !== null && "id" in payload
          ? String((payload as { id: unknown }).id)
          : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return invalid("A valid transaction id is required.", {});
      }
      const deleted = deleteTransaction(id);
      if (!deleted) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "No transaction exists with this ID.",
              retryable: false,
              details: {},
            },
          },
          { status: 404 }
        );
      }
      return NextResponse.json({ data: { deleted: true } });
    }

    return invalid(
      'Unknown action. Supported: "add-transaction", "add-mark", "delete-transaction".',
      { action: [action] }
    );
  } catch (error) {
    console.error("POST /api/portfolio failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The portfolio update could not be saved.",
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
