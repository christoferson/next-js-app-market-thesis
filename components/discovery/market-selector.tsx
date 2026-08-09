"use client";

import type { SupportedMarket } from "@/lib/domain";

const ALL_MARKETS_VALUE = "all";

const OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL_MARKETS_VALUE, label: "All Markets" },
  { value: "US", label: "United States" },
  { value: "JP", label: "Japan" },
];

interface MarketSelectorProps {
  /** Undefined means all supported markets. */
  value: SupportedMarket | undefined;
  onChange: (market: SupportedMarket | undefined) => void;
}

function toMarket(raw: string): SupportedMarket | undefined {
  return raw === "US" || raw === "JP" ? raw : undefined;
}

/** Labeled select. Market names are spelled out — never flags alone. */
export function MarketSelector({ value, onChange }: MarketSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="market-selector"
        className="text-sm font-medium text-stone-700"
      >
        Market
      </label>
      <select
        id="market-selector"
        name="market"
        value={value ?? ALL_MARKETS_VALUE}
        onChange={(event) => onChange(toMarket(event.target.value))}
        className="rounded-sm border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
