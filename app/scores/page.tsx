"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Flag,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Disclosure } from "@/components/disclosure";
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
import {
  CONFIDENCE_THRESHOLD,
  CRITERIA,
  SESSION,
  TOTAL_ANSWERS,
  criterionLabel,
} from "@/lib/mock";
import type { StudentAnswer } from "@/lib/types";

type SortKey = "confidence" | "score" | "cluster";
type StatusFocusTarget = "accept" | "reviewed";
type StatusChange = (
  id: string,
  status: StudentAnswer["status"],
  container: HTMLDivElement | null,
  target: StatusFocusTarget,
) => void;

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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reviewFocusRequest, setReviewFocusRequest] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const desktopRowsRef = useRef<HTMLTableSectionElement>(null);
  const mobileRowsRef = useRef<HTMLUListElement>(null);
  const statusFocusIntentRef = useRef<{
    container: HTMLDivElement | null;
    target: StatusFocusTarget;
  } | null>(null);

  const clusterOf = useMemo(() => {
    const clusterMap = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    return (id: string | null) => (id ? clusterMap.get(id) : undefined);
  }, [clusters]);

  const rows = useMemo(() => {
    const statusFiltered = onlyUnreviewed
      ? answers.filter((answer) => answer.status === "unreviewed")
      : [...answers];
    const normalizedQuery = query.trim().toLowerCase();
    const list = normalizedQuery
      ? statusFiltered.filter((answer) => {
          const cluster = clusterOf(answer.clusterId);
          const searchableText = [
            answer.studentId,
            answer.initials,
            answer.answer,
            answer.scoreRationale,
            answer.errorSignature ?? "",
            cluster?.label ?? (answer.isCorrect ? "Correct" : ""),
          ];
          return searchableText.some((value) => value.toLowerCase().includes(normalizedQuery));
        })
      : statusFiltered;

    return list.sort((a, b) => {
      if (sort === "confidence") return a.confidence - b.confidence;
      if (sort === "score") return a.provisionalScore - b.provisionalScore;
      return (a.clusterId ?? "zz").localeCompare(b.clusterId ?? "zz");
    });
  }, [answers, clusterOf, onlyUnreviewed, query, sort]);

  const mean =
    answers.reduce((sum, answer) => sum + answer.provisionalScore, 0) /
    Math.max(1, answers.length);
  const passRate =
    (answers.filter((answer) => answer.provisionalScore / answer.maxScore >= 0.4).length /
      Math.max(1, answers.length)) *
    100;
  const remainingCount = TOTAL_ANSWERS - reviewedCount;
  const hasEligibleUnreviewed = answers.some(
    (answer) =>
      answer.status === "unreviewed" && answer.confidence >= CONFIDENCE_THRESHOLD,
  );
  const hasSearchQuery = query.trim().length > 0;

  useEffect(() => {
    if (reviewFocusRequest === 0) return;

    const isDesktop =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)").matches
        : window.innerWidth >= 1024;
    const reviewRows = isDesktop ? desktopRowsRef.current : mobileRowsRef.current;
    const unresolvedRow = reviewRows?.querySelector<HTMLElement>(
      '[data-review-row="unreviewed"]',
    );

    unresolvedRow?.focus();
    unresolvedRow?.scrollIntoView?.({ block: "nearest" });
  }, [reviewFocusRequest]);

  useLayoutEffect(() => {
    const intent = statusFocusIntentRef.current;
    if (!intent) return;
    statusFocusIntentRef.current = null;

    const replacement = intent.container?.isConnected
      ? intent.container.querySelector<HTMLElement>(
          `[data-status-focus="${intent.target}"]`,
        )
      : null;
    (replacement ?? searchRef.current)?.focus();
  }, [answers]);

  const changeStatusWithFocus: StatusChange = (id, status, container, target) => {
    statusFocusIntentRef.current = { container, target };
    setStatus(id, status);
  };

  const shared = {
    clusterOf,
    setScore,
    changeStatusWithFocus,
    open,
    setOpen,
  };

  return (
    <Page
      eyebrow="Step 6 of 7"
      title="Review provisional scores"
      lead="Check low-confidence or flagged responses, then confirm the class for export."
    >
      <Card className="px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 sm:w-44">
            <h2 className="text-[13px] font-semibold text-ink">Review progress</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">Export unlocks at zero remaining</p>
          </div>
          <dl className="grid flex-1 grid-cols-3 gap-3 text-[12px]">
            <ProgressCount label="Reviewed" value={reviewedCount} />
            <ProgressCount label="Remaining" value={remainingCount} />
            <ProgressCount label="Needs attention" value={needsAttention} tone="warn" />
          </dl>
          <div className="sm:w-[min(32%,280px)]">
            <Progress
              value={(reviewedCount / TOTAL_ANSWERS) * 100}
              label="Score review progress"
              tone={exportReady ? "ok" : "brand"}
            />
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="overflow-hidden">
            <div
              role="toolbar"
              aria-label="Score review controls"
              className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5 lg:flex-row lg:items-center"
            >
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search responses"
                  placeholder="Search responses"
                  className="h-8 w-full rounded-[10px] border border-control-border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 hover:border-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-line)] sm:w-52"
                />
                <div className="flex items-center gap-2">
                  <span className="label-caps text-ink-3">Status filter</span>
                  <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={onlyUnreviewed}
                      onChange={(event) => setOnlyUnreviewed(event.target.checked)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                    Only unreviewed
                    <span className="tnum text-ink-3">({remainingCount})</span>
                  </label>
                </div>
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
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button variant="ghost" size="sm" onClick={resetReview}>
                  <RotateCcw size={15} strokeWidth={1.9} aria-hidden />
                  Reset
                </Button>
                {exportReady ? (
                  <Link
                    href="/export"
                    data-variant="primary"
                    className={buttonClass("primary", "sm")}
                  >
                    Continue to export
                    <ArrowRight size={15} strokeWidth={2} aria-hidden />
                  </Link>
                ) : hasEligibleUnreviewed ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => acceptAbove(CONFIDENCE_THRESHOLD)}
                  >
                    <Sparkles size={15} strokeWidth={1.9} aria-hidden />
                    Accept high-confidence
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setOnlyUnreviewed(true);
                      setReviewFocusRequest((request) => request + 1);
                    }}
                  >
                    Review remaining
                  </Button>
                )}
              </div>
            </div>

            <div className="hidden max-h-[70vh] overflow-x-auto overflow-y-auto scroll-thin lg:block">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <caption className="sr-only">Student score review</caption>
                <thead className="sticky top-0 z-10 bg-surface-2 label-caps text-ink-3">
                  <tr className="border-b border-border">
                    <th className="w-[120px] px-4 py-2 font-semibold">Student</th>
                    <th className="min-w-[190px] px-3 py-2 font-semibold">Response</th>
                    <th className="w-[80px] px-3 py-2 font-semibold">Score</th>
                    <th className="w-[104px] px-3 py-2 font-semibold">Criteria</th>
                    <th className="w-[140px] px-3 py-2 font-semibold">Cluster</th>
                    <th className="w-[96px] px-3 py-2 font-semibold">Confidence</th>
                    <th className="w-[96px] px-3 py-2 font-semibold">Status</th>
                    <th className="w-10 px-2 py-2 font-semibold">
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody ref={desktopRowsRef} className="divide-y divide-border">
                  {rows.map((answer) => (
                    <TableRow key={answer.id} a={answer} {...shared} />
                  ))}
                </tbody>
              </table>
            </div>

            <ul ref={mobileRowsRef} className="divide-y divide-border lg:hidden">
              {rows.map((answer) => (
                <MobileRow key={answer.id} a={answer} {...shared} />
              ))}
            </ul>

            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-ink-2">
                {onlyUnreviewed && remainingCount === 0
                  ? "Every row has been reviewed. Clear the filter to see them all."
                  : onlyUnreviewed && hasSearchQuery
                    ? `No unreviewed responses match "${query.trim()}". Try a different search or clear a filter.`
                    : hasSearchQuery
                      ? `No responses match "${query.trim()}". Try a different search or clear it.`
                      : "No responses are available for review."}
              </p>
            ) : null}
          </Card>

          <Disclosure
            title="How confidence is used"
            description="Why some responses need lecturer attention"
          >
            <p>
              Confidence helps prioritise review. It does not replace the lecturer&apos;s
              score decision, and every provisional mark remains editable.
            </p>
          </Disclosure>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[80px]">
          <Card>
            <CardHead title="Class summary" hint="Provisional — updates as you edit" />
            <dl className="flex flex-col gap-2.5 px-5 py-4 text-[13.5px]">
              <SummaryRow label="Mean score" value={`${mean.toFixed(1)} / 10`} />
              <SummaryRow label="Pass rate (≥40%)" value={`${passRate.toFixed(0)}%`} />
              <SummaryRow
                label="Correct answers"
                value={`${answers.filter((answer) => answer.isCorrect).length}`}
              />
              <SummaryRow
                label="Low confidence"
                value={`${answers.filter((answer) => answer.confidence < CONFIDENCE_THRESHOLD).length}`}
              />
            </dl>
          </Card>

          <Card className="border-border bg-surface-2">
            <div className="px-5 py-4 text-[13px] text-ink-2">
              <b className="font-semibold text-ink">Markwise never assigns a final mark.</b> It
              proposes a score against named criteria; you confirm the batch. Nothing is
              submitted anywhere.
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  );
}

