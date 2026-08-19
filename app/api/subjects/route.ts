import { NextResponse } from "next/server";
import { listSubjects } from "@/lib/subjects/registry";

/** Subject picker data for client forms (thesis, transaction, mark). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ data: listSubjects() });
}
