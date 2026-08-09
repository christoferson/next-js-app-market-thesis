import Link from "next/link";

export default function InstrumentNotFound() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
        Instrument not found
      </h1>

      <div className="space-y-3 rounded-md border border-stone-300 bg-white p-6">
        <p className="text-sm leading-relaxed text-stone-700">
          No instrument matches this identifier. The link may be misspelled, or
          the instrument may no longer be available from the current data
          source.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          Nothing was loaded, so no figures on this page describe any
          instrument.
        </p>
      </div>

      <Link
        href="/discover"
        className="inline-block rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to Discover
      </Link>
    </div>
  );
}
