import type { InstrumentSnapshot } from "@/lib/domain";
import { demoStocks } from "./stocks";
import { demoEtfs } from "./etfs";
import { demoIndices } from "./indices";

const allSnapshots: readonly InstrumentSnapshot[] = [
  ...demoStocks,
  ...demoEtfs,
  ...demoIndices,
];

/**
 * The only entry point the demo provider uses. UI code must never import
 * fixture modules directly — data flows through the provider boundary.
 */
export function getDemoSnapshots(): readonly InstrumentSnapshot[] {
  return allSnapshots;
}
