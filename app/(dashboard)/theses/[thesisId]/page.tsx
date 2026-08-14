import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatDate } from "@/lib/format";
import { listEvaluationRuns } from "@/lib/contradiction/store";
import { isAnalysisEnabled } from "@/lib/research/analysis/get-client";
import { getThesis, listJournal } from "@/lib/thesis/store";
import type {
  JournalEntry,
  ThesisClaim,
  ThesisVersion,
  ThesisWithHistory,
} from "@/lib/thesis/types";
import { EvidenceCheckSection } from "@/components/thesis/evidence-check-section";
import { ThesisActions } from "@/components/thesis/thesis-actions";
import {
  CLAIM_IMPORTANCE_LABEL,
  CLAIM_KIND_LABEL,
  formatClaimValue,
  JOURNAL_KIND_LABEL,
  THESIS_STATUS_DESCRIPTION,
  THESIS_STATUS_LABEL,
  subjectHref,
} from "@/components/thesis/labels";

/**
 * Thesis detail (T1): the current version, its claims, the append-only journal,
 * and every earlier version exactly as written.
 *
 * The store is a local SQLite file read synchronously, so this server component
 * queries it directly. Its contents change whenever the user writes, so the
 * route is rendered on demand rather than prerendered at build time.
 */
export const dynamic = "force-dynamic";

const SECTION_CLASS = "space-y-3 rounded-md border border-stone-200 bg-white p-5";
const SECTION_HEADING_CLASS = "text-base font-semibold text-stone-900";
const SUB_HEADING_CLASS = "text-sm font-semibold text-stone-800";
const BADGE_CLASS =
  "rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase";
const PROSE_CLASS = "text-sm leading-relaxed whitespace-pre-wrap text-stone-800";
const MUTED_CLASS = "text-sm leading-relaxed text-stone-600";
const LINK_CLASS =
  "rounded-sm text-stone-700 underline decoration-stone-400 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

const TABLE_CLASS = "w-full border-collapse text-sm";
const HEAD_CELL_CLASS =
  "border-b border-stone-300 px-3 py-2 text-left align-bottom text-xs font-medium tracking-wide text-stone-600 uppercase";
const CELL_CLASS = "border-b border-stone-200 px-3 py-2 align-top text-stone-800";
const NUMERIC_CELL_CLASS = `${CELL_CLASS} text-right tabular-nums`;

const CLAIMS_NOTE =
  "Claims are written to be checkable. The Evidence Check below compares them against recent filings.";
const JOURNAL_NOTE =
  "The journal is append-only. Entries cannot be edited or deleted.";
const HISTORY_NOTE = "Earlier versions are preserved exactly as written.";
const BEAR_CASE_MISSING =
  "Not written yet — the strongest argument against is worth recording.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}): Promise<Metadata> {
  const { thesisId } = await params;
  const thesis = getThesis(thesisId);
  if (thesis === null) {
    return { title: "Thesis not found — Market Thesis" };
  }
  return {
    title: `${currentVersion(thesis).title} — Market Thesis`,
    description: `Your investment thesis for ${thesis.subjectLabel}, with its claims, revisions, and journal.`,
  };
}

/**
 * The version the thesis currently stands at. The denormalized counter is the
 * authority; the last row is a fallback so a detail page never renders empty.
 */
function currentVersion(thesis: ThesisWithHistory): ThesisVersion {
  const byNumber = thesis.versions[thesis.currentVersion - 1];
  if (byNumber !== undefined && byNumber.version === thesis.currentVersion) {
    return byNumber;
  }
  const found = thesis.versions.find(
    (version) => version.version === thesis.currentVersion
  );
  if (found !== undefined) return found;

  const last = thesis.versions.at(-1);
  if (last === undefined) {
    // A thesis row always has at least version 1; treat the impossible case as
    // a missing thesis rather than rendering a blank page.
    notFound();
  }
  return last;
}

/* ------------------------------------------------------------------ header */

