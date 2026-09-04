"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Check, Users } from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import { Badge, Button, Card, CardHead, EmptyState, buttonClass } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { clusterToneClasses } from "@/lib/cluster-tone";
import { learningChange, prevalence } from "@/lib/learning-change";
import {
  readDiagnosticResponses,
  subscribeToDiagnostics,
} from "@/lib/diagnostic-store";
import type { DiagnosticResponse } from "@/lib/types";

/**
 * Before and after — PRD v2 §5 step 8, and §12's primary metric.
 *
 * The screen has one job: say whether the intervention changed anything, and
 * be honest about how much of the class it actually heard from. A figure that
 * looked like improvement because most students never answered would be worse
 * than no figure at all.
 */
export default function OutcomePage() {
  const { clusters, answers, processed } = useSession();
  const [responses, setResponses] = useState<DiagnosticResponse[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  /*
   * Read after mount, and again whenever a student submits in another tab.
   *
   * eslint-disable-next-line is deliberate: localStorage does not exist during
   * the server render, so reading it any earlier would make the server and
   * client produce different markup and throw a hydration mismatch. Responses
   * are external state owned by another tab — synchronising with them is what
   * an effect is for.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResponses(readDiagnosticResponses());
    return subscribeToDiagnostics(() => setResponses(readDiagnosticResponses()));
  }, []);

  const changes = useMemo(
    () => learningChange(clusters, answers, responses),
    [clusters, answers, responses],
  );

  const totals = useMemo(
    () =>
      changes.reduce(
        (acc, c) => ({
          before: acc.before + c.before,
          completed: acc.completed + c.completed,
          corrected: acc.corrected + c.corrected,
          stillHolds: acc.stillHolds + c.stillHolds,
        }),
        { before: 0, completed: 0, corrected: 0, stillHolds: 0 },
      ),
    [changes],
  );

  function copyLinks(clusterId: string) {
    const members = answers.filter(
      (a) => a.clusterId === clusterId && a.diagnosticToken,
    );
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = members
      .map((a) => `${a.studentId}\t${origin}/d/${a.diagnosticToken}`)
      .join("\n");

    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(clusterId);
        window.setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null),
    );
  }

  if (!processed) {
    return (
      <Page eyebrow="Step 8 of 8" title="Outcome">
        <Card>
          <EmptyState
            title="Nothing has been measured yet"
            body="Run the analysis, send the diagnostic, and the change shows up here."
            action={
              <Link href="/" className={buttonClass("primary", "md")}>
                Go to setup
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
            }
          />
        </Card>
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Step 8 of 8"
      title="Did it land?"
      lead="What the class believed before the reteach, and what the diagnostic found after."
    >
      {changes.length === 0 ? (
        <Card>
          <EmptyState
            title="No misconception to measure"
            body="Nothing grouped into a cluster, so there was no intervention to check."
            action={
              <Link href="/map" className={buttonClass("secondary", "md")}>
                Back to the map
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-card)] bg-border sm:grid-cols-4">
              <Stat label="Affected" value={`${totals.before}`} sub="before the reteach" />
              <Stat
                label="Answered"
                value={`${totals.completed}`}
                sub={`of ${totals.before}`}
              />
              <Stat
                label="Corrected"
                value={`${totals.corrected}`}
                sub="no longer show it"
                tone="ok"
              />
              <Stat
                label="Still holding"
                value={`${totals.stillHolds}`}
                sub="after the reteach"
                tone={totals.stillHolds > 0 ? "warn" : undefined}
              />
            </dl>
          </Card>

          {changes.map((change) => {
            const cluster = clusters.find((c) => c.id === change.clusterId);
            const tone = cluster ? clusterToneClasses(cluster.tone) : null;
            const { after } = prevalence(change);
            const decided = change.stillHolds + change.corrected;

            return (
              <Card key={change.clusterId}>
                <CardHead
                  title={change.clusterLabel}
                  hint={`${change.before} students held this`}
                  action={
                    after === null ? (
                      <Badge tone="warn">Not yet measurable</Badge>
                    ) : after === 0 ? (
                      <Badge tone="ok">Cleared</Badge>
                    ) : (
                      <Badge tone={after < 50 ? "ok" : "warn"}>
                        {after.toFixed(0)}% still hold it
                      </Badge>
                    )
                  }
                />

                <div className="px-5 py-5 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="label-caps text-ink-3 w-12 shrink-0">Before</span>
                    <div className="h-3 flex-1 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className={tone ? tone.backgroundClass : "bg-brand"}
                        style={{ width: "100%", height: "100%" }}
                      />
                    </div>
                    <span className="text-[13px] tnum text-ink-2 w-24 text-right">
                      {change.before} students
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="label-caps text-ink-3 w-12 shrink-0">After</span>
                    <div className="h-3 flex-1 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className={tone ? tone.backgroundClass : "bg-brand"}
                        style={{
                          width: after === null ? "0%" : `${after}%`,
                          height: "100%",
                        }}
                      />
                    </div>
                    <span className="text-[13px] tnum text-ink-2 w-24 text-right">
                      {after === null ? "—" : `${change.stillHolds} of ${decided}`}
                    </span>
                  </div>

                  {change.pending > 0 || change.unclear > 0 ? (
                    <p className="text-[12.5px] text-ink-3">
                      {change.pending > 0
                        ? `${change.pending} ${change.pending === 1 ? "student has" : "students have"} not answered yet. `
                        : ""}
                      {change.unclear > 0
                        ? `${change.unclear} ${change.unclear === 1 ? "answer was" : "answers were"} too unclear to judge. `
                        : ""}
                      Neither is counted as a correction.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyLinks(change.clusterId)}
                    >
                      {copied === change.clusterId ? (
                        <>
                          <Check size={15} strokeWidth={2.2} aria-hidden />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={15} strokeWidth={2} aria-hidden />
                          Copy diagnostic links
                        </>
                      )}
                    </Button>
                    <Link
                      href={`/reteach/${change.clusterId}`}
                      className={buttonClass("ghost", "sm")}
                    >
                      <Users size={15} strokeWidth={2} aria-hidden />
                      See the reteach pack
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}

      <Disclosure
        title="What this measures"
        description="Optional detail on how the change is calculated"
      >
        <div className="grid gap-3">
          <p>
            <strong className="text-ink">Before</strong> is the group the
            analysis placed in this misconception. <strong className="text-ink">
              After
            </strong>{" "}
            is what their diagnostic answers showed.
          </p>
          <p>
            The percentage is measured against students who answered and could be
            judged — not the whole group. Dividing by students who never answered
            would show a misconception collapsing because people did not turn up.
          </p>
          <p>
            A student counts as still holding it if either question shows the
            belief, because the pair is written so a corrected student passes
            both.
          </p>
          <p className="text-ink-2">
            This is diagnostic evidence of immediate understanding, not proof of
            long-term learning, and not proof that the reteach caused the change.
          </p>
        </div>
      </Disclosure>
    </Page>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="label-caps text-ink-3">{label}</dt>
      <dd
        className={
          "font-display text-[22px] font-semibold tnum leading-tight mt-0.5 " +
          (tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "")
        }
      >
        {value}
      </dd>
      <dd className="text-[12px] text-ink-3">{sub}</dd>
    </div>
  );
}
