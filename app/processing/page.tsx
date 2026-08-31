"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Layers,
  Loader2,
  ScanText,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { Page } from "@/components/shell";
import { Badge, Card, CardHead, Progress, Stat, buttonClass, cn } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { CLUSTERS, STAGES, TOTAL_ANSWERS } from "@/lib/mock";

const TOTAL_MS = 9000;
const TOTAL_WEIGHT = STAGES.reduce((s, x) => s + x.weight, 0);

/** Where each stage begins and ends on the 0–100 timeline. Computed once. */
const STAGE_BOUNDS = STAGES.map((stage, i) => {
  const before = STAGES.slice(0, i).reduce((sum, x) => sum + x.weight, 0);
  return {
    start: (before / TOTAL_WEIGHT) * 100,
    end: ((before + stage.weight) / TOTAL_WEIGHT) * 100,
  };
});

export default function ProcessingPage() {
  const { processed, setProcessed, prediction } = useSession();
  const [elapsed, setElapsed] = useState(processed ? TOTAL_MS : 0);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (processed) return;
    let frame = 0;
    startedRef.current = performance.now();

    const tick = () => {
      const start = startedRef.current ?? performance.now();
      const next = Math.min(TOTAL_MS, performance.now() - start);
      setElapsed(next);
      if (next < TOTAL_MS) {
        frame = requestAnimationFrame(tick);
      } else {
        setProcessed(true);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [processed, setProcessed]);

  const pct = (elapsed / TOTAL_MS) * 100;
  const done = elapsed >= TOTAL_MS;

  const stages = useMemo(
    () =>
      STAGES.map((s, i) => {
        const { start, end } = STAGE_BOUNDS[i];
        const progress = Math.max(0, Math.min(100, ((pct - start) / (end - start)) * 100));
        return {
          ...s,
          progress,
          state: progress >= 100 ? "done" : progress > 0 ? "running" : "pending",
        } as const;
      }),
    [pct],
  );

  const extract = stages[0];
  const answersRead = Math.round((extract.progress / 100) * TOTAL_ANSWERS);
  const clustersFound = stages[2].progress >= 100 ? CLUSTERS.length : 0;
  const labelled = stages[3].progress >= 100 ? CLUSTERS.filter((c) => !c.isOther).length : 0;

  return (
    <Page
      eyebrow={done ? "Complete" : "Step 2 of 7 · running"}
      title={done ? "Pipeline finished" : "Reading the class"}
      lead={
        done
          ? `${TOTAL_ANSWERS} answers read in ${(TOTAL_MS / 1000).toFixed(1)} seconds. ${CLUSTERS.filter((c) => !c.isOther).length} misconceptions found, plus a bucket of one-off errors.`
          : "Each stage is a real step, not a progress bar. You can leave this page — the run continues."
      }
      actions={
        done ? (
          <Link
            href={prediction.trim() ? "/reveal" : "/map"}
            className={buttonClass("primary", "md")}
          >
            {prediction.trim() ? "See the reveal" : "Open the map"}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <Link href="/" className={buttonClass("ghost", "sm")}>
            Cancel and go back
          </Link>
        )
      }
      aside={
        <>
          <Card>
            <CardHead title="Live counters" hint="Updating as the run proceeds" />
            <div className="grid grid-cols-2 gap-px bg-border">
              <Counter label="Answers read" value={`${answersRead}`} sub={`of ${TOTAL_ANSWERS}`} />
              <Counter
                label="Signatures"
                value={`${stages[1].progress > 0 ? answersRead : 0}`}
                sub="embedded"
              />
              <Counter label="Clusters" value={clustersFound ? `${clustersFound}` : "—"} sub="found" />
              <Counter label="Labelled" value={labelled ? `${labelled}` : "—"} sub="named" />
            </div>
          </Card>

          <Card>
            <CardHead title="Why these stages" />
            <ul className="px-5 py-4 flex flex-col gap-3.5 text-[13px] text-ink-2">
              <li className="flex gap-2.5">
                <ScanText size={16} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
                <span>
                  <b className="text-ink font-semibold">The signature, not the answer.</b> Each
                  call returns the false belief behind the mistake — never a description of what
                  the student wrote.
                </span>
              </li>
              <li className="flex gap-2.5">
                <Sigma size={16} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
                <span>
                  <b className="text-ink font-semibold">Signatures are embedded, not answers.</b>{" "}
                  Raw answers would group by writing style and length instead of meaning.
                </span>
              </li>
              <li className="flex gap-2.5">
                <Layers size={16} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
                <span>
                  <b className="text-ink font-semibold">No fixed cluster count.</b> How many
                  misconceptions exist is the thing being discovered, so the threshold decides,
                  not a chosen <i>k</i>.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck size={16} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
                <span>
                  <b className="text-ink font-semibold">Scoring rides along.</b> The same call
                  that finds the belief awards the criteria, so marks cost no extra time.
                </span>
              </li>
            </ul>
          </Card>
        </>
      }
    >
      <Card>
        <div className="px-5 sm:px-6 py-5 border-b border-border">
          <div className="flex items-baseline justify-between gap-4 mb-2.5">
            <span className="text-[14px] font-semibold">
              {done ? "All stages complete" : stages.find((s) => s.state === "running")?.label}
            </span>
            <span className="tnum text-[13px] text-ink-2">
              {Math.round(pct)}% · {(elapsed / 1000).toFixed(1)}s
            </span>
          </div>
          <Progress value={pct} tone={done ? "ok" : "brand"} />
        </div>

        <ol className="divide-y divide-border">
          {stages.map((s, i) => (
            <li key={s.id} className="flex gap-3.5 px-5 sm:px-6 py-4">
              <span className="shrink-0 mt-0.5" aria-hidden>
                {s.state === "done" ? (
                  <span className="grid place-items-center w-6 h-6 rounded-full bg-ok-soft border border-ok-line text-ok">
                    <Check size={14} strokeWidth={2.6} />
                  </span>
                ) : s.state === "running" ? (
                  <span className="grid place-items-center w-6 h-6 rounded-full bg-brand-soft border border-brand-line text-brand">
                    <Loader2 size={14} strokeWidth={2.4} className="animate-spin" />
                  </span>
                ) : (
                  <span className="grid place-items-center w-6 h-6 rounded-full border border-border text-ink-3">
                    <Circle size={7} strokeWidth={0} fill="currentColor" />
                  </span>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      "text-[14.5px] font-medium",
                      s.state === "pending" ? "text-ink-3" : "text-ink",
                    )}
                  >
                    <span className="label-caps text-ink-3 mr-2 tnum">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.label}
                  </span>
                  {s.state === "running" && s.id === "extract" ? (
                    <Badge tone="brand">
                      {answersRead} / {TOTAL_ANSWERS}
                    </Badge>
                  ) : s.state === "done" ? (
                    <span className="text-[12.5px] text-ok font-medium">done</span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "text-[13px] mt-0.5",
                    s.state === "pending" ? "text-ink-3" : "text-ink-2",
                  )}
                >
                  {s.detail}
                </p>
                {s.state === "running" ? (
                  <Progress value={s.progress} className="mt-2.5 max-w-md" />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {done ? (
        <Card className="border-brand-line bg-brand-soft/40">
          <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-[18px] font-semibold">
                {prediction.trim()
                  ? "You made a prediction before this run"
                  : "The map is ready"}
              </h2>
              <p className="text-[13.5px] text-ink-2 mt-0.5">
                {prediction.trim()
                  ? "See how it compares with what the class actually got wrong."
                  : "Three misconceptions found across 40 answers."}
              </p>
            </div>
            <Link
              href={prediction.trim() ? "/reveal" : "/map"}
              className={buttonClass("primary", "lg", "shrink-0")}
            >
              {prediction.trim() ? "See the reveal" : "Open the map"}
              <ArrowRight size={17} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Answers" value={TOTAL_ANSWERS} sub="in this batch" />
          <Stat label="Model calls" value={`${TOTAL_ANSWERS + 8}`} sub="extraction + labelling" />
          <Stat label="Threshold" value="0.32" sub="cosine distance" />
        </div>
      )}
    </Page>
  );
}

function Counter({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="label-caps text-ink-3">{label}</div>
      <div className="font-display text-[22px] font-semibold tnum leading-tight mt-0.5">
        {value}
      </div>
      <div className="text-[12px] text-ink-3">{sub}</div>
    </div>
  );
}
