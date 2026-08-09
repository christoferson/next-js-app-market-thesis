import { listDiscoveryInstruments } from "@/lib/discovery/service";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

/**
 * D1 reads no URL state: the page always renders the default view
 * (stocks / all markets / page 1) on the server and hands it to the client
 * explorer, which owns interaction state from there.
 */
export default async function DiscoverPage() {
  const { result, meta } = await listDiscoveryInstruments({
    assetType: "stock",
    page: 1,
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

      <DiscoveryExplorer initialData={{ result, meta }} />
    </div>
  );
}