function ThesisHeader({ thesis }: { thesis: ThesisWithHistory }) {
  const version = currentVersion(thesis);
  const href = subjectHref(thesis.subjectRef);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          {version.title}
        </h1>
        {/* Status is words, not a colour: it reads the same to everyone. */}
        <span className={BADGE_CLASS}>
          {THESIS_STATUS_LABEL[thesis.status]}
        </span>
      </div>

      <p className="text-sm text-stone-700">
        {href === null ? (
          thesis.subjectLabel
        ) : (
          <Link href={href} className={LINK_CLASS}>
            {thesis.subjectLabel}
          </Link>
        )}
      </p>

      <p className="text-xs text-stone-600">
        {`Version ${thesis.currentVersion} · created ${formatDate(thesis.createdAt)} · updated ${formatDate(thesis.updatedAt)}`}
      </p>
      <p className={MUTED_CLASS}>
        {THESIS_STATUS_DESCRIPTION[thesis.status]}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- current version */

function ProseBlock({
  heading,
  text,
  fallback,
}: {
  heading: string;
  text: string | null;
  fallback: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className={SUB_HEADING_CLASS}>{heading}</h3>
      {text === null ? (
        <p className={MUTED_CLASS}>{fallback}</p>
      ) : (
        <p className={PROSE_CLASS}>{text}</p>
      )}
    </div>
  );
}

function ReasoningSection({ version }: { version: ThesisVersion }) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>Current thinking</h2>

      <ProseBlock
        heading="Why it's attractive"
        text={version.summary}
        fallback="Not written yet."
      />
      <ProseBlock
        heading="What the market may be underestimating"
        text={version.edge}
        fallback="Not written yet."
      />
      <ProseBlock
        heading="Strongest argument against"
        text={version.bearCase}
        fallback={BEAR_CASE_MISSING}
      />
      <ProseBlock
        heading="Time horizon"
        text={version.timeHorizon}
        fallback="Not recorded."
      />
    </section>
  );
}

/* ------------------------------------------------------------------- claims */

function ClaimRow({ claim }: { claim: ThesisClaim }) {
  return (
    <tr>
      <th scope="row" className={`${CELL_CLASS} text-left font-normal`}>
        <span className="font-medium text-stone-900">{claim.statement}</span>
        {claim.metricDescription === null ? null : (
          <span className="block text-[11px] text-stone-600">
            {claim.metricDescription}
          </span>
        )}
      </th>
      <td className={CELL_CLASS}>{CLAIM_KIND_LABEL[claim.kind]}</td>
      <td className={NUMERIC_CELL_CLASS}>
        {`${formatClaimValue(claim.baselineValue)} → ${formatClaimValue(claim.targetValue)}`}
      </td>
      <td className={NUMERIC_CELL_CLASS}>
        {formatClaimValue(claim.invalidationValue)}
      </td>
      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {formatDate(claim.deadline)}
      </td>
      <td className={CELL_CLASS}>{CLAIM_IMPORTANCE_LABEL[claim.importance]}</td>
    </tr>
  );
}

