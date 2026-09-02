"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileText,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Page } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Input,
  Progress,
  buttonClass,
  cn,
} from "@/components/ui";
import { AccountLink } from "@/components/account-link";
import { useSession } from "@/components/session-provider";
import {
  buildRows,
  classStats,
  downloadDocx,
  downloadXlsx,
  provenanceLine,
} from "@/lib/export";

type Format = "xlsx" | "docx";

export default function ExportPage() {
  const {
    answers,
    clusters,
    reviewedCount,
    needsAttention,
    exportReady,
    confirmed,
    setConfirmed,
    confirmedBy,
    setConfirmedBy,
    totalAnswers,
    context,
    courseCode,
    courseTitle,
    sessionId,
  } = useSession();

  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmationControlsRef = useRef<HTMLDivElement>(null);
  const confirmationFocusIntentRef = useRef<"confirm" | "reopen" | null>(null);

  useLayoutEffect(() => {
    const focusIntent = confirmationFocusIntentRef.current;
    if (!focusIntent) return;

    confirmationFocusIntentRef.current = null;
    confirmationControlsRef.current
      ?.querySelector<HTMLElement>(`[data-confirmation-focus="${focusIntent}"]`)
      ?.focus();
  }, [confirmed]);

  function updateConfirmation(nextConfirmed: boolean) {
    confirmationFocusIntentRef.current = nextConfirmed ? "reopen" : "confirm";
    setConfirmed(nextConfirmed);

    // The provenance footer claims the batch was confirmed by a named person
    // on a date, so a saved run records who and when — the claim has to be
    // backed by something more durable than this tab.
    if (nextConfirmed && sessionId) {
      void import("@/app/actions")
        .then((actions) =>
          actions.confirmBatchAction({ sessionId, confirmedBy }),
        )
        .catch(() => {
          // The export itself is unaffected; it carries the footer regardless.
        });
    }
  }

  const rows = useMemo(() => buildRows(answers, clusters), [answers, clusters]);
  const stats = useMemo(() => classStats(rows), [rows]);

  const topMisconceptions = useMemo(
    () =>
      clusters
        .filter((c) => !c.isOther && c.memberIds.length > 0)
        .sort((a, b) => b.memberIds.length - a.memberIds.length)
        .map((c) => ({
          label: c.label,
          count: c.memberIds.length,
          pct: (c.memberIds.length / totalAnswers) * 100,
        })),
    [clusters, totalAnswers],
  );

  async function runExport() {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      if (format === "xlsx") {
        await downloadXlsx(rows, stats, {
          courseCode,
          question: context.question,
          lecturer: confirmedBy,
        });
      } else {
        await downloadDocx(rows, stats, {
          courseCode,
          courseTitle,
          question: context.question,
          lecturer: confirmedBy,
          topMisconceptions,
        });
      }
    } catch {
      setError("The file couldn't be generated. Try the other format, or reload the page.");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------- Gated state ------------------------- */
  if (!exportReady) {
    return (
      <Page
        eyebrow="Step 7 of 7"
        title="Export is locked"
        lead="Nothing leaves this session while a score is still unreviewed. That gate is the whole basis of the claim that a person, not the model, assigned these marks."
      >
        <Card className="border-warn-line bg-warn-soft">
          <div className="px-5 sm:px-8 py-7 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={17} strokeWidth={2} className="text-warn" aria-hidden />
                <span className="label-caps text-warn">Blocked</span>
              </div>
              <h2 className="font-display text-[22px] font-semibold">
                {totalAnswers - reviewedCount} of {totalAnswers} rows still need you
              </h2>
              <p className="text-[14px] text-ink-2 mt-1.5 max-w-[60ch]">
                {needsAttention > 0
                  ? `${needsAttention} of them scored below the confidence threshold and are flagged for a mandatory look.`
                  : "The rest are high-confidence — accepting them in bulk takes one click."}
              </p>
              <div className="mt-4 max-w-sm">
                <Progress
                  value={(reviewedCount / totalAnswers) * 100}
                  tone="warn"
                  label="Score review progress"
                />
              </div>
            </div>
            <Link href="/scores" className={buttonClass("primary", "lg", "shrink-0")}>
              Go to score review
              <ArrowRight size={17} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </Card>

        <Card>
          <CardHead title="What the export will contain" hint="Once the gate opens" />
          <ul className="px-5 py-4 grid gap-2.5 sm:grid-cols-2 text-[13.5px] text-ink-2">
            {[
              "Student ID and initials",
              "Score, max, and percentage",
              "The misconception cluster they fell into",
              "The criteria they missed, named",
              "Review status per row",
              "Class summary: mean, median, pass rate, distribution",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check size={15} strokeWidth={2.2} className="text-ink-3 shrink-0 mt-0.5" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </Page>
    );
  }

  /* ------------------------- Ready state ------------------------- */
  return (
    <Page
      eyebrow="Step 7 of 7"
      title="Export reviewed results"
      lead="Confirm the reviewer, choose a format, and download the reviewed sample."
    >
      <Card className="border-ok-line bg-ok-soft">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck size={19} strokeWidth={2} className="mt-0.5 shrink-0 text-ok" aria-hidden />
            <div>
              <h2 className="font-display text-[16px] font-bold">Review complete</h2>
              <p className="mt-1 text-[13px] text-ink-2">
                All {totalAnswers} rows have a lecturer-reviewed score and are ready to export.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-[12.5px] sm:grid-cols-4">
            <SummaryRow label="Students" value={`${rows.length}`} />
            <SummaryRow label="Mean" value={`${stats.mean.toFixed(1)} / 10`} />
            <SummaryRow label="Median" value={`${stats.median}`} />
            <SummaryRow label="Pass rate" value={`${stats.passRate.toFixed(0)}%`} />
          </dl>
        </div>
      </Card>

      <Card className={cn(confirmed ? "border-ok-line" : "border-brand-line")}>
        <CardHead
          title="Lecturer confirmation"
          hint="Your name is written into the provenance line in both files"
          action={confirmed ? <Badge tone="ok">Confirmed</Badge> : null}
        />
        <div ref={confirmationControlsRef} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          <label htmlFor="lecturer" className="text-[13px] font-bold">
            Confirmed by
          </label>
          <Input
            id="lecturer"
            value={confirmedBy}
            onChange={(e) => setConfirmedBy(e.target.value)}
            disabled={confirmed}
            placeholder="Your name as it should appear"
          />
          <p className="text-[13px] italic text-ink-2">
            {provenanceLine(confirmedBy.trim() || "[your name]")}
          </p>
          {confirmed ? (
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[13.5px] font-medium text-ok">
                <ShieldCheck size={16} strokeWidth={2} aria-hidden />
                All {totalAnswers} rows reviewed and confirmed
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateConfirmation(false)}
                data-confirmation-focus="reopen"
              >
                Reopen for edits
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              onClick={() => updateConfirmation(true)}
              disabled={!confirmedBy.trim()}
              className="self-start"
              data-confirmation-focus="confirm"
            >
              <Check size={17} strokeWidth={2.2} aria-hidden />
              Confirm reviewer
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Choose a format" hint="You can return and export the other format later" />
        <div
          role="radiogroup"
          aria-label="Export format"
          className="grid gap-3 px-5 py-5 sm:grid-cols-2"
        >
          <FormatCard
            active={format === "xlsx"}
            onSelect={() => setFormat("xlsx")}
            icon={<FileSpreadsheet size={20} strokeWidth={1.8} aria-hidden />}
            title=".xlsx"
            sub="The working format"
            body="Eight columns plus a class summary block. Opens in Excel, Sheets, or LibreOffice — the file you hand to the registry."
          />
          <FormatCard
            active={format === "docx"}
            onSelect={() => setFormat("docx")}
            icon={<FileText size={20} strokeWidth={1.8} aria-hidden />}
            title=".docx"
            sub="The printable record"
            body="A formatted table with an auto-written summary paragraph naming the top misconceptions and the reteach recommendation."
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHead
          title="Preview"
          hint={`First 6 of ${rows.length} reviewed rows shown here`}
          action={<Badge tone="brand">.{format}</Badge>}
        />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-ink-3">
                {["Student ID", "Initials", "Score", "%", "Misconception", "Criteria missed", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-left font-medium label-caps px-3 py-2 whitespace-nowrap border-b border-border"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r) => (
                <tr key={r.studentId} className="border-b border-border">
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{r.studentId}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.initials}</td>
                  <td className="px-3 py-2 tnum whitespace-nowrap">
                    {r.score}/{r.max}
                  </td>
                  <td className="px-3 py-2 tnum whitespace-nowrap">{r.percentage}</td>
                  <td className="px-3 py-2 text-ink-2 max-w-[280px] truncate" title={r.misconception}>
                    {r.misconception}
                  </td>
                  <td className="px-3 py-2 text-ink-2 max-w-[220px] truncate" title={r.criteriaMissed}>
                    {r.criteriaMissed || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge tone={r.status === "Flagged" ? "warn" : "ok"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-2">
                <td colSpan={7} className="px-3 py-2 text-[12.5px] text-ink-3">
                  …and {Math.max(0, rows.length - 6)} more rows, then the class summary block.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-border bg-surface-2">
        <div className="px-5 py-4 sm:px-6">
          <p className="label-caps mb-2 text-ink-3">Optional account</p>
          <AccountLink />
        </div>
      </Card>

      {confirmed ? (
        <Card className="border-brand-line">
          <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-display text-[16px] font-bold">Download reviewed results</h2>
              <p className="mt-1 text-[13px] text-ink-2">
                Generate the selected {format.toUpperCase()} file in this tab.
              </p>
            </div>
            <Button
              size="lg"
              onClick={runExport}
              aria-disabled={busy}
              className="shrink-0 aria-disabled:pointer-events-none aria-disabled:opacity-45"
            >
              {busy ? "Generating…" : `Download ${format.toUpperCase()}`}
            </Button>
          </div>
        </Card>
      ) : null}
      {error ? (
        <p className="flex items-start gap-1.5 px-1 text-[13px] text-crit" role="alert">
          <TriangleAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </Page>
  );
}

function FormatCard({
  active,
  onSelect,
  icon,
  title,
  sub,
  body,
}: {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
  body: string;
}) {
  const id = `format-${title.slice(1)}`;

  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name="export-format"
        value={title.slice(1)}
        checked={active}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "block cursor-pointer rounded-[16px] border p-4 text-left transition-colors",
          "hover:border-brand peer-focus-visible:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-line)] peer-focus-visible:ring-offset-2",
          active
            ? "border-brand bg-brand-soft/50 ring-1 ring-[var(--brand-line)]"
            : "border-control-border bg-surface hover:bg-surface-2",
        )}
      >
        <span className="mb-1.5 flex items-center gap-2.5">
          <span className={cn("shrink-0", active ? "text-brand" : "text-ink-3")}>{icon}</span>
          <span className="font-display text-[18px] font-semibold">{title}</span>
          {active ? (
            <span className="ml-auto grid place-items-center w-5 h-5 rounded-full bg-brand text-on-brand shrink-0">
              <Check size={13} strokeWidth={3} aria-hidden />
            </span>
          ) : null}
        </span>
        <span className="label-caps mb-1.5 block text-ink-3">{sub}</span>
        <span className="block text-[13px] leading-relaxed text-ink-2">{body}</span>
      </label>
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
