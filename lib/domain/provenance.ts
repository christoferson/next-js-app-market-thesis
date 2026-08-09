export type DataProviderId = string;

export interface DataProvenance {
  provider: DataProviderId;
  fetchedAt: string;
  /** Data as-of date (ISO 8601). Demo data uses a fixed date that never advances. */
  asOf: string | null;

  isDemo: boolean;
  isDelayed: boolean;
  delayDescription?: string;

  warnings: string[];
}
