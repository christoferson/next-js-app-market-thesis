import Link from "next/link";
import type { Metadata } from "next";

import { resolveSubject } from "@/lib/subjects/registry";
import { ThesisForm } from "@/components/thesis/thesis-form";

/**
 * Write a thesis. A `?subject=` reference — arrived at from a research page or
 * a portfolio row — is resolved through the registry, so the subject is
 * preselected only when it actually exists; an unknown reference falls back to
 * an unfilled picker rather than to a subject the rest of the app cannot open.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New thesis — Market Thesis",
  description:
    "Write why you invested, what would change your mind, and the claims that can be checked later.",
};

export default async function NewThesisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = params.subject;
  const subjectRef = typeof requested === "string" ? requested : null;
  const subject = subjectRef === null ? null : resolveSubject(subjectRef);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/theses"
        className="inline-block rounded-sm text-sm text-stone-600 transition-colors motion-reduce:transition-none hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to Theses
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          New thesis
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Write the reasoning in your own words. Later versions never overwrite
          this one, so what you believed at the start stays readable.
        </p>
        {subjectRef !== null && subject === null ? (
          <p className="text-sm leading-relaxed text-stone-700">
            The subject in the link is not one this application knows, so
            nothing was preselected. Choose the subject below.
          </p>
        ) : null}
      </div>

      <ThesisForm
        mode="create"
        initialSubject={
          subject === null ? null : { ref: subject.ref, label: subject.label }
        }
      />
    </div>
  );
}
