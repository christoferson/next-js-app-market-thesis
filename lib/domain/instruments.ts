export type AssetType = "stock" | "etf" | "index";
export type SupportedMarket = "US" | "JP";
export type SupportedCurrency = "USD" | "JPY";

export const ASSET_TYPES: readonly AssetType[] = ["stock", "etf", "index"];
export const SUPPORTED_MARKETS: readonly SupportedMarket[] = ["US", "JP"];

export interface Instrument {
  /** Stable internal ID, safe for route usage. Never a raw provider symbol. */
  id: string;
  assetType: AssetType;

  /** Ticker symbol as a string. Japanese security codes must never be parsed as numbers. */
  symbol: string;
  name: string;
  nativeName?: string;

  listingMarket: SupportedMarket;
  exchangeCode: string;
  exchangeName: string;
  currency: SupportedCurrency;

  countryCode?: string;
  sector?: string;
  industry?: string;

  /** Indices are reference benchmarks and must always be non-tradable. */
  isTradable: boolean;
  isActive: boolean;

  /** Internal integration metadata. UI components must not depend on it. */
  providerSymbol?: string;
}
