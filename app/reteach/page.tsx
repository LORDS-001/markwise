"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import { Card, EmptyState, buttonClass, toneColor } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { TOTAL_ANSWERS } from "@/lib/mock";

export default function ReteachIndexPage() {
  const { clusters, sortMode, answers } = useSession();

  const ranked = useMemo(
    () =>
      clusters
        .filter((c) => c.memberIds.length > 0)
        .sort((a, b) =>
          sortMode === "spread"
            ? b.memberIds.length - a.memberIds.length
            : b.severity * b.memberIds.length - a.severity * a.memberIds.length,
        ),
    [clusters, sortMode],
  );

  return (
    <Page
      eyebrow="Step 5 of 7"
      title="Choose a misconception to reteach"
      lead="Open a sample teaching pack for one of the prioritised patterns."
    >
      {ranked.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={26} strokeWidth={1.6} />}
            title="No clusters to teach against yet"
            body="Review an active misconception cluster before opening its sample teaching pack."
            action={
              <Link href="/processing" className={buttonClass("primary", "md")}>
                Run the pipeline
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {ranked.map((c, index) => {
              const pct = (c.memberIds.length / TOTAL_ANSWERS) * 100;
              const clusterAnswers = answers.filter((answer) => c.memberIds.includes(answer.id));
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
                    href={`/reteach/${c.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 hover:bg-surface-2 transition-colors"
                  >
                    <span
                      className="grid w-7 h-7 rounded-full shrink-0 place-items-center text-[12px] font-semibold text-white tnum"
                      style={{ background: toneColor(c.tone) }}
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug">
                        {c.label}
                      </span>
                      <span className="flex items-center gap-1.5 text-[13px] text-ink-2 mt-1">
                        <Users size={13} strokeWidth={2} aria-hidden />
                        {c.memberIds.length} students · {pct.toFixed(0)}% of the class
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-right">
                        <span className="block text-[15px] font-semibold tnum">
                          {averageLoss.toFixed(1)}
                        </span>
                        <span className="block text-[12px] text-ink-3">avg loss</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
                        View pack
                        <ArrowRight size={16} strokeWidth={2} aria-hidden />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Disclosure
        title="What each pack contains"
        description="A short lesson and a diagnostic check"
      >
        <p>
          Each sample pack includes an explanation, a worked example, a quick diagnostic, and the
          affected-student roster.
        </p>
      </Disclosure>
    </Page>
  );
}
