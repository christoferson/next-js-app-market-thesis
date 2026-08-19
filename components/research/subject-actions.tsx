import Link from "next/link";

import { formatDate } from "@/lib/format";
import { getSubjectThesisHealth } from "@/lib/subjects/health";
import { THESIS_STATUS_LABEL } from "@/components/thesis/labels";

/**
 * What a research page lets you do next, and what your own reasoning already
 * says about this company (cross-phase integration, SPEC §25).
 *
 * A server component: thesis health is read from the local store while
 * rendering, so no client fetch and no loading state is involved. It renders
 * whether or not the filing data loaded — the actions do not depend on EDGAR
 * being reachable.
 *
 * The strip reports state, never advice: a contradicted claim is something to
 * review, and nothing here says what to buy or sell.
 */

const ACTION_LINK_CLASS =
  "inline-block rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const STRIP_LINK_CLASS =
  "rounded-sm text-stone-800 underline decoration-stone-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

/** "Checked Mar 3, 2026: 1 contradicted / 2 supported (with your overrides)". */
function checkSummary(lastCheck: {
  checkedAt: string;
  contradictedCount: number;
  supportedCount: number;
  hasOverrides: boolean;
}): string {
  return `Checked ${formatDate(lastCheck.checkedAt)}: ${lastCheck.contradictedCount} contradicted / ${lastCheck.supportedCount} supported${
    lastCheck.hasOverrides ? " (with your overrides)" : ""
  }`;
}

export function SubjectActions({ subjectRef }: { subjectRef: string }) {
  const health = getSubjectThesisHealth(subjectRef);
  const encoded = encodeURIComponent(subjectRef);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/theses/new?subject=${encoded}`} className={ACTION_LINK_CLASS}>
          Write a thesis
        </Link>
        <Link href={`/portfolio?subject=${encoded}`} className={ACTION_LINK_CLASS}>
          Record a transaction
        </Link>
      </div>

      {health.theses.length === 0 ? null : (
        <div className="space-y-1.5 rounded-md border border-stone-200 bg-stone-50 px-4 py-3">
          {health.theses.map((thesis) => (
            <p
              key={thesis.thesisId}
              className="text-sm leading-relaxed text-stone-700"
            >
              <span>Your thesis: </span>
              <Link
                href={`/theses/${thesis.thesisId}`}
                className={STRIP_LINK_CLASS}
              >
                {thesis.title}
              </Link>
              <span>{` — ${THESIS_STATUS_LABEL[thesis.status]}`}</span>
              {thesis.lastCheck === null ? null : (
                <span className="block text-xs text-stone-600">
                  {checkSummary(thesis.lastCheck)}
                  {thesis.lastCheck.contradictedCount > 0 ? " — review" : ""}
                </span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