type RowProps = {
  a: StudentAnswer;
  clusterOf: (id: string | null) => { label: string; tone: number } | undefined;
  setScore: (id: string, score: number) => void;
  changeStatusWithFocus: StatusChange;
  open: string | null;
  setOpen: (value: string | null) => void;
};

function TableRow({ a, clusterOf, setScore, changeStatusWithFocus, open, setOpen }: RowProps) {
  const low = a.confidence < CONFIDENCE_THRESHOLD;
  const cluster = clusterOf(a.clusterId);
  const expanded = open === a.id;

  return (
    <>
      <tr
        data-review-row={a.status}
        tabIndex={-1}
        aria-label={
          a.status === "unreviewed" ? `Review unresolved response from ${a.initials}` : undefined
        }
        className={cn(
          "h-12 transition-colors",
          low && a.status === "unreviewed" && "bg-warn-soft/45",
          expanded && "bg-surface-2",
        )}
      >
        <td className="px-4 py-1.5">
          <div className="max-w-[120px] truncate font-mono text-[12.5px] text-ink">
            {a.studentId}
          </div>
          <div className="text-[12px] text-ink-3">{a.initials}</div>
        </td>
        <td className="px-3 py-1.5">
          <p className="max-w-[320px] truncate text-[12.5px] text-ink-2" title={a.answer}>
            {a.answer}
          </p>
        </td>
        <td className="px-3 py-1.5 tnum">
          <ScoreInput a={a} setScore={setScore} />
        </td>
        <td className="px-3 py-1.5 tnum">
          <CriteriaMeter a={a} />
        </td>
        <td className="px-3 py-1.5">
          <ClusterCell cluster={cluster} />
        </td>
        <td className="px-3 py-1.5 tnum">
          <ConfidenceMeter value={a.confidence} />
        </td>
        <td className="px-3 py-1.5">
          <StatusCell a={a} changeStatus={changeStatusWithFocus} />
        </td>
        <td className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => setOpen(expanded ? null : a.id)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse answer" : "Expand answer"}
            className="grid h-7 w-7 place-items-center rounded-[10px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ChevronDown
              size={16}
              strokeWidth={2}
              className={cn("transition-transform", expanded && "rotate-180")}
            />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-surface">
          <td colSpan={8} className="p-0">
            <ExpandedPanel a={a} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MobileRow({ a, clusterOf, setScore, changeStatusWithFocus, open, setOpen }: RowProps) {
  const low = a.confidence < CONFIDENCE_THRESHOLD;
  const cluster = clusterOf(a.clusterId);
  const expanded = open === a.id;

  return (
    <li
      data-review-row={a.status}
      tabIndex={-1}
      aria-label={
        a.status === "unreviewed" ? `Review unresolved response from ${a.initials}` : undefined
      }
      className={cn(low && a.status === "unreviewed" && "bg-warn-soft/45")}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-[13px]">{a.studentId}</div>
            <div className="text-[12px] text-ink-3">{a.initials}</div>
          </div>
          <ClusterCell cluster={cluster} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScoreInput a={a} setScore={setScore} />
          <StatusCell a={a} changeStatus={changeStatusWithFocus} />
        </div>

        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-2" title={a.answer}>
          {a.answer}
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <ConfidenceMeter value={a.confidence} />
          <CriteriaMeter a={a} />
        </div>

        <button
          type="button"
          onClick={() => setOpen(expanded ? null : a.id)}
          aria-expanded={expanded}
          className="inline-flex w-fit items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
        >
          {expanded ? "Hide evidence" : "Show evidence"}
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>
      {expanded ? <ExpandedPanel a={a} /> : null}
    </li>
  );
}

function ScoreInput({
  a,
  setScore,
}: {
  a: StudentAnswer;
  setScore: (id: string, score: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        min={0}
        max={a.maxScore}
        value={a.provisionalScore}
        onChange={(event) => setScore(a.id, Number(event.target.value))}
        aria-label={"Score for " + a.initials}
        className="h-8 w-[52px] rounded-[9px] border border-control-border bg-surface text-center text-[14px] font-semibold tnum hover:border-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-line)]"
      />
      <span className="text-[12.5px] text-ink-3 tnum">/{a.maxScore}</span>
    </div>
  );
}

function CriteriaMeter({ a }: { a: StudentAnswer }) {
  const met = a.criteriaMet.length;
  const total = CRITERIA.length;
  const title =
    `Met: ${a.criteriaMet.map(criterionLabel).join(", ") || "none"}\n` +
    `Missed: ${a.criteriaMissed.map(criterionLabel).join(", ") || "none"}`;

  return (
    <span className="flex min-w-0 items-center gap-2" title={title}>
      <span className="flex shrink-0 gap-[3px]" aria-hidden>
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-3.5 w-[9px] rounded-[4px]",
              index < met ? "bg-ok" : "border border-border bg-surface-3",
            )}
          />
        ))}
      </span>
      <span className="shrink-0 text-[12.5px] text-ink-2 tnum">
        {met}/{total}
      </span>
      <span className="sr-only">criteria met</span>
    </span>
  );
}

