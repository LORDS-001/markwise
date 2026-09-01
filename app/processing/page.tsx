"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Loader2,
} from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import { Badge, Card, Progress, buttonClass, cn } from "@/components/ui";
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

const STAGE_PRESENTATION: Record<string, { label: string; sentence: string }> = {
  extract: {
    label: "Extract sample reasoning",
    sentence: "Identify the reasoning expressed in each sample answer.",
  },
  embed: {
    label: "Compare reasoning patterns",
    sentence: "Compare the extracted reasoning across the sample answers.",
  },
  cluster: {
    label: "Group related patterns",
    sentence: "Bring sample answers with related reasoning together.",
  },
  label: {
    label: "Name the groups",
    sentence: "Give each sample pattern a concise misconception label.",
  },
  damage: {
    label: "Rank teaching priorities",
    sentence: "Order the sample patterns by spread and likely mark loss.",
  },
};

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
  const currentStage = stages.find((stage) => stage.state === "running");

  return (
    <Page
      eyebrow={done ? "Step 2 of 7 · complete" : "Step 2 of 7 · preparing"}
      title={done ? "Sample analysis ready" : "Preparing the sample analysis"}
      lead={
        <span aria-live="polite" aria-atomic="true">
          {done
            ? "Review how your prediction compares with the sample evidence."
            : "Keep this page open while the preview is prepared."}
        </span>
      }
      actions={
        done ? (
          <Link
            href={prediction.trim() ? "/reveal" : "/map"}
            className={buttonClass("primary", "md")}
          >
            {prediction.trim() ? "Compare my prediction" : "View misconception map"}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <Link href="/" className={buttonClass("ghost", "sm")}>
            Cancel and go back
          </Link>
        )
      }
    >
      <Card>
        <div className="px-5 sm:px-6 py-5 border-b border-border">
          <div className="flex items-baseline justify-between gap-4 mb-2.5">
            <span
              className="text-[14px] font-semibold"
              aria-live="polite"
              aria-atomic="true"
            >
              {done
                ? "All sample stages complete"
                : currentStage
                  ? STAGE_PRESENTATION[currentStage.id].label
                  : "Starting sample analysis"}
            </span>
            <span className="tnum text-[13px] text-ink-2">
              {Math.round(pct)}% · {(elapsed / 1000).toFixed(1)}s
            </span>
          </div>
          <Progress value={pct} tone={done ? "ok" : "brand"} />
        </div>

        <ol className="divide-y divide-border">
          {stages.map((s, i) => (
            <li key={s.id} className="flex min-h-12 gap-3 px-5 py-2 sm:px-6">
              <span className="shrink-0" aria-hidden>
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
                      "text-[13.5px] font-medium leading-5",
                      s.state === "pending" ? "text-ink-3" : "text-ink",
                    )}
                  >
                    <span className="label-caps text-ink-3 mr-2 tnum">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {STAGE_PRESENTATION[s.id].label}
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
                    "text-[12px] leading-4",
                    s.state === "pending" ? "text-ink-3" : "text-ink-2",
                  )}
                >
                  {s.state === "done"
                    ? "Complete for the sample answers."
                    : s.state === "running"
                      ? STAGE_PRESENTATION[s.id].sentence
                      : "Waiting for the previous sample stage."}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r-card)] bg-border">
          <Counter label="Sample answers" value={`${answersRead}`} sub={`of ${TOTAL_ANSWERS} read`} />
          <Counter
            label="Sample patterns"
            value={clustersFound ? `${clustersFound}` : "—"}
            sub="found"
          />
          <Counter label="Sample labels" value={labelled ? `${labelled}` : "—"} sub="named" />
        </dl>
      </Card>

      <Disclosure
        title="How processing works"
        description="Optional detail about the analysis stages"
      >
        <ol className="grid gap-3">
          <li>
            <strong className="text-ink">Extract:</strong> isolate the reasoning in each response.
          </li>
          <li>
            <strong className="text-ink">Compare:</strong> group responses with similar reasoning
            patterns.
          </li>
          <li>
            <strong className="text-ink">Prioritise:</strong> rank patterns by spread and likely
            mark loss.
          </li>
        </ol>
      </Disclosure>
    </Page>
  );
}

function Counter({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="label-caps text-ink-3">{label}</dt>
      <dd className="font-display text-[22px] font-semibold tnum leading-tight mt-0.5">
        {value}
      </dd>
      <dd className="text-[12px] text-ink-3">{sub}</dd>
    </div>
  );
}
