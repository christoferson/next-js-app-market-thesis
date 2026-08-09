import { listDiscoveryInstruments } from "@/lib/discovery/service";
import { parseDiscoveryUrlState } from "@/lib/discovery/url-state";
import { DiscoveryControls } from "@/components/discovery/discovery-controls";
import { ResultsTable } from "@/components/discovery/results-table";
import { ResultCards } from "@/components/discovery/result-cards";

/**
 * D2: Discovery state lives in the URL (?asset=&market=&q=&page=). The page
 * server-renders results for the requested state; the client controls
 * component navigates to new URLs, so back/forward and refresh restore state
 * and searches are shareable. Invalid URL values fall back to defaults.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") {
      params.set(key, first);
    }
  }
  const state = parseDiscoveryUrlState(params);

  const { result, meta } = await listDiscoveryInstruments({
    assetType: state.assetType,
    market: state.market,
    query: state.query === "" ? undefined : state.query,
    page: state.page,
    pageSize: 25,
  });

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

      <DiscoveryControls
        state={state}
        pagination={{
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          hasNextPage: result.hasNextPage,
        }}
        meta={{ isDemo: meta.isDemo, asOf: meta.asOf }}
      >
        {result.items.length === 0 ? (
          <p className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
            No instruments match the selected filters.
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <ResultsTable snapshots={result.items} />
            </div>
            <div className="md:hidden">
              <ResultCards snapshots={result.items} />
            </div>
          </>
        )}
      </DiscoveryControls>
    </div>
  );
}
