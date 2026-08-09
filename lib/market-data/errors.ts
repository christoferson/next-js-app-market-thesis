export type MarketDataErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "PROVIDER_NOT_CONFIGURED"
  | "INTERNAL_ERROR";

export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: MarketDataErrorCode,
    message: string,
    options?: { retryable?: boolean; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = "MarketDataError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}
