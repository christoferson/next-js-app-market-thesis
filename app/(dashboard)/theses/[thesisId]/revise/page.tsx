import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getThesis } from "@/lib/thesis/store";
import type { ThesisVersion, ThesisWithHistory } from "@/lib/thesis/types";
import { ThesisForm } from "@/components/thesis/thesis-form";

/**
 * Revise a thesis (T1). The form is prefilled from the current version and
 * carries each claim's id forward, so a claim that is only reworded stays the
 * same claim across versions. Saving inserts version N+1 — nothing here can
 * overwrite what is already recorded.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}): Promise<Metadata> {
  const { thesisId } = await params;
  const thesis = getThesis(thesisId);
  if (thesis === null) {
    return { title: "Thesis not found — Market Thesis" };
  }
  return {
    title: `Revise ${currentVersion(thesis).title} — Market Thesis`,
  };
}

function currentVersion(thesis: ThesisWithHistory): ThesisVersion {
  const byNumber = thesis.versions[thesis.currentVersion - 1];
  if (byNumber !== undefined && byNumber.version === thesis.currentVersion) {
    return byNumber;
  }
  const found = thesis.versions.find(
    (version) => version.version === thesis.currentVersion
  );
  if (found !== undefined) return found;

  const last = thesis.versions.at(-1);
  if (last === undefined) {
    notFound();
  }
  return last;
}

export default async function ReviseThesisPage({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}) {
  const { thesisId } = await params;

  const thesis = getThesis(thesisId);
  if (thesis === null) {
    notFound();
  }

  const version = currentVersion(thesis);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/theses/${thesis.id}`}
        className="inline-block rounded-sm text-sm text-stone-600 transition-colors motion-reduce:transition-none hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to the thesis
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Revise thesis
        </h1>
        <p className="text-sm text-stone-700">{thesis.subjectLabel}</p>
        <p className="text-sm leading-relaxed text-stone-600">
          {`Editing version ${version.version} into version ${version.version + 1}. Version ${version.version} stays readable exactly as it is now.`}
        </p>
      </div>

      <ThesisForm
        mode="revise"
        thesisId={thesis.id}
        initial={{
          title: version.title,
          summary: version.summary,
          edge: version.edge,
          bearCase: version.bearCase,
          timeHorizon: version.timeHorizon,
          claims: version.claims,
        }}
      />
    </div>
  );
}
