import Link from "next/link";

export default function JapanCompanyNotFound() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
        Company not found in the Japanese research universe
      </h1>

      <div className="space-y-3 rounded-md border border-stone-300 bg-white p-6">
        <p className="text-sm leading-relaxed text-stone-700">
          No company in the current Japanese research universe matches this
          identifier. The link may be misspelled, or the company may not be part
          of the curated starter set yet.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          No filings were read, so no figures on this page describe any company.
        </p>
      </div>

      <Link
        href="/research"
        className="inline-block rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to Research
      </Link>
    </div>
  );
}
