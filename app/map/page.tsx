"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";
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
import { TOTAL_ANSWERS } from "@/lib/mock";
import type { SortMode } from "@/lib/types";

/** Fixed canvas slots. Rank sets the slot; the vertical offset is stable per
 *  cluster, standing in for embedding-space proximity. */
const SLOTS = [
  { x: 200, y: 210 },
  { x: 495, y: 165 },
  { x: 715, y: 255 },
  { x: 905, y: 150 },
  { x: 980, y: 300 },
];

export default function MapPage() {
  const router = useRouter();
  const { clusters, sortMode, setSortMode, answers } = useSession();
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

  const other = clusters.find((c) => c.isOther);
  const maxCount = Math.max(1, ...ranked.map((c) => c.memberIds.length));
  const top = ranked[0];

  const headline = top
    ? sortMode === "spread"
      ? `The largest affects ${((top.memberIds.length / TOTAL_ANSWERS) * 100).toFixed(0)}% of your class.`
      : `The most damaging threatens ${top.downstream.length} later topics.`
    : "No misconceptions found in this batch.";

  return (
    <Page
      eyebrow="Step 4 of 7"
      title="Misconception map"
      lead={
        <>
          <b className="text-ink font-semibold">
            {ranked.length} misconception{ranked.length === 1 ? "" : "s"} found across{" "}
            {TOTAL_ANSWERS} answers.
          </b>{" "}
          {headline}
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
            <CardHead
              title={sortMode === "spread" ? "Sorted by spread" : "Sorted by damage"}
              hint={
                sortMode === "spread"
                  ? "Number of students holding the belief"
                  : "Severity × spread — what the belief blocks next"
              }
            />
            <div className="px-5 py-4 text-[13px] text-ink-2 flex gap-2.5">
              <Info size={16} strokeWidth={1.9} className="text-brand shrink-0 mt-0.5" aria-hidden />
              <p>
                {sortMode === "spread" ? (
                  <>
                    Size alone can mislead. A belief held by a quarter of the class that poisons
                    the next three topics is more urgent than a bigger slip that stops here.{" "}
                    <button
                      onClick={() => setSortMode("damage")}
                      className="text-brand font-medium underline underline-offset-2 hover:text-brand-hover"
                    >
                      Sort by damage
                    </button>{" "}
                    to see that.
                  </>
                ) : (
                  <>
                    Damage is severity multiplied by spread, and every score is justified by the
                    named topics it blocks — never a bare number.{" "}
                    <button
                      onClick={() => setSortMode("spread")}
                      className="text-brand font-medium underline underline-offset-2 hover:text-brand-hover"
                    >
                      Sort by spread
                    </button>{" "}
                    to compare.
                  </>
                )}
              </p>
            </div>
          </Card>

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
                    of {TOTAL_ANSWERS}
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
        </>
      }
    >
      {/* ---------------- Bubble canvas ---------------- */}
      <Card className="overflow-hidden">
        <div className="px-5 sm:px-6 py-3.5 border-b border-border flex items-center justify-between gap-3">
          <span className="label-caps text-ink-3">
            Area ∝ students affected · left to right by {sortMode}
          </span>
          <span className="text-[12.5px] text-ink-3 hidden sm:block">Select a bubble to open it</span>
        </div>

        <div className="bg-surface-2/50 px-2 py-2">
          <svg
            viewBox="0 0 1000 420"
            className="w-full h-auto block"
            role="img"
            aria-label={`Misconception map: ${ranked.length} clusters sorted by ${sortMode}`}
          >
            {ranked.map((c, i) => {
              const slot = SLOTS[Math.min(i, SLOTS.length - 1)];
              const r = Math.sqrt(c.memberIds.length / maxCount) * 92 + 26;
              const pct = (c.memberIds.length / TOTAL_ANSWERS) * 100;
              const active = hover === c.id;
              return (
                <g
                  key={c.id}
                  className="cursor-pointer transition-transform duration-500 ease-out focus:outline-none"
                  style={{ transform: `translate(${slot.x}px, ${slot.y}px)` }}
                  onMouseEnter={() => setHover(c.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(c.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => router.push(`/clusters/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/clusters/${c.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`${c.label}. ${c.memberIds.length} students, ${pct.toFixed(0)} percent of the class. Open cluster.`}
                >
                  {active ? (
                    <circle
                      r={r + 7}
                      fill="none"
                      stroke={toneColor(c.tone)}
                      strokeWidth={1.5}
                      strokeOpacity={0.4}
                    />
                  ) : null}
                  <circle
                    r={r}
                    fill={toneColor(c.tone)}
                    fillOpacity={active ? 0.28 : 0.16}
                    stroke={toneColor(c.tone)}
                    strokeWidth={active ? 3 : 2}
                    className="transition-all duration-200"
                  />
                  <text
                    textAnchor="middle"
                    y={-2}
                    fill={toneColor(c.tone)}
                    className="font-display"
                    style={{ fontSize: 34, fontWeight: 600 }}
                  >
                    {pct.toFixed(0)}%
                  </text>
                  <text
                    textAnchor="middle"
                    y={24}
                    fill="var(--ink-2)"
                    style={{ fontSize: 15 }}
                  >
                    {c.memberIds.length} students
                  </text>
                  <text
                    textAnchor="middle"
                    y={-r - 12}
                    fill="var(--ink-3)"
                    style={{ fontSize: 14, letterSpacing: "0.08em" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </Card>

      {/* ---------------- Ranked list ---------------- */}
      <Card>
        <CardHead
          title="Clusters in order"
          hint="Every cluster opens onto the answers that justify it"
        />
        <ul className="divide-y divide-border">
          {ranked.map((c, i) => {
            const pct = (c.memberIds.length / TOTAL_ANSWERS) * 100;
            const damage = c.severity * c.memberIds.length;
            return (
              <li key={c.id}>
                <Link
                  href={`/clusters/${c.id}`}
                  onMouseEnter={() => setHover(c.id)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 transition-colors",
                    hover === c.id ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="grid place-items-center w-7 h-7 rounded-full shrink-0 text-[12px] font-semibold tnum text-white"
                      style={{ background: toneColor(c.tone) }}
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
                    <span className="text-right w-[70px]">
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
      </Card>

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

      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Badge tone="neutral">Threshold 0.32</Badge>
        <Badge tone="neutral">Average linkage</Badge>
        <Badge tone="neutral">Cosine distance</Badge>
        <span className="text-[13px] text-ink-3">
          Clustering runs in the app, not in an external service.
        </span>
      </div>
    </Page>
  );
}
