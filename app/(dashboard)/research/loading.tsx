export default function ResearchLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Research
        </h1>
        <p className="text-sm text-stone-600">
          Compare what changed in a company&apos;s SEC filings.
        </p>
      </div>

      <p role="status" className="text-sm text-stone-600">
        Loading filing data from SEC EDGAR…
      </p>
    </div>
  );
}
