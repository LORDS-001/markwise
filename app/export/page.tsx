"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { SESSION, TOTAL_ANSWERS } from "@/lib/mock";
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
  } = useSession();

  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          pct: (c.memberIds.length / TOTAL_ANSWERS) * 100,
        })),
    [clusters],
  );

  async function runExport() {
    setBusy(true);
    setError(null);
    try {
      if (format === "xlsx") {
        await downloadXlsx(rows, stats, {
          courseCode: SESSION.courseCode,
          question: SESSION.question,
          lecturer: confirmedBy,
        });
      } else {
        await downloadDocx(rows, stats, {
          courseCode: SESSION.courseCode,
          courseTitle: SESSION.courseTitle,
          question: SESSION.question,
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
                {TOTAL_ANSWERS - reviewedCount} of {TOTAL_ANSWERS} rows still need you
              </h2>
              <p className="text-[14px] text-ink-2 mt-1.5 max-w-[60ch]">
                {needsAttention > 0
                  ? `${needsAttention} of them scored below the confidence threshold and are flagged for a mandatory look.`
                  : "The rest are high-confidence — accepting them in bulk takes one click."}
              </p>
              <div className="mt-4 max-w-sm">
                <Progress value={(reviewedCount / TOTAL_ANSWERS) * 100} tone="warn" />
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
              "Student ID and name",
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
      title="Export the class"
      lead="Format, a look at what you're sending, then confirm. Both files carry a provenance line naming you and the date."
      aside={
        <>
          <Card className={cn(confirmed ? "border-ok-line" : "border-brand-line")}>
            <CardHead
              title={confirmed ? "Batch confirmed" : "Confirm the batch"}
              hint={
                confirmed
                  ? "You can reopen it until you leave this session"
                  : "This attaches your name to the provenance line"
              }
            />
            <div className="px-5 py-4 flex flex-col gap-3">
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

              <AccountLink />

              {confirmed ? (
                <>
                  <div className="flex items-center gap-2 text-[13.5px] text-ok font-medium">
                    <ShieldCheck size={16} strokeWidth={2} aria-hidden />
                    All {TOTAL_ANSWERS} rows reviewed and confirmed
                  </div>
                  <Button size="lg" onClick={runExport} disabled={busy}>
                    {busy ? "Generating…" : `Download .${format}`}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmed(false)}>
                    Reopen for edits
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  onClick={() => setConfirmed(true)}
                  disabled={!confirmedBy.trim()}
                >
                  <Check size={17} strokeWidth={2.2} aria-hidden />
                  Confirm all {TOTAL_ANSWERS} scores
                </Button>
              )}

              {error ? (
                <p className="text-[13px] text-crit flex items-start gap-1.5" role="alert">
                  <TriangleAlert size={14} strokeWidth={2} className="shrink-0 mt-0.5" aria-hidden />
                  {error}
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHead title="Class summary" hint="Written into both files" />
            <dl className="px-5 py-4 flex flex-col gap-2.5 text-[13.5px]">
              <SummaryRow label="Students" value={`${rows.length}`} />
              <SummaryRow label="Mean" value={`${stats.mean.toFixed(1)} / 10`} />
              <SummaryRow label="Median" value={`${stats.median}`} />
              <SummaryRow label="Pass rate" value={`${stats.passRate.toFixed(0)}%`} />
            </dl>
            <div className="px-5 pb-4">
              <div className="label-caps text-ink-3 mb-2">Distribution</div>
              <div className="flex items-end gap-1.5 h-16">
                {stats.distribution.map((d) => {
                  const max = Math.max(1, ...stats.distribution.map((x) => x.count));
                  return (
                    <div key={d.band} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-[3px] bg-brand/70 min-h-[2px]"
                        style={{ height: `${(d.count / max) * 100}%` }}
                        title={`${d.band}: ${d.count}`}
                      />
                      <span className="text-[10.5px] text-ink-3 tnum">{d.band}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </>
      }
    >
      {/* Format */}
      <Card>
        <CardHead title="Format" hint="Pick one — you can come back and export the other" />
        <div className="px-5 py-5 grid gap-3 sm:grid-cols-2">
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

      {/* Preview */}
      <Card className="overflow-hidden">
        <CardHead
          title="Preview"
          hint={`First 6 of ${rows.length} rows, exactly as they'll be written`}
          action={<Badge tone="brand">.{format}</Badge>}
        />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-ink-3">
                {["Student ID", "Name", "Score", "%", "Misconception", "Criteria missed", "Status"].map(
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

      {/* Provenance */}
      <Card className="bg-surface-2 border-border">
        <div className="px-5 sm:px-6 py-4 flex gap-3">
          <ShieldCheck size={18} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold mb-1">Footer written into both files</p>
            <p className="text-[13.5px] text-ink-2 italic">
              {provenanceLine(confirmedBy.trim() || "[your name]")}
            </p>
            <p className="text-[12.5px] text-ink-3 mt-1.5">
              A provenance record, not a disclaimer — it says who stands behind these marks.
            </p>
          </div>
        </div>
      </Card>
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
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "text-left rounded-[16px] border p-4 transition-colors",
        active
          ? "border-brand bg-brand-soft/50 ring-1 ring-[var(--brand-line)]"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={cn("shrink-0", active ? "text-brand" : "text-ink-3")}>{icon}</span>
        <span className="font-display text-[18px] font-semibold">{title}</span>
        {active ? (
          <span className="ml-auto grid place-items-center w-5 h-5 rounded-full bg-brand text-on-brand shrink-0">
            <Check size={13} strokeWidth={3} aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="label-caps text-ink-3 mb-1.5">{sub}</div>
      <p className="text-[13px] text-ink-2 leading-relaxed">{body}</p>
    </button>
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
