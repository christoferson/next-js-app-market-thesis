import Link from "next/link";
import type { Metadata } from "next";

import { formatDate } from "@/lib/format";
import { getThesis, listTheses } from "@/lib/thesis/store";
import { THESIS_STATUS_LABEL } from "@/components/thesis/labels";

/**
 * Thesis list (T1). The store is a local SQLite file read synchronously, so
 * this server component queries it directly instead of calling the app's own
 * HTTP API. Its contents change whenever the user writes a thesis, so the
 * route is rendered on demand rather than prerendered at build time.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Theses — Market Thesis",
  description:
    "Investment theses you have written: the reasoning, its claims, and every revision.",
};

const BADGE_CLASS =
  "rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase";
const PRIMARY_LINK_CLASS =
  "inline-block rounded-sm border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-50 transition-colors motion-reduce:transition-none hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

const STORAGE_NOTE =
  "Stored locally in this application's database — not synced to an account.";

interface ThesisListRow {
  id: string;
  title: string;
  subjectLabel: string;
  status: string;
  currentVersion: number;
  updatedAt: string;
}

/**
 * The list table stores only the current version number, so the title of the
 * current version is read per thesis. The store is a local file and the list is
 * small, so the extra reads cost nothing measurable — and showing the thesis by
 * its own title matters more than avoiding them.
 */
function listRows(): ThesisListRow[] {
  return listTheses().map((thesis) => {
    const withHistory = getThesis(thesis.id);
    const current =
      withHistory?.versions[withHistory.currentVersion - 1] ??
      withHistory?.versions.at(-1) ??
      null;
    return {
      id: thesis.id,
      title: current?.title ?? thesis.subjectLabel,
      subjectLabel: thesis.subjectLabel,
      status: THESIS_STATUS_LABEL[thesis.status],
      currentVersion: thesis.currentVersion,
      updatedAt: thesis.updatedAt,
    };
  });
}

export default function ThesesPage() {
  const rows = listRows();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Theses
        </h1>
        <p className="text-sm text-stone-600">
          Know why you invested — and when the facts change.
        </p>
      </div>

      <p>
        <Link href="/theses/new" className={PRIMARY_LINK_CLASS}>
          New thesis
        </Link>
      </p>

      {rows.length === 0 ? (
        <div className="space-y-3 rounded-md border border-stone-200 bg-white p-6">
          <p className="text-sm leading-relaxed text-stone-700">
            No theses yet. A thesis records why you invested and what would
            change your mind.
          </p>
          <p className="text-sm leading-relaxed text-stone-600">
            Every revision is kept, so you can read later what you originally
            believed.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/theses/${row.id}`}
                className="block space-y-1 rounded-sm px-4 py-3 transition-colors motion-reduce:transition-none hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-stone-900">
                    {row.title}
                  </span>
                  {/* Status is words, not a colour: it reads the same to everyone. */}
                  <span className={BADGE_CLASS}>{row.status}</span>
                </span>
                <span className="block text-sm text-stone-700">
                  {row.subjectLabel}
                </span>
                <span className="block text-xs text-stone-600">
                  {`Version ${row.currentVersion} · updated ${formatDate(row.updatedAt)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-stone-600">{STORAGE_NOTE}</p>
    </div>
  );
}
