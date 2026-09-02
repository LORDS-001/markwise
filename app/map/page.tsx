"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Network, TriangleAlert } from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import {
  Badge,
  Card,
  CardHead,
  Segmented,
  buttonClass,
  cn,
  toneColor,
} from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { canRenderBubbleMap, placeBubbles } from "@/lib/cluster-layout";
import { clusterToneClasses } from "@/lib/cluster-tone";
import type { SortMode } from "@/lib/types";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 420;

export default function MapPage() {
  const router = useRouter();
  const { clusters, sortMode, setSortMode, answers, totalAnswers } = useSession();
  const [hover, setHover] = useState<string | null>(null);

  const correct = answers.filter((a) => a.isCorrect).length;

  const ranked = useMemo(() => {
    const live = clusters.filter((c) => !c.isOther && c.memberIds.length > 0);
    const sorted = [...live].sort((a, b) =>
      sortMode === "spread"
        ? b.memberIds.length - a.memberIds.length
        : b.severity * b.memberIds.length - a.severity * a.memberIds.length,
    );
    return sorted;
  }, [clusters, sortMode]);

  const placements = useMemo(
    () =>
      placeBubbles(
        ranked.map((cluster) => ({
          id: cluster.id,
          weight: cluster.memberIds.length,
        })),
        MAP_WIDTH,
        MAP_HEIGHT,
      ),
    [ranked],
  );

  const other = clusters.find((c) => c.isOther);
  const top = ranked[0];

  const headline = top
    ? sortMode === "spread"
      ? `The largest affects ${((top.memberIds.length / totalAnswers) * 100).toFixed(0)}% of the sample class.`
      : `The most damaging threatens ${top.downstream.length} later topics.`
    : "No misconceptions were found in the sample class.";

  return (
    <Page
      eyebrow="Step 4 of 7"
      title="Misconception map"
      lead={
        <>
          Explore the misconception patterns in the sample class, ranked by the measure you
          choose. <b className="text-ink font-semibold">{headline}</b>
        </>
      }
      actions={
        <Segmented<SortMode>
          label="Sort clusters"
          value={sortMode}
          onChange={setSortMode}
          options={[
            { value: "spread", label: "By spread" },
            { value: "damage", label: "By damage" },
          ]}
        />
      }
      aside={
        <>
          <Card>
            <CardHead title="Correct answers" hint="Pooled separately, never clustered" />
            <div className="px-5 py-5 flex items-center gap-4">
              <span className="grid place-items-center w-12 h-12 rounded-full bg-ok-soft border border-ok-line text-ok shrink-0">
                <CheckCircle2 size={22} strokeWidth={1.9} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[24px] font-semibold tnum leading-none">
                  {correct}
                  <span className="text-[15px] text-ink-3 font-normal ml-1.5">
                    of {totalAnswers}
                  </span>
                </div>
                <p className="text-[13px] text-ink-2 mt-1">
                  No belief-level error found. These carry a provisional score but hold no
                  misconception.
                </p>
              </div>
            </div>
          </Card>

          {other && other.memberIds.length > 0 ? (
            <Card>
              <CardHead
                title="Other / one-off errors"
                hint={`${other.memberIds.length} answers that didn't group`}
              />
              <div className="px-5 py-4">
                <p className="text-[13px] text-ink-2 mb-3">
                  Singletons are collected here rather than shown as clusters — a group of one
                  is not a class pattern.
                </p>
                <Link href={`/clusters/${other.id}`} className={buttonClass("secondary", "sm")}>
                  Review them individually
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
              </div>
            </Card>
          ) : null}

          <Disclosure
            title="How prioritisation works"
            description={
              sortMode === "spread"
                ? "Currently ranked by students affected"
                : "Currently ranked by severity × spread"
            }
          >
            <div className="flex flex-col gap-3">
              <p>
                This page ranks seeded sample clusters for the preview; it does not process the
                lecturer entries from setup.
              </p>
              {sortMode === "spread" ? (
                <p>
                  Size alone can mislead. A smaller belief that blocks several later topics can be
                  more urgent than a bigger slip that stops here. Damage ranking combines severity
                  with spread.
                </p>
              ) : (
                <p>
                  Damage is severity multiplied by spread. The named downstream topics explain
                  what each belief may block, so the ranking is never presented as a bare number.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">Threshold 0.32</Badge>
                <Badge tone="neutral">Average linkage</Badge>
                <Badge tone="neutral">Cosine distance</Badge>
              </div>
            </div>
          </Disclosure>
        </>
      }
    >
      {!canRenderBubbleMap(ranked.length) && ranked.length > 0 ? (
        <Card className="border-dashed bg-surface-2">
          <div className="px-5 py-6 text-center">
            <Network size={20} className="mx-auto text-ink-3" aria-hidden />
            <h2 className="mt-2 text-[14px] font-bold text-ink">
              Map hidden at this cluster count
            </h2>
            <p className="mx-auto mt-1 max-w-[48ch] text-[12.5px] text-ink-2">
              Use the complete ranked list below to review every misconception clearly.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ---------------- Primary ranked list ---------------- */}
      <Card>
        <CardHead
          title="Prioritised misconceptions"
          hint="Every cluster link includes its spread and average mark loss"
        />
        {ranked.length > 0 ? (
          <ul className="divide-y divide-border">
            {ranked.map((c, i) => {
              const toneClasses = clusterToneClasses(c.tone);
              const pct = (c.memberIds.length / totalAnswers) * 100;
              const damage = c.severity * c.memberIds.length;
              const clusterAnswers = answers.filter((answer) =>
                c.memberIds.includes(answer.id),
              );
              const averageLoss =
                clusterAnswers.length > 0
                  ? clusterAnswers.reduce(
                      (sum, answer) => sum + answer.maxScore - answer.provisionalScore,
                      0,
                    ) / clusterAnswers.length
                  : 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/clusters/${c.id}`}
                    aria-label={`${c.label}. Spread: ${c.memberIds.length} students, ${pct.toFixed(0)} percent of the sample class. Average loss: ${averageLoss.toFixed(1)} marks. Open cluster.`}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c.id)}
                    onBlur={() => setHover(null)}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 transition-colors",
                      hover === c.id ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={cn(
                          "grid place-items-center w-7 h-7 rounded-full shrink-0 text-[12px] font-semibold tnum",
                          toneClasses.backgroundClass,
                          toneClasses.foregroundClass,
                        )}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium leading-snug">
                          {c.label}
                        </span>
                        <span className="block text-[13px] text-ink-2 mt-0.5">
                          {c.downstream.length > 0
                            ? `Threatens ${c.downstream.slice(0, 2).join(", ")}${c.downstream.length > 2 ? ` +${c.downstream.length - 2} more` : ""}`
                            : "No downstream topics identified"}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-4 shrink-0 pl-10 sm:pl-0">
                      <span className="text-right">
                        <span className="block tnum text-[15px] font-semibold">
                          {pct.toFixed(0)}%
                        </span>
                        <span className="block text-[12px] text-ink-3 tnum">
                          {c.memberIds.length} students
                        </span>
                      </span>
                      <span className="text-right w-[76px]">
                        <span className="block tnum text-[15px] font-semibold text-ink-2">
                          {averageLoss.toFixed(1)}
                        </span>
                        <span className="block text-[12px] text-ink-3">avg loss</span>
                      </span>
                      <span className="text-right w-[58px]">
                        <span
                          className={cn(
                            "block tnum text-[15px] font-semibold",
                            sortMode === "damage" ? "text-warn" : "text-ink-2",
                          )}
                        >
                          {damage}
                        </span>
                        <span className="block text-[12px] text-ink-3">damage</span>
                      </span>
                      <ArrowRight size={16} strokeWidth={2} className="text-ink-3" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-9 text-center sm:px-6">
            <Network size={20} className="mx-auto text-ink-3" aria-hidden />
            <h2 className="mt-2 text-[14px] font-bold text-ink">No misconceptions to map</h2>
            <p className="mx-auto mt-1 max-w-[48ch] text-[12.5px] text-ink-2">
              The sample class has no active misconception clusters to review.
            </p>
            <Link href="/" className={buttonClass("primary", "sm") + " mt-4"}>
              Return to setup
            </Link>
          </div>
        )}
      </Card>

      {/* ---------------- Supporting bubble map ---------------- */}
      {canRenderBubbleMap(ranked.length) ? (
        <Card className="overflow-hidden">
          <div className="px-5 sm:px-6 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <span className="label-caps text-ink-3">
              Supporting map · bubble size indicates students affected · ranked by {sortMode}
            </span>
            <span className="text-[12.5px] text-ink-3 hidden sm:block">
              Select a bubble to open it
            </span>
          </div>

          <div className="bg-surface-2/50 px-2 py-2">
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="w-full h-auto block"
              role="group"
              aria-label={`Misconception map: ${ranked.length} clusters sorted by ${sortMode}`}
            >
              {ranked.map((c, i) => {
                const placement = placements[i];
                const pct = (c.memberIds.length / totalAnswers) * 100;
                const active = hover === c.id;
                const percentageSize = Math.max(15, Math.min(30, placement.radius * 0.42));
                return (
                  <g
                    key={c.id}
                    className="cursor-pointer transition-transform duration-500 ease-out focus:outline-none"
                    style={{ transform: `translate(${placement.cx}px, ${placement.cy}px)` }}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => router.push(`/clusters/${c.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/clusters/${c.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`${c.label}. ${c.memberIds.length} students, ${pct.toFixed(0)} percent of the sample class. Open cluster.`}
                  >
                    {active ? (
                      <circle
                        r={placement.radius + 5}
                        fill="none"
                        stroke={toneColor(c.tone)}
                        strokeWidth={1.5}
                        strokeOpacity={0.4}
                      />
                    ) : null}
                    <circle
                      r={placement.radius}
                      fill={toneColor(c.tone)}
                      fillOpacity={active ? 0.28 : 0.16}
                      stroke={toneColor(c.tone)}
                      strokeWidth={active ? 3 : 2}
                      className="transition-all duration-200"
                    />
                    <text
                      textAnchor="middle"
                      y={percentageSize * 0.35}
                      fill={toneColor(c.tone)}
                      className="font-display"
                      style={{ fontSize: percentageSize, fontWeight: 600 }}
                    >
                      {pct.toFixed(0)}%
                    </text>
                    <text
                      textAnchor="middle"
                      y={-placement.radius - 8}
                      fill="var(--ink-3)"
                      style={{ fontSize: 13, letterSpacing: "0.08em" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Card>
      ) : null}

      {top && sortMode === "damage" ? (
        <Card className="border-warn-line bg-warn-soft">
          <div className="px-5 sm:px-6 py-4 flex gap-3">
            <TriangleAlert size={18} strokeWidth={1.9} className="text-warn shrink-0 mt-0.5" aria-hidden />
            <div className="text-[13.5px]">
              <p className="font-semibold mb-1">
                Sorting by damage changes which cluster you should teach first.
              </p>
              <p className="text-ink-2">
                &ldquo;{top.label}&rdquo; is not the biggest group, but it breaks{" "}
                {top.downstream.join(", ")}. Severity {top.severity} of 5.
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </Page>
  );
}
