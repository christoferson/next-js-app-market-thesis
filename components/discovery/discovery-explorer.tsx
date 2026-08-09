"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssetType,
  InstrumentSnapshot,
  SupportedMarket,
} from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { AssetTabs } from "./asset-tabs";
import { MarketSelector } from "./market-selector";
import { Pagination } from "./pagination";
import { ResultCards } from "./result-cards";
import { ResultsTable } from "./results-table";

const PAGE_SIZE = 25;

export interface DiscoveryPagination {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

/**
 * Locally declared to keep this client component free of any import from the
 * server-only discovery service. Kept structurally compatible with
 * `DiscoveryMeta` and `PaginatedResult<InstrumentSnapshot>`.
 */
export interface DiscoveryMetaView {
  provider: string;
  providerDisplayName: string;
  isDemo: boolean;
  fetchedAt: string;
  asOf: string | null;
  warnings: string[];
}

export interface DiscoveryInitialData {
  result: {
    items: InstrumentSnapshot[];
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
  meta: DiscoveryMetaView;
}

interface DiscoveryView {
  snapshots: readonly InstrumentSnapshot[];
  pagination: DiscoveryPagination;
  meta: DiscoveryMetaView;
}

interface DiscoveryQueryState {
  assetType: AssetType;
  market: SupportedMarket | undefined;
  page: number;
}

type LoadStatus = "ready" | "loading" | "error";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong while loading discovery data.";

interface ApiEnvelope {
  data: InstrumentSnapshot[];
  pagination: DiscoveryPagination;
  meta: DiscoveryMetaView;
}

function readErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const { error } = payload as { error: unknown };
    if (typeof error === "object" && error !== null && "message" in error) {
      const { message } = error as { message: unknown };
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * Structural check of the first-party envelope. The payload is produced by our
 * own route handler, which validates the query and normalizes provider data, so
 * the client only confirms the envelope shape rather than re-validating every
 * metric.
 */
function asEnvelope(payload: unknown): ApiEnvelope | null {
  if (typeof payload !== "object" || payload === null) return null;

  const candidate = payload as {
    data?: unknown;
    pagination?: unknown;
    meta?: unknown;
  };

  if (!Array.isArray(candidate.data)) return null;
  if (typeof candidate.pagination !== "object" || candidate.pagination === null) {
    return null;
  }
  if (typeof candidate.meta !== "object" || candidate.meta === null) return null;

  return candidate as ApiEnvelope;
}

function buildRequestUrl(query: DiscoveryQueryState): string {
  const params = new URLSearchParams({
    assetType: query.assetType,
    page: String(query.page),
    pageSize: String(PAGE_SIZE),
  });
  if (query.market) {
    params.set("market", query.market);
  }
  return `/api/discovery/instruments?${params.toString()}`;
}

export function DiscoveryExplorer({
  initialData,
}: {
  initialData: DiscoveryInitialData;
}) {
  const [query, setQuery] = useState<DiscoveryQueryState>({
    assetType: "stock",
    market: undefined,
    page: 1,
  });

  const [view, setView] = useState<DiscoveryView>({
    snapshots: initialData.result.items,
    pagination: {
      page: initialData.result.page,
      pageSize: initialData.result.pageSize,
      total: initialData.result.total,
      hasNextPage: initialData.result.hasNextPage,
    },
    meta: initialData.meta,
  });

  const [status, setStatus] = useState<LoadStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string>(
    GENERIC_ERROR_MESSAGE
  );
  const [retryCount, setRetryCount] = useState(0);

  // The server already rendered this exact query, so the first effect run must
  // not refetch it. Identity comparison works because every state update below
  // creates a new query object.
  const serverRenderedQuery = useRef(query);

  useEffect(() => {
    if (query === serverRenderedQuery.current && retryCount === 0) {
      return;
    }

    const controller = new AbortController();
    let ignore = false;

    setStatus("loading");

    async function load() {
      try {
        const response = await fetch(buildRequestUrl(query), {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        const payload: unknown = await response.json().catch(() => null);
        if (ignore) return;

        if (!response.ok) {
          setErrorMessage(readErrorMessage(payload));
          setStatus("error");
          return;
        }

        const envelope = asEnvelope(payload);
        if (!envelope) {
          setErrorMessage(GENERIC_ERROR_MESSAGE);
          setStatus("error");
          return;
        }

        setView({
          snapshots: envelope.data,
          pagination: envelope.pagination,
          meta: envelope.meta,
        });
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted || ignore) return;
        console.error("Discovery request failed:", error);
        setErrorMessage(GENERIC_ERROR_MESSAGE);
        setStatus("error");
      }
    }

    void load();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [query, retryCount]);

  const handleAssetTypeChange = useCallback((assetType: AssetType) => {
    setQuery((current) =>
      current.assetType === assetType
        ? current
        : { assetType, market: current.market, page: 1 }
    );
  }, []);

  const handleMarketChange = useCallback(
    (market: SupportedMarket | undefined) => {
      setQuery((current) =>
        current.market === market
          ? current
          : { assetType: current.assetType, market, page: 1 }
      );
    },
    []
  );

  const handlePageChange = useCallback((page: number) => {
    setQuery((current) =>
      current.page === page || page < 1 ? current : { ...current, page }
    );
  }, []);

  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const { pagination, meta, snapshots } = view;
  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / Math.max(pagination.pageSize, 1))
  );
  const isLoading = status === "loading";

  return (
    <section className="space-y-4">
      <AssetTabs value={query.assetType} onChange={handleAssetTypeChange} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MarketSelector value={query.market} onChange={handleMarketChange} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{`${pagination.total} results`}</span>
          <span>{`As of ${formatDate(meta.asOf)}`}</span>
          {meta.isDemo ? (
            <span className="rounded-sm border border-stone-300 px-1.5 py-0.5 text-stone-600">
              Demo data — not current market information.
            </span>
          ) : null}
        </div>
      </div>

      <div
        id="discovery-results"
        role="tabpanel"
        aria-labelledby={`asset-tab-${query.assetType}`}
        aria-busy={isLoading}
        tabIndex={-1}
        className="space-y-4"
      >
        <p role="status" className="min-h-5 text-xs text-stone-500">
          {isLoading ? "Loading instruments…" : ""}
        </p>

        {status === "error" ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-stone-300 bg-white p-6"
          >
            <h2 className="text-sm font-semibold text-stone-900">
              {GENERIC_ERROR_MESSAGE}
            </h2>
            <p className="text-sm text-stone-600">{errorMessage}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-sm border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
            >
              Try again
            </button>
          </div>
        ) : snapshots.length === 0 ? (
          <p className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
            No instruments match the selected filters.
          </p>
        ) : (
          <div className={isLoading ? "opacity-60 transition-opacity" : undefined}>
            <div className="hidden md:block">
              <ResultsTable snapshots={snapshots} />
            </div>
            <div className="md:hidden">
              <ResultCards snapshots={snapshots} />
            </div>
          </div>
        )}

        {status !== "error" &&
        (snapshots.length > 0 || pagination.page > 1) ? (
          <Pagination
            page={pagination.page}
            totalPages={totalPages}
            hasNextPage={pagination.hasNextPage}
            onPageChange={handlePageChange}
          />
        ) : null}
      </div>
    </section>
  );
}
