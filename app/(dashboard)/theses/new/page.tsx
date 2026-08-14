import Link from "next/link";
import type { Metadata } from "next";

import { ThesisForm } from "@/components/thesis/thesis-form";

export const metadata: Metadata = {
  title: "New thesis — Market Thesis",
  description:
    "Write why you invested, what would change your mind, and the claims that can be checked later.",
};

export default function NewThesisPage() {
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
      </div>

      <ThesisForm mode="create" />
    </div>
  );
}
