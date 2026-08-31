"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import { Page } from "@/components/shell";
import { Badge, Card, CardHead, EmptyState, buttonClass, toneColor } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { TOTAL_ANSWERS } from "@/lib/mock";

export default function ReteachIndexPage() {
  const { clusters, sortMode } = useSession();

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
      title="Reteach packs"
      lead="Pick a misconception and Markwise writes a five-minute lesson against that specific false belief, plus two diagnostics that only a student who has corrected it can pass."
    >
      {ranked.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={26} strokeWidth={1.6} />}
            title="No clusters to teach against yet"
            body="Run the pipeline first. Reteach packs are generated per cluster, from the false belief the run identified."
            action={
              <Link href="/processing" className={buttonClass("primary", "md")}>
                Run the pipeline
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHead
            title="Choose a cluster"
            hint={`Ordered by ${sortMode === "spread" ? "how many students hold it" : "what it blocks next"}`}
          />
          <ul className="divide-y divide-border">
            {ranked.map((c) => {
              const pct = (c.memberIds.length / TOTAL_ANSWERS) * 100;
              return (
                <li key={c.id}>
                  <Link
                    href={`/reteach/${c.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 hover:bg-surface-2 transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 hidden sm:block"
                      style={{ background: toneColor(c.tone) }}
                      aria-hidden
                    />
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
                      {c.isOther ? (
                        <Badge tone="neutral">No shared belief</Badge>
                      ) : (
                        <Badge tone="warn">Severity {c.severity}/5</Badge>
                      )}
                      <ArrowRight size={16} strokeWidth={2} className="text-ink-3" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="bg-surface-2 border-border">
        <div className="px-5 sm:px-6 py-4 text-[13.5px] text-ink-2">
          <b className="text-ink font-semibold">Why two diagnostics, not five.</b> Each one is
          written so that a student still holding the belief gets it wrong and a student who has
          corrected it gets it right. A question both groups pass tells you nothing.
        </div>
      </Card>
    </Page>
  );
}
