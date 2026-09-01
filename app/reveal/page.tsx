"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, MessageSquareQuote, Target, Users } from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { Page } from "@/components/shell";
import { Badge, Card, EmptyState, buttonClass, cn, toneColor } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { TOTAL_ANSWERS } from "@/lib/mock";

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "on",
  "they", "them", "their", "most", "will", "that", "it", "be", "with", "up",
  "get", "got", "wrong", "students", "student", "this", "at", "by", "from",
  "how", "what", "when", "not", "do", "does", "mess", "forget", "think",
]);

function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

type Verdict = "matched" | "partial" | "missed";

export default function RevealPage() {
  const { prediction, clusters, answers, processed } = useSession();

  const ranked = useMemo(
    () =>
      clusters
        .filter((c) => !c.isOther && c.memberIds.length > 0)
        .sort((a, b) => b.memberIds.length - a.memberIds.length),
    [clusters],
  );

  const top = ranked[0];

  const verdict: Verdict = useMemo(() => {
    if (!top || !prediction.trim()) return "missed";
    const pred = tokens(prediction);
    const signatures = answers
      .filter((a) => a.clusterId === top.id)
      .map((a) => a.errorSignature ?? "")
      .join(" ");
    const actual = tokens(`${top.label} ${signatures}`);
    let hits = 0;
    pred.forEach((t) => {
      if (actual.has(t)) hits++;
    });
    const ratio = pred.size ? hits / pred.size : 0;
    if (ratio >= 0.5) return "matched";
    if (ratio >= 0.2) return "partial";
    return "missed";
  }, [prediction, top, answers]);

  if (!prediction.trim()) {
    return (
      <Page eyebrow="Step 3 of 7" title="Reveal">
        <Card>
          <EmptyState
            icon={<Target size={26} strokeWidth={1.6} />}
            title="No prediction was entered"
            body="The reveal compares your prediction with the leading misconception in the sample evidence. Add a prediction on the setup screen before the next preview."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/" className={buttonClass("secondary", "md")}>
                  Back to setup
                </Link>
                <Link href="/map" className={buttonClass("primary", "md")}>
                  Skip to the map
                  <ArrowRight size={16} strokeWidth={2} aria-hidden />
                </Link>
              </div>
            }
          />
        </Card>
      </Page>
    );
  }

  if (!processed || !top) {
    return (
      <Page eyebrow="Step 3 of 7" title="Reveal">
        <Card>
          <EmptyState
            icon={<Target size={26} strokeWidth={1.6} />}
            title="The sample analysis isn't ready yet"
            body="Prepare the sample analysis before comparing your prediction with its leading misconception."
            action={
              <Link href="/processing" className={buttonClass("primary", "md")}>
                Preview sample analysis
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
            }
          />
        </Card>
      </Page>
    );
  }

  const share = (top.memberIds.length / TOTAL_ANSWERS) * 100;

  const copy: Record<Verdict, { badge: string; head: string; body: string; tone: string }> = {
    matched: {
      badge: "Match",
      head: "Your prediction appears in the sample evidence.",
      body: "The leading misconception and its evidence signatures contain the reasoning you expected.",
      tone: "ok",
    },
    partial: {
      badge: "Partial match",
      head: "Part of your prediction appears in the sample evidence.",
      body: "The leading misconception contains some of the reasoning you expected, but the sample evidence also points elsewhere.",
      tone: "warn",
    },
    missed: {
      badge: "Miss",
      head: "The sample evidence points to a different misconception.",
      body: "The leading misconception does not contain the reasoning you expected in your prediction.",
      tone: "crit",
    },
  };

  const v = copy[verdict];

  return (
    <Page
      eyebrow="Step 3 of 7 · sample results"
      title="Compare your prediction"
      lead="See whether the misconception you expected appears in the sample evidence."
      actions={
        <Link href="/map" className={buttonClass("primary", "md")}>
          View misconception map
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      }
    >
      <Card>
        <div className="grid lg:grid-cols-[1fr_auto_1fr] items-stretch">
          {/* Prediction */}
          <section className="flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-border flex items-center gap-2">
              <MessageSquareQuote size={16} strokeWidth={1.9} className="text-ink-3" aria-hidden />
              <h2 className="text-[14px] font-semibold text-ink">Your prediction</h2>
            </div>
            <div className="px-5 sm:px-6 py-6 flex-1 flex items-center">
              <p className="font-display text-[20px] sm:text-[23px] leading-[1.35] text-ink-2 italic">
                &ldquo;{prediction}&rdquo;
              </p>
            </div>
            <div className="px-5 sm:px-6 py-3 border-t border-border text-[12.5px] text-ink-3">
              Entered before previewing the sample analysis
            </div>
          </section>

          {/* Divider */}
          <div className="hidden lg:flex flex-col items-center justify-center px-2">
            <div className="flex-1 w-px bg-border" />
            <span className="label-caps text-ink-3 py-3">vs</span>
            <div className="flex-1 w-px bg-border" />
          </div>

          {/* Actual */}
          <section
            className="flex flex-col border-t border-border lg:border-l-[3px] lg:border-t-0"
            style={{ borderLeftColor: toneColor(top.tone) }}
          >
            <div className="px-5 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users size={16} strokeWidth={1.9} className="text-ink-3" aria-hidden />
                <h2 className="text-[14px] font-semibold text-ink">What the sample shows</h2>
              </div>
              <Badge tone="neutral">Leading sample pattern</Badge>
            </div>
            <div className="px-5 sm:px-6 py-6 flex-1 flex flex-col justify-center gap-3">
              <p className="font-display text-[20px] sm:text-[23px] leading-[1.35] font-semibold">
                {top.label}
              </p>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-[34px] font-semibold tnum leading-none"
                  style={{ color: toneColor(top.tone) }}
                >
                  {share.toFixed(0)}%
                </span>
                <span className="text-[13.5px] text-ink-2">
                  of sample answers — {top.memberIds.length} of {TOTAL_ANSWERS}
                </span>
              </div>
            </div>
            <div className="px-5 sm:px-6 py-3 border-t border-border text-[12.5px] text-ink-3">
              Ranked by the number of sample answers affected
            </div>
          </section>
        </div>
      </Card>

      {/* Verdict */}
      <Card
        className={cn(
          "overflow-hidden",
          v.tone === "ok" && "border-ok-line bg-ok-soft",
          v.tone === "warn" && "border-warn-line bg-warn-soft",
          v.tone === "crit" && "border-crit-line bg-crit-soft",
        )}
      >
        <div className="px-5 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          <div className="min-w-0">
            <Badge
              tone={v.tone === "ok" ? "ok" : v.tone === "warn" ? "warn" : "crit"}
              className="mb-2.5 bg-surface"
            >
              {v.badge}
            </Badge>
            <h2 className="font-display text-[24px] sm:text-[30px] font-semibold leading-tight">
              {v.head}
            </h2>
            <p className="text-[14.5px] text-ink-2 mt-2 max-w-[58ch]">{v.body}</p>
          </div>
          <Link
            href={`/clusters/${top.id}`}
            className={buttonClass("secondary", "lg", "shrink-0 w-full sm:w-auto")}
          >
            Read the evidence
            <ArrowRight size={17} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </Card>

      <Disclosure
        title="How the comparison is decided"
        description="Optional detail about matching phrases"
      >
        <p>
          The preview compares meaningful phrases in the prediction with the leading
          misconception label and its evidence signatures.
        </p>
      </Disclosure>

      {/* Runners up */}
      {ranked.length > 1 ? (
        <Card>
          <div className="px-5 sm:px-6 py-4 border-b border-border">
            <h2 className="font-display text-[17px] font-semibold">
              Other patterns in the sample
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {ranked.slice(1).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clusters/${c.id}`}
                  className="flex items-center gap-3.5 px-5 sm:px-6 py-3.5 hover:bg-surface-2 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: toneColor(c.tone) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-[14px] font-medium truncate">
                    {c.label}
                  </span>
                  <span className="tnum text-[13px] text-ink-2 shrink-0">
                    {c.memberIds.length} sample answers ·{" "}
                    {((c.memberIds.length / TOTAL_ANSWERS) * 100).toFixed(0)}%
                  </span>
                  <ArrowRight size={15} strokeWidth={2} className="text-ink-3 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Page>
  );
}
