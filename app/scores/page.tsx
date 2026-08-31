"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Flag,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Page } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfidenceMeter,
  Progress,
  Segmented,
  buttonClass,
  cn,
  toneColor,
} from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { CONFIDENCE_THRESHOLD, CRITERIA, SESSION, TOTAL_ANSWERS, criterionLabel } from "@/lib/mock";
import type { StudentAnswer } from "@/lib/types";

type SortKey = "confidence" | "score" | "cluster";

/** Shared by the header and every row so the columns can never drift apart.
 *  The criteria column has a floor rather than a bare 1fr — without it the
 *  column collapses at narrow widths and its chips get clipped to nothing. */
const GRID_COLS = "120px 78px 104px minmax(130px,1fr) 88px 88px 22px";

export default function ScoresPage() {
  const {
    answers,
    clusters,
    setScore,
    setStatus,
    acceptAbove,
    resetReview,
    reviewedCount,
    needsAttention,
    exportReady,
  } = useSession();

  const [sort, setSort] = useState<SortKey>("confidence");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const clusterOf = useMemo(() => {
    const m = new Map(clusters.map((c) => [c.id, c]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [clusters]);

  const rows = useMemo(() => {
    const list = onlyUnreviewed
      ? answers.filter((a) => a.status === "unreviewed")
      : [...answers];
    return list.sort((a, b) => {
      if (sort === "confidence") return a.confidence - b.confidence;
      if (sort === "score") return a.provisionalScore - b.provisionalScore;
      return (a.clusterId ?? "zz").localeCompare(b.clusterId ?? "zz");
    });
  }, [answers, sort, onlyUnreviewed]);

  const mean =
    answers.reduce((s, a) => s + a.provisionalScore, 0) / Math.max(1, answers.length);
  const passRate =
    (answers.filter((a) => a.provisionalScore / a.maxScore >= 0.4).length / Math.max(1, answers.length)) *
    100;

  const shared = {
    clusterOf,
    setScore,
    setStatus,
    open,
    setOpen,
  };

  return (
    <Page
      eyebrow="Step 6 of 7"
      title="Score review"
      lead="Every score here is provisional and every one is editable. Rows are sorted by confidence, so the answers most likely to be wrong sit at the top and get looked at first."
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={resetReview}>
            <RotateCcw size={15} strokeWidth={1.9} aria-hidden />
            Reset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => acceptAbove(CONFIDENCE_THRESHOLD)}
            disabled={reviewedCount === TOTAL_ANSWERS}
          >
            <Sparkles size={15} strokeWidth={1.9} aria-hidden />
            Accept all above {Math.round(CONFIDENCE_THRESHOLD * 100)}%
          </Button>
        </>
      }
      aside={
        <>
          <Card>
            <CardHead title="Review progress" hint="Export unlocks at zero remaining" />
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-display text-[22px] font-semibold tnum">
                    {reviewedCount}
                    <span className="text-ink-3 font-normal text-[15px]"> of {TOTAL_ANSWERS}</span>
                  </span>
                  <span className="text-[13px] text-ink-2">reviewed</span>
                </div>
                <Progress
                  value={(reviewedCount / TOTAL_ANSWERS) * 100}
                  tone={exportReady ? "ok" : "brand"}
                />
              </div>

              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 border text-[13.5px]",
                  needsAttention > 0
                    ? "bg-warn-soft border-warn-line text-warn"
                    : "bg-ok-soft border-ok-line text-ok",
                )}
              >
                {needsAttention > 0 ? (
                  <TriangleAlert size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                ) : (
                  <Check size={16} strokeWidth={2.4} className="shrink-0" aria-hidden />
                )}
                <span className="font-medium">
                  {needsAttention > 0
                    ? `${needsAttention} need your attention`
                    : "Nothing flagged for review"}
                </span>
              </div>

              <Link
                href="/export"
                aria-disabled={!exportReady}
                onClick={(e) => {
                  if (!exportReady) e.preventDefault();
                }}
                className={buttonClass(
                  "primary",
                  "md",
                  cn("w-full", !exportReady && "opacity-45 pointer-events-none"),
                )}
              >
                Continue to export
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
              {!exportReady ? (
                <p className="text-[12.5px] text-ink-3 text-center -mt-1">
                  {TOTAL_ANSWERS - reviewedCount} row
                  {TOTAL_ANSWERS - reviewedCount === 1 ? "" : "s"} still unreviewed.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHead title="Class summary" hint="Provisional — updates as you edit" />
            <dl className="px-5 py-4 flex flex-col gap-2.5 text-[13.5px]">
              <SummaryRow label="Mean score" value={`${mean.toFixed(1)} / 10`} />
              <SummaryRow label="Pass rate (≥40%)" value={`${passRate.toFixed(0)}%`} />
              <SummaryRow
                label="Correct answers"
                value={`${answers.filter((a) => a.isCorrect).length}`}
              />
              <SummaryRow
                label="Low confidence"
                value={`${answers.filter((a) => a.confidence < CONFIDENCE_THRESHOLD).length}`}
              />
            </dl>
          </Card>

          <Card className="bg-surface-2 border-border">
            <div className="px-5 py-4 text-[13px] text-ink-2">
              <b className="text-ink font-semibold">Markwise never assigns a final mark.</b> It
              proposes a score against named criteria; you confirm the batch. Nothing is
              submitted anywhere.
            </div>
          </Card>
        </>
      }
    >
      <Card className="overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border flex flex-wrap items-center gap-3 justify-between">
          <Segmented<SortKey>
            label="Sort rows"
            value={sort}
            onChange={setSort}
            options={[
              { value: "confidence", label: "Confidence" },
              { value: "score", label: "Score" },
              { value: "cluster", label: "Cluster" },
            ]}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyUnreviewed}
              onChange={(e) => setOnlyUnreviewed(e.target.checked)}
              className="accent-[var(--brand)] w-4 h-4"
            />
            Only unreviewed
            <span className="tnum text-ink-3">
              ({TOTAL_ANSWERS - reviewedCount})
            </span>
          </label>
        </div>

        {/* ---------- Desktop table ---------- */}
        <div className="hidden lg:block overflow-x-auto scroll-thin">
          <div className="min-w-[712px]">
            <div
              className="grid items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2 label-caps text-ink-3"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <span>Student</span>
              <span>Score</span>
              <span>Criteria</span>
              <span>Cluster</span>
              <span>Confidence</span>
              <span>Status</span>
              <span className="sr-only">Expand</span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((a) => (
                <TableRow key={a.id} a={a} {...shared} />
              ))}
            </ul>
          </div>
        </div>

        {/* ---------- Mobile cards ---------- */}
        <ul className="lg:hidden divide-y divide-border">
          {rows.map((a) => (
            <MobileRow key={a.id} a={a} {...shared} />
          ))}
        </ul>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-ink-2">
            Every row has been reviewed. Clear the filter to see them all.
          </p>
        ) : null}
      </Card>
    </Page>
  );
}

