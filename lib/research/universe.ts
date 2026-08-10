/**
 * R1 curated research universe: a small, bounded set of real US filers.
 *
 * Research pages show REAL companies' actual SEC filings with citations —
 * unlike Discovery demo market data, which is fictional. The UI must label
 * the difference. CIKs are stable SEC identifiers, zero-padded to 10 digits
 * only at request time.
 */
export interface ResearchCompany {
  /** Stable internal ID for routes: research slug. */
  id: string;
  cik: number;
  ticker: string;
  name: string;
}

export const RESEARCH_UNIVERSE: readonly ResearchCompany[] = [
  { id: "aapl", cik: 320193, ticker: "AAPL", name: "Apple Inc." },
  { id: "msft", cik: 789019, ticker: "MSFT", name: "Microsoft Corporation" },
  { id: "googl", cik: 1652044, ticker: "GOOGL", name: "Alphabet Inc." },
  { id: "amzn", cik: 1018724, ticker: "AMZN", name: "Amazon.com, Inc." },
  { id: "jnj", cik: 200406, ticker: "JNJ", name: "Johnson & Johnson" },
  { id: "pg", cik: 80424, ticker: "PG", name: "The Procter & Gamble Company" },
  { id: "ko", cik: 21344, ticker: "KO", name: "The Coca-Cola Company" },
  { id: "cat", cik: 18230, ticker: "CAT", name: "Caterpillar Inc." },
  { id: "dis", cik: 1744489, ticker: "DIS", name: "The Walt Disney Company" },
  { id: "intc", cik: 50863, ticker: "INTC", name: "Intel Corporation" },
];

export function getResearchCompany(id: string): ResearchCompany | null {
  return RESEARCH_UNIVERSE.find((c) => c.id === id) ?? null;
}

/** CIK padded to the 10 digits EDGAR URLs require. */
export function paddedCik(cik: number): string {
  return String(cik).padStart(10, "0");
}
