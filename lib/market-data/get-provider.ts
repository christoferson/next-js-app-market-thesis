import "server-only";

import type { MarketDataProvider } from "./types";
import { MarketDataError } from "./errors";
import {
  createDemoMarketDataProvider,
  DEMO_PROVIDER_ID,
} from "./providers/demo/provider";

/**
 * Server-side provider selection. `MARKET_DATA_PROVIDER` defaults to `demo`.
 * An unsupported value is a configuration error — never a silent fallback,
 * because a user who configured a live provider must not unknowingly see
 * demo data presented in its place.
 */
export function getMarketDataProvider(): MarketDataProvider {
  const configured = process.env.MARKET_DATA_PROVIDER ?? DEMO_PROVIDER_ID;

  if (configured === DEMO_PROVIDER_ID) {
    return createDemoMarketDataProvider();
  }

  throw new MarketDataError(
    "PROVIDER_NOT_CONFIGURED",
    `Unsupported MARKET_DATA_PROVIDER "${configured}". Only "demo" is supported during D1–D4.`
  );
}