/* ------------------------------------------------------------------ */

type RowProps = {
  a: StudentAnswer;
  clusterOf: (id: string | null) => { label: string; tone: number } | undefined;
  setScore: (id: string, n: number) => void;
  setStatus: (id: string, s: StudentAnswer["status"]) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
};

function TableRow({ a, clusterOf, setScore, setStatus, open, setOpen }: RowProps) {
  const low = a.confidence < CONFIDENCE_THRESHOLD;
  const cluster = clusterOf(a.clusterId);
  const expanded = open === a.id;

  return (
    <li
      className={cn(
        "transition-colors",
        low && a.status === "unreviewed" && "bg-warn-soft/45",
        expanded && "bg-surface-2",
      )}
    >
      <div
        className="grid items-center gap-2 px-4 py-2.5"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div className="min-w-0">
          <div className="font-mono text-[12.5px] text-ink truncate">{a.studentId}</div>
          <div className="text-[12px] text-ink-3">{a.initials}</div>
        </div>

        <ScoreInput a={a} setScore={setScore} />

        <CriteriaMeter a={a} />

        <div className="min-w-0 flex items-center gap-2">
          {cluster ? (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: toneColor(cluster.tone) }}
                aria-hidden
              />
              <span className="text-[12.5px] text-ink-2 truncate" title={cluster.label}>
                {cluster.label}
              </span>
            </>
          ) : (
            <Badge tone="ok">Correct</Badge>
          )}
        </div>

        <ConfidenceMeter value={a.confidence} />

        <StatusCell a={a} setStatus={setStatus} />

        <button
          onClick={() => setOpen(expanded ? null : a.id)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse answer" : "Expand answer"}
          className="grid place-items-center w-7 h-7 rounded-[10px] text-ink-3 hover:bg-surface-3 hover:text-ink transition-colors"
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded ? <ExpandedPanel a={a} /> : null}
    </li>
  );
}

