import Link from "next/link";

export default function ThesisNotFound() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
        Thesis not found
      </h1>

      <div className="space-y-3 rounded-md border border-stone-300 bg-white p-6">
        <p className="text-sm leading-relaxed text-stone-700">
          No thesis in this application&apos;s database matches this identifier.
          The link may be misspelled, or the thesis may have been written in a
          different local database.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          Nothing was read or changed. Theses are stored locally and are never
          deleted by opening a link.
        </p>
      </div>

      <Link
        href="/theses"
        className="inline-block rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to Theses
      </Link>
    </div>
  );
}
