"use client";

import { useRef } from "react";
import type { AssetType } from "@/lib/domain";

const TABS: ReadonlyArray<{ assetType: AssetType; label: string }> = [
  { assetType: "stock", label: "Stocks" },
  { assetType: "etf", label: "ETFs" },
  { assetType: "index", label: "Indices" },
];

interface AssetTabsProps {
  value: AssetType;
  onChange: (assetType: AssetType) => void;
}

/**
 * Tabs with roving tabindex: only the selected tab is in the tab sequence and
 * arrow keys move both focus and selection, per the ARIA tabs pattern.
 */
export function AssetTabs({ value, onChange }: AssetTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectIndex(index: number) {
    const tab = TABS[index];
    if (!tab) return;
    tabRefs.current[index]?.focus();
    onChange(tab.assetType);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = TABS.findIndex((tab) => tab.assetType === value);
    if (currentIndex < 0) return;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        selectIndex((currentIndex + 1) % TABS.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        selectIndex((currentIndex - 1 + TABS.length) % TABS.length);
        break;
      case "Home":
        event.preventDefault();
        selectIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectIndex(TABS.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Asset type"
      className="flex gap-1 border-b border-stone-200"
    >
      {TABS.map((tab, index) => {
        const isSelected = tab.assetType === value;
        return (
          <button
            key={tab.assetType}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`asset-tab-${tab.assetType}`}
            aria-selected={isSelected}
            aria-controls="discovery-results"
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.assetType)}
            onKeyDown={handleKeyDown}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 ${
              isSelected
                ? "border-stone-800 font-semibold text-stone-900"
                : "border-transparent font-normal text-stone-600 hover:text-stone-900"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