function MobileRow({ a, clusterOf, setScore, setStatus, open, setOpen }: RowProps) {
  const low = a.confidence < CONFIDENCE_THRESHOLD;
  const cluster = clusterOf(a.clusterId);
  const expanded = open === a.id;

  return (
    <li className={cn(low && a.status === "unreviewed" && "bg-warn-soft/45")}>
      <div className="px-4 py-3.5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[13px] truncate">{a.studentId}</div>
            <div className="text-[12px] text-ink-3">{a.initials}</div>
          </div>
          <ScoreInput a={a} setScore={setScore} />
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {cluster ? (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: toneColor(cluster.tone) }}
                aria-hidden
              />
              <span className="text-[12.5px] text-ink-2 truncate">{cluster.label}</span>
            </>
          ) : (
            <Badge tone="ok">Correct</Badge>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <ConfidenceMeter value={a.confidence} />
          <CriteriaMeter a={a} />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <StatusCell a={a} setStatus={setStatus} />
            <button
              onClick={() => setOpen(expanded ? null : a.id)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
            >
              {expanded ? "Hide" : "Details"}
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={cn("transition-transform", expanded && "rotate-180")}
              />
            </button>
          </div>
        </div>
      </div>
      {expanded ? <ExpandedPanel a={a} /> : null}
    </li>
  );
}

function ScoreInput({ a, setScore }: { a: StudentAnswer; setScore: (id: string, n: number) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <input
        type="number"
        min={0}
        max={a.maxScore}
        value={a.provisionalScore}
        onChange={(e) => setScore(a.id, Number(e.target.value))}
        aria-label={`Score for ${a.studentId}, out of ${a.maxScore}`}
        className="w-[52px] h-8 text-center tnum text-[14px] font-semibold bg-surface border border-border rounded-[9px] hover:border-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-line)]"
      />
      <span className="text-[12.5px] text-ink-3 tnum">/{a.maxScore}</span>
    </div>
  );
}

/** One segment per criterion, filled where it was awarded. A truncated chip
 *  list ("Reactance term i…") tells the lecturer nothing at this width; a
 *  filled-out-of-total bar is readable in a glance and the full wording is one
 *  row-expand away. */
function CriteriaMeter({ a }: { a: StudentAnswer }) {
  const met = a.criteriaMet.length;
  const total = CRITERIA.length;
  const title =
    `Met: ${a.criteriaMet.map(criterionLabel).join(", ") || "none"}\n` +
    `Missed: ${a.criteriaMissed.map(criterionLabel).join(", ") || "none"}`;

  return (
    <span className="flex items-center gap-2 min-w-0" title={title}>
      <span className="flex gap-[3px] shrink-0" aria-hidden>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "w-[9px] h-3.5 rounded-[4px]",
              i < met ? "bg-ok" : "bg-surface-3 border border-border",
            )}
          />
        ))}
      </span>
      <span className="tnum text-[12.5px] text-ink-2 shrink-0">
        {met}/{total}
      </span>
      <span className="sr-only">criteria met</span>
    </span>
  );
}

function StatusCell({
  a,
  setStatus,
}: {
  a: StudentAnswer;
  setStatus: (id: string, s: StudentAnswer["status"]) => void;
}) {
  if (a.status === "unreviewed") {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => setStatus(a.id, "accepted")}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-[9px] border border-border-strong bg-surface text-[12px] font-medium hover:bg-brand hover:text-on-brand hover:border-brand transition-colors"
        >
          <Check size={13} strokeWidth={2.6} aria-hidden />
          Accept
        </button>
        <button
          onClick={() => setStatus(a.id, "flagged")}
          aria-label="Flag for a second look"
          title="Flag for a second look"
          className="grid place-items-center w-7 h-7 rounded-[9px] text-ink-3 hover:text-warn hover:bg-warn-soft transition-colors"
        >
          <Flag size={13} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  const tone = a.status === "flagged" ? "warn" : a.status === "edited" ? "brand" : "ok";
  return (
    <button
      onClick={() => setStatus(a.id, "unreviewed")}
      title="Undo — set back to unreviewed"
      className="text-left"
    >
      <Badge tone={tone}>
        {a.status === "accepted" ? "Accepted" : a.status === "edited" ? "Edited" : "Flagged"}
      </Badge>
    </button>
  );
}

function ExpandedPanel({ a }: { a: StudentAnswer }) {
  return (
    <div className="px-4 sm:px-5 pb-5 pt-1 grid gap-4 md:grid-cols-2 border-t border-border bg-surface">
      <div className="pt-4">
        <div className="label-caps text-ink-3 mb-2">The answer</div>
        <p className="text-[13.5px] leading-relaxed text-ink-2 bg-surface-2 rounded-[12px] px-3.5 py-3">
          {a.answer}
        </p>
        {a.errorSignature ? (
          <p className="text-[12.5px] text-ink-2 mt-2">
            <span className="label-caps text-ink-3 mr-1.5">Signature</span>
            {a.errorSignature}
          </p>
        ) : null}
      </div>

      <div className="pt-4">
        <div className="label-caps text-ink-3 mb-2">Marking scheme, criterion by criterion</div>
        <ul className="flex flex-col gap-1.5">
          {CRITERIA.map((c) => {
            const met = a.criteriaMet.includes(c.id);
            return (
              <li
                key={c.id}
                className={cn(
                  "flex items-center gap-2.5 text-[13px] rounded-[10px] px-2.5 py-1.5 border",
                  met
                    ? "border-ok-line bg-ok-soft text-ink"
                    : "border-border bg-surface-2 text-ink-3",
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center w-4 h-4 rounded-[5px] shrink-0 border",
                    met ? "bg-ok border-ok text-white" : "border-border-strong",
                  )}
                  aria-hidden
                >
                  {met ? <Check size={11} strokeWidth={3.2} /> : null}
                </span>
                <span className="flex-1 min-w-0 truncate">{c.label}</span>
                <span className="tnum text-[12px] shrink-0">{c.marks}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-[12.5px] text-ink-2 mt-2.5">
          <span className="label-caps text-ink-3 mr-1.5">Rationale</span>
          {a.scoreRationale}
        </p>
        <p className="text-[12px] text-ink-3 mt-2">
          Scheme: {SESSION.courseCode} · {SESSION.maxScore} marks available
        </p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-semibold tnum">{value}</dd>
    </div>
  );
}
