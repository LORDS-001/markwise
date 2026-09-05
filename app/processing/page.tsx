"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import { Badge, Button, Card, Progress, buttonClass, cn } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { CLUSTERS, STAGES, TOTAL_ANSWERS } from "@/lib/mock";
import type { PipelineResult, StageId } from "@/lib/pipeline/types";

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

const EMPTY_PROGRESS: Record<StageId, number> = {
  extract: 0,
  embed: 0,
  cluster: 0,
  label: 0,
  damage: 0,
};

export default function ProcessingPage() {
  const { processed, setProcessed, prediction, pendingRun, applyRun } =
    useSession();

  /* --- Simulated path -------------------------------------------------
   * With no pending run there is nothing to wait for: the seeded demo class
   * is already processed, and a visitor who lands here directly should still
   * see the stages that make the product legible rather than an empty page.
   */
  const [elapsed, setElapsed] = useState(processed ? TOTAL_MS : 0);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (processed || pendingRun) return;
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
  }, [processed, setProcessed, pendingRun]);

  /* --- Real run -------------------------------------------------------- */
  const [liveProgress, setLiveProgress] =
    useState<Record<StageId, number>>(EMPTY_PROGRESS);
  const [liveAnswersRead, setLiveAnswersRead] = useState(0);
  const [liveResult, setLiveResult] = useState<PipelineResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // Latched, because applying the result clears the pending run. Deriving
  // "is this a real run" from pendingRun alone would flip the page back to
  // the simulated path at 0% at the exact moment the run succeeded.
  const [hasLiveRun, setHasLiveRun] = useState(false);

  const totalAnswers =
    liveResult?.answers.length ?? pendingRun?.input.answers.length ?? TOTAL_ANSWERS;

  useEffect(() => {
    if (!pendingRun) return;

    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setInterval(
      () => setLiveElapsed(Date.now() - startedAt),
      100,
    );
    let cancelled = false;

    async function go() {
      try {
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: pendingRun!.input,
            prediction: pendingRun!.prediction,
            courseCode: pendingRun!.courseCode,
            courseTitle: pendingRun!.courseTitle,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const problem = await response
            .json()
            .catch(() => ({ error: "The run could not be started." }));
          throw new Error(problem.error ?? "The run could not be started.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let receivedResult = false;

        const receive = (line: string) => {
          if (!line.trim() || cancelled) return;
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "progress") {
            const stage = event.stage as StageId;
            if (!(stage in EMPTY_PROGRESS)) return;
            const value = Math.max(0, Math.min(1, Number(event.progress) || 0));
            setLiveProgress((prev) => ({ ...prev, [stage]: value }));
            if (stage === "extract") {
              setLiveAnswersRead(Math.round(value * pendingRun!.input.answers.length));
            }
          } else if (event.type === "warning") {
            setWarning(String(event.message ?? ""));
          } else if (event.type === "error") {
            throw new Error(String(event.message ?? "The run failed."));
          } else if (event.type === "result") {
            const result = event.result as PipelineResult;
            if (!result || !Array.isArray(result.answers) || !Array.isArray(result.clusters)) {
              throw new Error("The run returned an invalid result. Try again.");
            }
            receivedResult = true;
            setLiveProgress({ extract: 1, embed: 1, cluster: 1, label: 1, damage: 1 });
            setLiveAnswersRead(result.answers.length);
            setLiveResult(result);
            applyRun(result, (event.sessionId as string | null) ?? null, pendingRun!.input, {
              code: pendingRun!.courseCode ?? "",
              title: pendingRun!.courseTitle ?? "",
            });
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            receive(buffer + decoder.decode());
            break;
          }
          buffer += decoder.decode(value, { stream: true });

          // NDJSON: everything up to the last newline is complete; whatever
          // follows is a partial line that the next chunk finishes.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (cancelled) return;
            receive(line);
            if (receivedResult) return;
          }
        }
        if (!receivedResult && !cancelled) {
          throw new Error("The connection ended before a result arrived. Try the run again.");
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setRunError(
          error instanceof Error
            ? error.message
            : "The run failed for an unknown reason.",
        );
      } finally {
        clearInterval(timer);
      }
    }

    // Strict Mode first sets up and cleans up this effect synchronously. Defer
    // the request so that discarded setup cannot start a paid operation.
    queueMicrotask(() => {
      if (cancelled) return;
      setHasLiveRun(true);
      void go();
    });

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [pendingRun, applyRun, attempt]);

  const retry = useCallback(() => {
    setRunError(null);
    setWarning(null);
    setLiveProgress(EMPTY_PROGRESS);
    setLiveAnswersRead(0);
    setLiveElapsed(0);
    setAttempt((n) => n + 1);
  }, []);

  /* --- Shared presentation --------------------------------------------- */

  const isLive = hasLiveRun || pendingRun !== null;
  const stageText = (text: string) => isLive ? text.replaceAll("sample ", "") : text;
  const simPct = (elapsed / TOTAL_MS) * 100;

  const stages = useMemo(() => {
    if (isLive) {
      return STAGES.map((s) => {
        const progress = (liveProgress[s.id as StageId] ?? 0) * 100;
        return {
          ...s,
          progress,
          state:
            progress >= 100 ? "done" : progress > 0 ? "running" : "pending",
        } as const;
      });
    }
    return STAGES.map((s, i) => {
      const { start, end } = STAGE_BOUNDS[i];
      const progress = Math.max(
        0,
        Math.min(100, ((simPct - start) / (end - start)) * 100),
      );
      return {
        ...s,
        progress,
        state: progress >= 100 ? "done" : progress > 0 ? "running" : "pending",
      } as const;
    });
  }, [isLive, liveProgress, simPct]);

  // Weighted so the bar tracks how much work is actually left, not how many
  // stage names have gone by — extraction is most of a run's wall clock.
  const pct = isLive
    ? stages.reduce((sum, s) => sum + (s.progress / 100) * s.weight, 0) /
      (TOTAL_WEIGHT / 100)
    : simPct;

  const done = isLive ? liveResult !== null : elapsed >= TOTAL_MS;
  const shownElapsed = isLive ? liveElapsed : elapsed;

  const answersRead = isLive
    ? liveAnswersRead
    : Math.round((stages[0].progress / 100) * TOTAL_ANSWERS);

  const resultClusters = liveResult?.clusters ?? CLUSTERS;
  const clustersFound =
    stages[2].progress >= 100 ? resultClusters.length : 0;
  const labelled =
    stages[3].progress >= 100
      ? resultClusters.filter((c) => !c.isOther).length
      : 0;

  const currentStage =
    stages.find((stage) => stage.state === "running") ??
    (pct > 0 ? stages.find((stage) => stage.state === "pending") : undefined);

  const failed = runError !== null;

  return (
    <Page
      eyebrow={
        failed
          ? "Step 2 of 7 · stopped"
          : done
            ? "Step 2 of 7 · complete"
            : "Step 2 of 7 · preparing"
      }
      title={
        failed
          ? "The run stopped"
          : done
            ? isLive ? "Class analysis ready" : "Sample analysis ready"
            : isLive ? "Analysing your class" : "Preparing the sample analysis"
      }
      lead={
        <span aria-live="polite" aria-atomic="true">
          {failed
            ? "The analysis could not be completed. Your setup is still here — you can try again."
            : done
              ? isLive ? "Review how your prediction compares with your class evidence." : "Review how your prediction compares with the sample evidence."
              : isLive ? "Keep this page open while your answers are analysed." : "Keep this page open while the preview is prepared."}
        </span>
      }
      actions={
        failed ? (
          <>
            <Link href="/" className={buttonClass("ghost", "sm")}>
              Back to setup
            </Link>
            <Button size="md" onClick={retry}>
              Try again
            </Button>
          </>
        ) : done ? (
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
      {failed ? (
        <Card className="border-crit-line bg-crit-soft">
          <div className="flex gap-3 px-5 py-4 sm:px-6">
            <TriangleAlert
              size={18}
              strokeWidth={1.9}
              className="mt-0.5 shrink-0 text-crit"
              aria-hidden
            />
            <div className="text-[13.5px]">
              <p className="font-semibold mb-1">The pipeline could not finish</p>
              <p className="text-ink-2" role="alert">
                {runError}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {warning ? (
        <Card className="border-warn-line bg-warn-soft">
          <div className="px-5 py-3.5 sm:px-6 text-[13px] text-ink-2" role="status">
            {warning}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="px-5 sm:px-6 py-5 border-b border-border">
          <div className="flex items-baseline justify-between gap-4 mb-2.5">
            <span
              className="text-[14px] font-semibold"
              aria-live="polite"
              aria-atomic="true"
            >
              {done
                ? stageText("All sample stages complete")
                : currentStage
                  ? stageText(STAGE_PRESENTATION[currentStage.id].label)
                  : stageText("Starting sample analysis")}
            </span>
            <span className="tnum text-[13px] text-ink-2">
              {Math.round(pct)}% · {(shownElapsed / 1000).toFixed(1)}s
            </span>
          </div>
          <Progress
            value={pct}
            label={isLive ? "Class analysis progress" : "Sample analysis progress"}
            tone={failed ? "warn" : done ? "ok" : "brand"}
          />
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
                    {stageText(STAGE_PRESENTATION[s.id].label)}
                  </span>
                  {s.state === "running" && s.id === "extract" ? (
                    <Badge tone="brand">
                      {answersRead} / {totalAnswers}
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
                    ? stageText("Complete for the sample answers.")
                    : s.state === "running"
                      ? stageText(STAGE_PRESENTATION[s.id].sentence)
                      : stageText("Waiting for the previous sample stage.")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r-card)] bg-border">
          <Counter
            label={isLive ? "Class answers" : "Sample answers"}
            value={`${answersRead}`}
            sub={`of ${totalAnswers} read`}
          />
          <Counter
            label={isLive ? "Class patterns" : "Sample patterns"}
            value={clustersFound ? `${clustersFound}` : "—"}
            sub="found"
          />
          <Counter label={isLive ? "Class labels" : "Sample labels"} value={labelled ? `${labelled}` : "—"} sub="named" />
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
