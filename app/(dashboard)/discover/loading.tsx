export default function DiscoverLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Discover
        </h1>
        <p className="text-sm text-stone-600">
          Find research candidates across US and Japanese markets.
        </p>
      </div>

      <p role="status" className="text-sm text-stone-600">
        Loading instruments…
      </p>
    </div>
  );
}
