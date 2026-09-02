"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
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
import { Disclosure } from "@/components/disclosure";
import { ActionArea } from "@/components/page-structure";
import { useSession } from "@/components/session-provider";
import { Page } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfidenceMeter,
  EmptyState,
  Input,
  Stat,
  buttonClass,
  cn,
  toneColor,
} from "@/components/ui";
import { TOTAL_ANSWERS } from "@/lib/mock";

type Mode = null | "rename" | "merge" | "split" | "reject";
type PanelMode = Exclude<Mode, null>;

const PANEL_TRIGGER_IDS: Record<PanelMode, string> = {
  rename: "cluster-rename-trigger",
  merge: "cluster-merge-trigger",
  split: "cluster-split-trigger",
  reject: "cluster-reject-trigger",
};
const FOCUS_RECOVERY_ID = "cluster-focus-recovery";

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
  const restoreFocusMode = useRef<PanelMode | null>(null);

  const cluster = clusters.find((candidate) => candidate.id === params.id);
  const members = useMemo(
    () => answers.filter((answer) => answer.clusterId === params.id),
    [answers, params.id],
  );

  useEffect(() => {
    const closedMode = restoreFocusMode.current;
    if (mode !== null || !closedMode) return;

    const trigger = document.getElementById(PANEL_TRIGGER_IDS[closedMode]);
    const target =
      trigger instanceof HTMLButtonElement && !trigger.disabled
        ? trigger
        : document.getElementById(FOCUS_RECOVERY_ID);
    if (target instanceof HTMLElement) {
      target.focus();
      restoreFocusMode.current = null;
    }
  }, [cluster, mode]);

  if (!cluster) {
    return (
      <Page eyebrow="Cluster status" title="This cluster no longer exists">
        <Card>
          <EmptyState
            icon={<GitMerge size={26} strokeWidth={1.6} />}
            title="It was merged or rejected"
            body="Its answers were moved to another cluster, so this page has nothing left to show. The misconception map has the current grouping."
            action={
              <Link
                id={FOCUS_RECOVERY_ID}
                href="/map"
                className={buttonClass("primary", "md")}
              >
                Back to misconception map
              </Link>
            }
          />
        </Card>
      </Page>
    );
  }

  const pct = (members.length / TOTAL_ANSWERS) * 100;
  const averageLoss = members.length
    ? members.reduce(
        (total, member) => total + member.maxScore - member.provisionalScore,
        0,
      ) / members.length
    : null;
  const others = clusters.filter(
    (candidate) => candidate.id !== cluster.id && candidate.memberIds.length > 0,
  );
  const signatures = Array.from(
    new Set(
      members
        .map((member) => member.errorSignature)
        .filter((signature): signature is string => Boolean(signature)),
    ),
  );

  function downloadRoster() {
    const header = "student_id,initials,provisional_score,max_score,confidence,misconception\n";
    const rows = members
      .map((member) =>
        [
          member.studentId,
          member.initials,
          member.provisionalScore,
          member.maxScore,
          member.confidence,
          `"${cluster!.label.replace(/"/g, '""')}"`,
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `roster-${cluster!.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function closePanel() {
    if (mode) restoreFocusMode.current = mode;
    setMode(null);
    setPicked([]);
    setDraftName("");
    setSplitName("");
    setMergeTarget("");
  }

  function setAnswerPicked(answerId: string, selected: boolean) {
    setPicked((current) => {
      if (selected) return current.includes(answerId) ? current : [...current, answerId];
      return current.filter((id) => id !== answerId);
    });
  }

  return (
    <Page
      eyebrow={
        <Link
          id={FOCUS_RECOVERY_ID}
          href="/map"
          className="inline-flex items-center gap-1 hover:text-brand-hover"
        >
          <ArrowLeft size={13} strokeWidth={2.2} aria-hidden />
          Misconception map
        </Link>
      }
      title={
        <span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <span>{cluster.label}</span>
          <Badge tone="ok">Active cluster</Badge>
        </span>
      }
      lead="Read the students' words first, then decide whether this grouping represents one shared misconception."
      actions={
        <Link
          href={`/reteach/${cluster.id}`}
          className={buttonClass(mode === "split" ? "secondary" : "primary", "md")}
        >
          <BookOpen size={16} strokeWidth={1.9} aria-hidden />
          Generate reteach pack
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Spread"
          value={`${pct.toFixed(0)}%`}
          sub={`${members.length} of ${TOTAL_ANSWERS} answers`}
          tone="brand"
        />
        <Stat
          label="Average loss"
          value={averageLoss === null ? "—" : averageLoss.toFixed(1)}
          sub="marks lost per affected answer"
          tone="warn"
        />
        <Stat
          label="Affected students"
          value={members.length}
          sub="in this misconception cluster"
        />
      </div>

      <Card>
        <CardHead
          title="Verbatim evidence"
          hint="Every answer in this cluster, with the phrase that triggered the grouping highlighted"
          action={
            <Badge tone="neutral">
              <Quote size={11} strokeWidth={2.2} aria-hidden />
              {members.length} answers
            </Badge>
          }
        />
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const isPicked = picked.includes(member.id);
            return (
              <li
                key={member.id}
                className={cn(
                  "px-5 py-4 transition-colors sm:px-6",
                  mode === "split" && "cursor-pointer hover:bg-surface-2",
                  isPicked && "bg-brand-soft/40",
                )}
                onClick={
                  mode === "split"
                    ? () => setAnswerPicked(member.id, !isPicked)
                    : undefined
                }
              >
                <div className="flex items-start gap-3">
                  {mode === "split" ? (
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setAnswerPicked(member.id, event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                      aria-label={`Select ${member.initials} for split`}
                    />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[12.5px] text-ink-2">
                        {member.studentId}
                      </span>
                      <span className="text-[12.5px] text-ink-3">{member.initials}</span>
                      <Badge
                        tone={
                          member.provisionalScore >= 7
                            ? "ok"
                            : member.provisionalScore >= 4
                              ? "warn"
                              : "crit"
                        }
                      >
                        {member.provisionalScore}/{member.maxScore}
                      </Badge>
                      <ConfidenceMeter value={member.confidence} />
                    </div>

                    <blockquote
                      className="border-l-2 pl-3.5 text-[14px] leading-relaxed text-ink"
                      style={{ borderColor: toneColor(cluster.tone) }}
                    >
                      <Highlighted
                        text={member.answer}
                        span={member.evidenceSpan}
                        tone={cluster.tone}
                      />
                    </blockquote>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2 border-t border-border px-5 py-4 text-[13px] text-ink-2 sm:px-6">
          <Users size={15} strokeWidth={1.9} className="shrink-0 text-ink-3" aria-hidden />
          Use the original responses—not the generated label—to decide whether this cluster is coherent.
        </div>
      </Card>

      <Disclosure
        title="Why these responses belong together"
        description="Review the model's rationale and the recurring error signatures."
      >
        <p>{cluster.why}</p>
        {signatures.length > 0 ? (
          <div className="mt-4">
            <p className="label-caps text-ink-3">Evidence signatures</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {signatures.map((signature) => (
                <li key={signature}>{signature}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-ink-3">No shared error signature was assigned.</p>
        )}
      </Disclosure>

      <div className="grid items-start gap-5 lg:grid-cols-2">
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
          <ul className="grid max-h-[320px] grid-cols-2 gap-x-3 gap-y-2 overflow-y-auto px-5 py-4 scroll-thin sm:grid-cols-3">
            {members.map((member) => (
              <li key={member.id} className="flex min-w-0 items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2"
                  aria-hidden
                >
                  {member.initials.replace(/\./g, "")}
                </span>
                <span className="truncate font-mono text-[12.5px] text-ink-2">
                  {member.studentId.split("/").slice(-1)}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 text-[12px] text-ink-3">
            Demo class — initials and invented IDs only.
          </p>
        </Card>

        <Card>
          <CardHead
            title="Downstream topics at risk"
            hint={`Severity ${cluster.severity} of 5`}
          />
          {cluster.downstream.length > 0 ? (
            <ul className="flex flex-col gap-2.5 px-5 py-4">
              {cluster.downstream.map((topic) => (
                <li key={topic} className="flex items-start gap-2.5 text-[13.5px]">
                  <TriangleAlert
                    size={15}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0 text-warn"
                    aria-hidden
                  />
                  <span>{topic}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-[13.5px] text-ink-2">
              No downstream topics identified for this group.
            </p>
          )}
          <div className="border-t border-border px-5 py-3 text-[12.5px] text-ink-3">
            Damage score {cluster.severity * members.length} = severity {cluster.severity} ×{" "}
            {members.length} students
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Edit cluster" hint="Rename, merge, split, or reject this grouping." />
        <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-4">
          <Button
            id={PANEL_TRIGGER_IDS.rename}
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
            id={PANEL_TRIGGER_IDS.merge}
            variant="secondary"
            size="sm"
            onClick={() => setMode(mode === "merge" ? null : "merge")}
            disabled={others.length === 0}
          >
            <GitMerge size={14} strokeWidth={2} aria-hidden />
            Merge
          </Button>
          <Button
            id={PANEL_TRIGGER_IDS.split}
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
            id={PANEL_TRIGGER_IDS.reject}
            variant="danger"
            size="sm"
            onClick={() => setMode(mode === "reject" ? null : "reject")}
            disabled={cluster.isOther}
          >
            <X size={14} strokeWidth={2.2} aria-hidden />
            Reject
          </Button>
        </div>

        {mode === "rename" ? (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
            <Input
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              aria-label="Cluster name"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
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
            </div>
          </div>
        ) : null}

        {mode === "merge" ? (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
            <p className="text-[13px] text-ink-2">
              Move all {members.length} answers into another cluster. This one disappears.
            </p>
            <div className="flex flex-col gap-1.5">
              {others.map((other) => (
                <label
                  key={other.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[13.5px] hover:bg-surface-2"
                >
                  <input
                    type="radio"
                    name="merge-target"
                    checked={mergeTarget === other.id}
                    onChange={() => setMergeTarget(other.id)}
                    className="accent-[var(--brand)]"
                  />
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: toneColor(other.tone) }}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{other.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
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

        {mode === "split" ? (
          <div className="border-t border-border p-4">
            <ActionArea
              className="border-brand-line bg-brand-soft/40"
              note={
                <div className="flex flex-col gap-2">
                  <p>
                    Select the answers that do not belong in the verbatim evidence above, then
                    name their new cluster.
                  </p>
                  <Input
                    value={splitName}
                    onChange={(event) => setSplitName(event.target.value)}
                    placeholder="Name the new cluster…"
                    aria-label="New cluster name"
                  />
                </div>
              }
            >
              <Button
                size="md"
                disabled={picked.length === 0 || !splitName.trim()}
                onClick={() => {
                  splitOut(cluster.id, picked, splitName.trim());
                  closePanel();
                }}
              >
                Split {picked.length} selected
              </Button>
              <Button variant="secondary" size="md" onClick={closePanel}>
                Cancel
              </Button>
            </ActionArea>
          </div>
        ) : null}

        {mode === "reject" ? (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
            <p className="text-[13px] text-ink-2">
              Rejecting sends these {members.length} answers to the one-off bucket. Nothing is
              deleted, and their scores are untouched.
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
    </Page>
  );
}

/** Renders the answer with its triggering span marked, falling back to plain
 * text when the span can't be located. */
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