function ClaimsSection({ version }: { version: ThesisVersion }) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>Claims</h2>

      {version.claims.length === 0 ? (
        <p className={MUTED_CLASS}>This version records no claims.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLE_CLASS}>
            <caption className="sr-only">
              The claims in the current version of this thesis, with the values
              they were written against. A value that was not quantified shows an
              em dash and is never treated as zero.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={HEAD_CELL_CLASS}>
                  Claim
                </th>
                <th scope="col" className={HEAD_CELL_CLASS}>
                  Kind
                </th>
                <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                  Baseline → target
                </th>
                <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                  Invalidated at
                </th>
                <th scope="col" className={HEAD_CELL_CLASS}>
                  Deadline
                </th>
                <th scope="col" className={HEAD_CELL_CLASS}>
                  Importance
                </th>
              </tr>
            </thead>
            <tbody>
              {version.claims.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-stone-600">{CLAIMS_NOTE}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ journal */

function JournalSection({ entries }: { entries: readonly JournalEntry[] }) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={SECTION_HEADING_CLASS}>Journal</h2>

      {entries.length === 0 ? (
        <p className={MUTED_CLASS}>No journal entries yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="space-y-1 border-l-2 border-stone-200 pl-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={BADGE_CLASS}>
                  {JOURNAL_KIND_LABEL[entry.kind]}
                </span>
                <span className="text-xs text-stone-600">
                  {formatDate(entry.createdAt)}
                </span>
                {entry.version === null ? null : (
                  <span className="text-xs text-stone-600">
                    {`Version ${entry.version}`}
                  </span>
                )}
              </div>
              <p className={PROSE_CLASS}>{entry.text}</p>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs leading-relaxed text-stone-600">{JOURNAL_NOTE}</p>
    </section>
  );
}

/* ---------------------------------------------------------------- history */

function VersionDetails({
  version,
  isCurrent,
}: {
  version: ThesisVersion;
  isCurrent: boolean;
}) {
  return (
    <details className="rounded-md border border-stone-200 bg-white">
      <summary className="cursor-pointer rounded-sm px-4 py-3 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500">
        <span className="font-semibold text-stone-900">{`v${version.version}`}</span>
        <span className="ml-2">{version.title}</span>
        <span className="ml-2 text-xs text-stone-600">
          {`written ${formatDate(version.createdAt)}${isCurrent ? " · current" : ""}`}
        </span>
      </summary>

      <div className="space-y-3 border-t border-stone-200 px-4 py-3">
        <div className="space-y-1">
          <p className={SUB_HEADING_CLASS}>Why it&apos;s attractive</p>
          <p className={PROSE_CLASS}>{version.summary}</p>
        </div>

        <div className="space-y-1">
          <p className={SUB_HEADING_CLASS}>
            What the market may be underestimating
          </p>
          {version.edge === null ? (
            <p className={MUTED_CLASS}>Not written in this version.</p>
          ) : (
            <p className={PROSE_CLASS}>{version.edge}</p>
          )}
        </div>

        <div className="space-y-1">
          <p className={SUB_HEADING_CLASS}>Strongest argument against</p>
          {version.bearCase === null ? (
            <p className={MUTED_CLASS}>Not written in this version.</p>
          ) : (
            <p className={PROSE_CLASS}>{version.bearCase}</p>
          )}
        </div>

        <div className="space-y-1">
          <p className={SUB_HEADING_CLASS}>Time horizon</p>
          {version.timeHorizon === null ? (
            <p className={MUTED_CLASS}>Not recorded in this version.</p>
          ) : (
            <p className={PROSE_CLASS}>{version.timeHorizon}</p>
          )}
        </div>

        <div className="space-y-1">
          <p className={SUB_HEADING_CLASS}>Claims in this version</p>
          {version.claims.length === 0 ? (
            <p className={MUTED_CLASS}>None recorded.</p>
          ) : (
            <ul className="space-y-2">
              {version.claims.map((claim) => (
                <li key={claim.id} className="space-y-0.5">
                  <p className={PROSE_CLASS}>{claim.statement}</p>
                  <p className="text-[11px] text-stone-600">
                    {`${CLAIM_KIND_LABEL[claim.kind]} · ${CLAIM_IMPORTANCE_LABEL[claim.importance]} · baseline ${formatClaimValue(claim.baselineValue)} → target ${formatClaimValue(claim.targetValue)} · invalidated at ${formatClaimValue(claim.invalidationValue)} · deadline ${formatDate(claim.deadline)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}

function HistorySection({ thesis }: { thesis: ThesisWithHistory }) {
  return (
    <section className="space-y-3">
      <h2 className={SECTION_HEADING_CLASS}>Revision history</h2>
      <p className="text-sm text-stone-600">{HISTORY_NOTE}</p>

      <div className="space-y-2">
        {thesis.versions.map((version) => (
          <VersionDetails
            key={version.version}
            version={version}
            isCurrent={version.version === thesis.currentVersion}
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- route */

export default async function ThesisDetailPage({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}) {
  const { thesisId } = await params;

  const thesis = getThesis(thesisId);
  if (thesis === null) {
    notFound();
  }

  const version = currentVersion(thesis);
  const journal = listJournal(thesis.id);
  const evaluationRuns = listEvaluationRuns(thesis.id);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/theses"
        className="inline-block rounded-sm text-sm text-stone-600 transition-colors motion-reduce:transition-none hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        ← Back to Theses
      </Link>

      <ThesisHeader thesis={thesis} />
      <ReasoningSection version={version} />
      <ClaimsSection version={version} />
      {/*
        Evidence follows the claims it is checked against; the journal stays the
        closing record, and it gains its own entry whenever a check is run.
      */}
      <EvidenceCheckSection
        thesisId={thesis.id}
        initialRuns={evaluationRuns}
        analysisEnabled={isAnalysisEnabled()}
      />
      <ThesisActions thesisId={thesis.id} status={thesis.status} />
      <JournalSection entries={journal} />
      <HistorySection thesis={thesis} />

      <p className="text-xs leading-relaxed text-stone-600">
        A thesis is your own reasoning, recorded so it can be checked later. It
        is not a recommendation, and it is stored locally in this
        application&apos;s database.
      </p>
    </div>
  );
}
