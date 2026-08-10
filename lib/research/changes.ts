import type { EdgarCompanyFacts } from "./edgar/schemas";
import { selectAnnualSeries, type SelectedFact } from "./edgar/facts";

/**
 * Deterministic period-over-period financial changes (R1). Every value
 * carries its XBRL provenance (tag, accession number, period, filed date).
 * No LLM involvement — pure TypeScript per SPEC §2.2.
 */

export interface FinancialLineChange {
  metricId: string;
  label: string;
  /** "currency" | "perShare" | "shares" — drives formatting. */
  unitKind: "currency" | "perShare" | "shares";

  current: SelectedFact | null;
  prior: SelectedFact | null;

  /** current − prior, null when either side is unavailable. */
  absoluteChange: number | null;
  /**
   * (current − prior) / |prior| as a decimal, null when unavailable or the
   * prior base is zero (a growth rate against zero is meaningless).
   */
  relativeChange: number | null;
}

interface LineDefinition {
  metricId: string;
  label: string;
  unitKind: FinancialLineChange["unitKind"];
  tags: readonly string[];
  kind: "duration" | "instant";
  units?: readonly string[];
}

/**
 * R1 line items. Tag fallbacks ordered newest-standard-first (concept drift:
 * e.g. revenue moved to RevenueFromContractWithCustomerExcludingAssessedTax
 * under ASC 606).
 */
const LINES: readonly LineDefinition[] = [
  {
    metricId: "revenue",
    label: "Revenue",
    unitKind: "currency",
    kind: "duration",
    tags: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
  },
  {
    metricId: "operatingIncome",
    label: "Operating income",
    unitKind: "currency",
    kind: "duration",
    tags: ["OperatingIncomeLoss"],
  },
  {
    metricId: "netIncome",
    label: "Net income",
    unitKind: "currency",
    kind: "duration",
    tags: ["NetIncomeLoss", "ProfitLoss"],
  },
  {
    metricId: "dilutedEps",
    label: "Diluted EPS",
    unitKind: "perShare",
    kind: "duration",
    tags: ["EarningsPerShareDiluted"],
    units: ["USD/shares"],
  },
  {
    metricId: "operatingCashFlow",
    label: "Operating cash flow",
    unitKind: "currency",
    kind: "duration",
    tags: ["NetCashProvidedByUsedInOperatingActivities"],
  },
  {
    metricId: "stockholdersEquity",
    label: "Stockholders' equity",
    unitKind: "currency",
    kind: "instant",
    tags: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
  },
  {
    metricId: "dilutedShares",
    label: "Diluted shares outstanding",
    unitKind: "shares",
    kind: "duration",
    tags: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    units: ["shares"],
  },
];

function toChange(
  definition: LineDefinition,
  current: SelectedFact | null,
  prior: SelectedFact | null
): FinancialLineChange {
  let absoluteChange: number | null = null;
  let relativeChange: number | null = null;

  if (current !== null && prior !== null) {
    absoluteChange = current.value - prior.value;
    if (prior.value !== 0 && Number.isFinite(absoluteChange)) {
      const relative = absoluteChange / Math.abs(prior.value);
      relativeChange = Number.isFinite(relative) ? relative : null;
    }
  }

  return {
    metricId: definition.metricId,
    label: definition.label,
    unitKind: definition.unitKind,
    current,
    prior,
    absoluteChange,
    relativeChange,
  };
}

/**
 * Build the latest-vs-prior annual change table. Lines whose concept was
 * never reported still appear (with nulls) so the UI can say "not reported"
 * rather than silently omitting them.
 */
export function buildAnnualChanges(
  companyFacts: EdgarCompanyFacts
): FinancialLineChange[] {
  return LINES.map((definition) => {
    const series = selectAnnualSeries(companyFacts, {
      tags: definition.tags,
      kind: definition.kind,
      units: definition.units,
      limit: 2,
    });

    const current = series?.facts[0] ?? null;
    const prior = series?.facts[1] ?? null;
    return toChange(definition, current, prior);
  });
}
