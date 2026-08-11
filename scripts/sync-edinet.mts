/**
 * EDINET filing sync (R3). Walks EDINET's date-indexed API and stores
 * annual/semiannual reports for the curated Japanese universe locally.
 *
 * Usage (the react-server condition satisfies the server-only guards):
 *   node --conditions=react-server --import tsx scripts/sync-edinet.mts 2025-06-01 2025-07-15
 *   node --conditions=react-server --import tsx scripts/sync-edinet.mts --resume 2026-08-10
 *
 * Requires EDINET_API_KEY in .env.local. Makes one EDINET request per
 * calendar date plus one download per matching filing; a two-year range is
 * ~730 list requests (throttled to ~1.4/s → roughly 9 minutes).
 */
import "./load-env.mts";

const { syncRange, getSyncCursor } = await import(
  "../lib/research/edinet/sync"
);
const { countFilings, closeStore } = await import(
  "../lib/research/edinet/store"
);

const args = process.argv.slice(2);
let fromDate: string;
let toDate: string;

if (args[0] === "--resume") {
  const cursor = getSyncCursor();
  if (cursor.lastSyncedDate === null) {
    console.error("No previous sync to resume. Provide a start date.");
    process.exit(1);
  }
  const next = new Date(`${cursor.lastSyncedDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  fromDate = next.toISOString().slice(0, 10);
  toDate = args[1] ?? new Date().toISOString().slice(0, 10);
} else {
  fromDate = args[0] ?? "";
  toDate = args[1] ?? "";
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
  console.error("Usage: npx tsx scripts/sync-edinet.ts <from> <to> | --resume [to]");
  process.exit(1);
}

console.log(`Syncing EDINET filings ${fromDate} → ${toDate}`);
const started = Date.now();

const result = await syncRange(fromDate, toDate, (p) => {
  if (p.relevant > 0 || p.date.endsWith("-01")) {
    console.log(
      `${p.date}: ${p.listed} filings listed, ${p.relevant} relevant, ${p.stored} stored`
    );
  }
});

console.log(
  `Done in ${Math.round((Date.now() - started) / 1000)}s — ` +
    `${result.datesProcessed} dates, ${result.filingsStored} filings stored, ` +
    `${countFilings()} total in store.`
);
closeStore();
