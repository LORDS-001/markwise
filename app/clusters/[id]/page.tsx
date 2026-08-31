"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  GitMerge,
  Pencil,
  Quote,
  Split,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Page } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfidenceMeter,
  EmptyState,
  Input,
  buttonClass,
  cn,
  toneColor,
} from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { TOTAL_ANSWERS } from "@/lib/mock";

type Mode = null | "rename" | "merge" | "split" | "reject";

export default function ClusterDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    clusters,
    answers,
    renameCluster,
    mergeCluster,
    rejectCluster,
    splitOut,
  } = useSession();

  const [mode, setMode] = useState<Mode>(null);
  const [draftName, setDraftName] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [splitName, setSplitName] = useState("");

  const cluster = clusters.find((c) => c.id === params.id);
  const members = useMemo(
    () => answers.filter((a) => a.clusterId === params.id),
    [answers, params.id],
  );

  if (!cluster) {
    return (
      <Page eyebrow="Cluster" title="This cluster no longer exists">
        <Card>
          <EmptyState
            icon={<GitMerge size={26} strokeWidth={1.6} />}
            title="It was merged or rejected"
            body="Its answers were moved to another cluster, so this page has nothing left to show. The map has the current grouping."
            action={
              <Link href="/map" className={buttonClass("primary", "md")}>
                Back to the map
              </Link>
            }
          />
        </Card>
      </Page>
    );
  }

  const pct = (members.length / TOTAL_ANSWERS) * 100;
  const others = clusters.filter((c) => c.id !== cluster.id && c.memberIds.length > 0);

  function downloadRoster() {
    const header = "student_id,initials,provisional_score,max_score,confidence,misconception\n";
    const rows = members
      .map((m) =>
        [
          m.studentId,
          m.initials,
          m.provisionalScore,
          m.maxScore,
          m.confidence,
          `"${cluster!.label.replace(/"/g, '""')}"`,
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${cluster!.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function closePanel() {
    setMode(null);
    setPicked([]);
    setDraftName("");
    setSplitName("");
    setMergeTarget("");
  }

  return (
    <Page
      eyebrow={
        <Link href="/map" className="inline-flex items-center gap-1 hover:text-brand-hover">
          <ArrowLeft size={13} strokeWidth={2.2} aria-hidden />
          Misconception map
        </Link>
      }
      title={
        mode === "rename" ? (
          <span className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="text-[20px] font-display font-semibold h-12"
              aria-label="Cluster name"
            />
            <span className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => {
                  if (draftName.trim()) renameCluster(cluster.id, draftName.trim());
                  closePanel();
                }}
              >
                <Check size={15} strokeWidth={2.2} aria-hidden />
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={closePanel}>
                Cancel
              </Button>
            </span>
          </span>
        ) : (
          cluster.label
        )
      }
      lead={cluster.why}
      actions={
        <Link href={`/reteach/${cluster.id}`} className={buttonClass("primary", "md")}>
          <BookOpen size={16} strokeWidth={1.9} aria-hidden />
          Generate reteach pack
        </Link>
      }
      aside={
        <>
          {/* Downstream damage */}
          <Card>
            <CardHead
              title="Downstream topics at risk"
              hint={`Severity ${cluster.severity} of 5`}
            />
            {cluster.downstream.length > 0 ? (
              <ul className="px-5 py-4 flex flex-col gap-2.5">
                {cluster.downstream.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[13.5px]">
                    <TriangleAlert
                      size={15}
                      strokeWidth={2}
                      className="text-warn shrink-0 mt-0.5"
                      aria-hidden
                    />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[13.5px] text-ink-2">
                No downstream topics identified for this group.
              </p>
            )}
            <div className="px-5 py-3 border-t border-border text-[12.5px] text-ink-3">
              Damage score {cluster.severity * members.length} = severity {cluster.severity} ×{" "}
              {members.length} students
            </div>
          </Card>

          {/* Roster */}
          <Card>
            <CardHead
              title="Affected students"
              hint={`${members.length} in this cluster`}
              action={
                <Button variant="secondary" size="sm" onClick={downloadRoster}>
                  <Download size={14} strokeWidth={2} aria-hidden />
                  CSV
                </Button>
              }
            />
            <ul className="px-5 py-4 grid grid-cols-2 gap-x-3 gap-y-2 max-h-[260px] overflow-y-auto scroll-thin">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 min-w-0">
                  <span
                    className="grid place-items-center w-6 h-6 rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2 shrink-0"
                    aria-hidden
                  >
                    {m.initials.replace(/\./g, "")}
                  </span>
                  <span className="text-[12.5px] text-ink-2 truncate font-mono">
                    {m.studentId.split("/").slice(-1)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-5 pb-4 text-[12px] text-ink-3">
              Demo class — initials and invented IDs only.
            </p>
          </Card>

          {/* Controls */}
          <Card>
            <CardHead title="Correct this cluster" hint="You have the final say" />
            <div className="px-5 py-4 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraftName(cluster.label);
                  setMode("rename");
                }}
              >
                <Pencil size={14} strokeWidth={2} aria-hidden />
                Rename
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMode(mode === "merge" ? null : "merge")}
                disabled={others.length === 0}
              >
                <GitMerge size={14} strokeWidth={2} aria-hidden />
                Merge
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPicked([]);
                  setMode(mode === "split" ? null : "split");
                }}
                disabled={members.length < 2}
              >
                <Split size={14} strokeWidth={2} aria-hidden />
                Split
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setMode(mode === "reject" ? null : "reject")}
                disabled={cluster.isOther}
              >
                <X size={14} strokeWidth={2.2} aria-hidden />
                Reject
              </Button>
            </div>

            {mode === "merge" ? (
              <div className="px-5 py-4 border-t border-border flex flex-col gap-3">
                <p className="text-[13px] text-ink-2">
                  Move all {members.length} answers into another cluster. This one disappears.
                </p>
                <div className="flex flex-col gap-1.5">
                  {others.map((o) => (
                    <label
                      key={o.id}
                      className="flex items-center gap-2.5 text-[13.5px] cursor-pointer rounded-[10px] px-2 py-1.5 hover:bg-surface-2"
                    >
                      <input
                        type="radio"
                        name="merge-target"
                        checked={mergeTarget === o.id}
                        onChange={() => setMergeTarget(o.id)}
                        className="accent-[var(--brand)]"
                      />
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: toneColor(o.tone) }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{o.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!mergeTarget}
                    onClick={() => {
                      mergeCluster(cluster.id, mergeTarget);
                      router.push(`/clusters/${mergeTarget}`);
                    }}
                  >
                    Merge into selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={closePanel}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === "reject" ? (
              <div className="px-5 py-4 border-t border-border flex flex-col gap-3">
                <p className="text-[13px] text-ink-2">
                  Rejecting sends these {members.length} answers to the one-off bucket. Nothing
                  is deleted, and their scores are untouched.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      rejectCluster(cluster.id);
                      router.push("/map");
                    }}
                  >
                    Reject this cluster
                  </Button>
                  <Button variant="ghost" size="sm" onClick={closePanel}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      }
    >
      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <div className="label-caps text-ink-3">Share of class</div>
          <div
            className="font-display text-[30px] font-semibold tnum leading-tight mt-0.5"
            style={{ color: toneColor(cluster.tone) }}
          >
            {pct.toFixed(0)}%
          </div>
          <div className="text-[12.5px] text-ink-2">
            {members.length} of {TOTAL_ANSWERS} answers
          </div>
        </Card>
        <Card className="px-5 py-4">
          <div className="label-caps text-ink-3">Mean score here</div>
          <div className="font-display text-[30px] font-semibold tnum leading-tight mt-0.5">
            {members.length
              ? (members.reduce((s, m) => s + m.provisionalScore, 0) / members.length).toFixed(1)
              : "—"}
            <span className="text-[16px] text-ink-3 font-normal"> / 10</span>
          </div>
          <div className="text-[12.5px] text-ink-2">Provisional, before your review</div>
        </Card>
        <Card className="px-5 py-4">
          <div className="label-caps text-ink-3">Severity</div>
          <div className="font-display text-[30px] font-semibold tnum leading-tight mt-0.5 text-warn">
            {cluster.severity}
            <span className="text-[16px] text-ink-3 font-normal"> / 5</span>
          </div>
          <div className="text-[12.5px] text-ink-2">
            Blocks {cluster.downstream.length} later topic
            {cluster.downstream.length === 1 ? "" : "s"}
          </div>
        </Card>
      </div>

      {/* Split bar */}
      {mode === "split" ? (
        <Card className="border-brand-line bg-brand-soft/50">
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <Split size={16} strokeWidth={2} className="text-brand shrink-0 mt-0.5" aria-hidden />
              <p className="text-[13.5px]">
                <b className="font-semibold">Select the answers that don&apos;t belong.</b>{" "}
                They&apos;ll move into a new cluster of their own, and the counts on every screen
                update.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
                placeholder="Name the new cluster…"
                aria-label="New cluster name"
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  size="md"
                  disabled={picked.length === 0 || !splitName.trim()}
                  onClick={() => {
                    splitOut(cluster.id, picked, splitName.trim());
                    closePanel();
                  }}
                >
                  Split {picked.length || ""} out
                </Button>
                <Button variant="ghost" size="md" onClick={closePanel}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Evidence */}
      <Card>
        <CardHead
          title="The evidence"
          hint="Every answer in this cluster, verbatim, with the phrase that triggered the signature"
          action={
            <Badge tone="neutral">
              <Quote size={11} strokeWidth={2.2} aria-hidden />
              {members.length} answers
            </Badge>
          }
        />
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const isPicked = picked.includes(m.id);
            return (
              <li
                key={m.id}
                className={cn(
                  "px-5 sm:px-6 py-4 transition-colors",
                  mode === "split" && "cursor-pointer hover:bg-surface-2",
                  isPicked && "bg-brand-soft/40",
                )}
                onClick={
                  mode === "split"
                    ? () =>
                        setPicked((p) =>
                          p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id],
                        )
                    : undefined
                }
              >
                <div className="flex items-start gap-3">
                  {mode === "split" ? (
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => {}}
                      className="mt-1 accent-[var(--brand)] w-4 h-4 shrink-0"
                      aria-label={`Select answer from ${m.studentId}`}
                    />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                      <span className="font-mono text-[12.5px] text-ink-2">{m.studentId}</span>
                      <span className="text-[12.5px] text-ink-3">{m.initials}</span>
                      <Badge tone={m.provisionalScore >= 7 ? "ok" : m.provisionalScore >= 4 ? "warn" : "crit"}>
                        {m.provisionalScore}/{m.maxScore}
                      </Badge>
                      <ConfidenceMeter value={m.confidence} />
                    </div>

                    <blockquote
                      className="text-[14px] leading-relaxed text-ink border-l-2 pl-3.5"
                      style={{ borderColor: toneColor(cluster.tone) }}
                    >
                      <Highlighted text={m.answer} span={m.evidenceSpan} tone={cluster.tone} />
                    </blockquote>

                    {m.errorSignature ? (
                      <p className="text-[12.5px] text-ink-2 mt-2">
                        <span className="label-caps text-ink-3 mr-1.5">Signature</span>
                        {m.errorSignature}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="px-5 sm:px-6 py-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-2 flex items-center gap-2">
            <Users size={15} strokeWidth={1.9} className="text-ink-3" aria-hidden />
            This list is how you decide whether to trust the cluster.
          </p>
          <Link href={`/reteach/${cluster.id}`} className={buttonClass("secondary", "sm")}>
            Teach against this
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </Card>
    </Page>
  );
}

/** Renders the answer with its triggering span marked, falling back to plain
 *  text when the span can't be located. */
function Highlighted({
  text,
  span,
  tone,
}: {
  text: string;
  span: string | null;
  tone: number;
}) {
  if (!span) return <>{text}</>;
  const at = text.indexOf(span);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark
        className="rounded-[5px] px-0.5 font-medium"
        style={{
          background: `color-mix(in srgb, ${toneColor(tone)} 20%, transparent)`,
          color: "inherit",
        }}
      >
        {span}
      </mark>
      {text.slice(at + span.length)}
    </>
  );
}