function ClusterCell({
  cluster,
}: {
  cluster: { label: string; tone: number } | undefined;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {cluster ? (
        <>
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: toneColor(cluster.tone) }}
            aria-hidden
          />
          <span className="truncate text-[12.5px] text-ink-2" title={cluster.label}>
            {cluster.label}
          </span>
        </>
      ) : (
        <Badge tone="ok">Correct</Badge>
      )}
    </div>
  );
}

function StatusCell({
  a,
  changeStatus,
}: {
  a: StudentAnswer;
  changeStatus: StatusChange;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tone = a.status === "flagged" ? "warn" : a.status === "edited" ? "brand" : "ok";

  return (
    <div ref={containerRef} className="flex items-center gap-1">
      {a.status === "unreviewed" ? (
        <>
          <button
            key="accept"
            type="button"
            data-status-focus="accept"
            onClick={() => changeStatus(a.id, "accepted", containerRef.current, "reviewed")}
            className="inline-flex h-7 items-center gap-1 rounded-[9px] border border-border-strong bg-surface px-2 text-[12px] font-medium transition-colors hover:border-brand hover:bg-brand hover:text-on-brand"
          >
            <Check size={13} strokeWidth={2.6} aria-hidden />
            Accept
          </button>
          <button
            key="flag"
            type="button"
            onClick={() => changeStatus(a.id, "flagged", containerRef.current, "reviewed")}
            aria-label="Flag for a second look"
            title="Flag for a second look"
            className="grid h-7 w-7 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-warn-soft hover:text-warn"
          >
            <Flag size={13} strokeWidth={2.2} aria-hidden />
          </button>
        </>
      ) : (
        <button
          key="reviewed"
          type="button"
          data-status-focus="reviewed"
          onClick={() => changeStatus(a.id, "unreviewed", containerRef.current, "accept")}
          title="Undo — set back to unreviewed"
          className="text-left"
        >
          <Badge tone={tone}>
            {a.status === "accepted"
              ? "Accepted"
              : a.status === "edited"
                ? "Edited"
                : "Flagged"}
          </Badge>
        </button>
      )}
    </div>
  );
}

function ExpandedPanel({ a }: { a: StudentAnswer }) {
  return (
    <div className="grid gap-4 border-t border-border bg-surface px-4 pb-5 pt-1 sm:px-5 md:grid-cols-2">
      <div className="pt-4">
        <div className="mb-2 label-caps text-ink-3">The answer</div>
        <p className="rounded-[12px] bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-2">
          {a.answer}
        </p>
        {a.errorSignature ? (
          <p className="mt-2 text-[12.5px] text-ink-2">
            <span className="mr-1.5 label-caps text-ink-3">Signature</span>
            {a.errorSignature}
          </p>
        ) : null}
      </div>

      <div className="pt-4">
        <div className="mb-2 label-caps text-ink-3">
          Marking scheme, criterion by criterion
        </div>
        <ul className="flex flex-col gap-1.5">
          {CRITERIA.map((criterion) => {
            const met = a.criteriaMet.includes(criterion.id);
            return (
              <li
                key={criterion.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] border px-2.5 py-1.5 text-[13px]",
                  met
                    ? "border-ok-line bg-ok-soft text-ink"
                    : "border-border bg-surface-2 text-ink-3",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border",
                    met ? "border-ok bg-ok text-on-ok" : "border-border-strong",
                  )}
                  aria-hidden
                >
                  {met ? <Check size={11} strokeWidth={3.2} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
                  {criterion.label}
                </span>
                <span className="shrink-0 text-[12px] tnum">{criterion.marks}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2.5 text-[12.5px] text-ink-2">
          <span className="mr-1.5 label-caps text-ink-3">Rationale</span>
          {a.scoreRationale}
        </p>
        <p className="mt-2 text-[12px] text-ink-3">
          Scheme: {SESSION.courseCode} · {SESSION.maxScore} marks available
        </p>
      </div>
    </div>
  );
}

function ProgressCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-ink-3">{label}</dt>
      <dd className={cn("mt-0.5 text-[18px] font-semibold text-ink tnum", tone && "text-warn")}>
        {value}
      </dd>
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
