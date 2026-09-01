"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleX,
  Copy,
  Download,
  FileDown,
  Users,
} from "lucide-react";
import { Page } from "@/components/shell";
import { ActionArea } from "@/components/page-structure";
import {
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  buttonClass,
  toneColor,
} from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { RETEACH_PACKS, TOTAL_ANSWERS } from "@/lib/mock";

export default function ReteachPackPage() {
  const params = useParams<{ id: string }>();
  const { clusters, answers } = useSession();
  const [copied, setCopied] = useState(false);

  const cluster = clusters.find((c) => c.id === params.id);
  const members = useMemo(
    () => answers.filter((a) => a.clusterId === params.id),
    [answers, params.id],
  );
  const pack = RETEACH_PACKS[params.id];

  if (!cluster) {
    return (
      <Page eyebrow="Reteach pack" title="This cluster no longer exists">
        <Card>
          <EmptyState
            title="It was merged or rejected"
            body="Pick another cluster to generate a pack for."
            action={
              <Link href="/reteach" className={buttonClass("primary", "md")}>
                Back to reteach packs
              </Link>
            }
          />
        </Card>
      </Page>
    );
  }

  if (!pack) {
    return (
      <Page
        eyebrow={
          <Link href="/reteach" className="inline-flex items-center gap-1 hover:text-brand-hover">
            <ArrowLeft size={13} strokeWidth={2.2} aria-hidden />
            Reteach packs
          </Link>
        }
        title={cluster.label}
      >
        <Card>
          <EmptyState
            title="No sample pack for this cluster yet"
            body="This cluster was created by a split or merge, so a sample pack is not available for it yet."
            action={
              <Link href="/reteach" className={buttonClass("secondary", "md")}>
                Choose another cluster
              </Link>
            }
          />
        </Card>
      </Page>
    );
  }

  const markdown = buildMarkdown(cluster.label, pack, members.length);

  async function copyPack() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reteach-${cluster!.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadRoster() {
    const header = "student_id,initials,provisional_score,max_score\n";
    const rows = members
      .map((m) => [m.studentId, m.initials, m.provisionalScore, m.maxScore].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${cluster!.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Page
      eyebrow={
        <Link href="/reteach" className="inline-flex items-center gap-1 hover:text-brand-hover">
          <ArrowLeft size={13} strokeWidth={2.2} aria-hidden />
          Reteach packs
        </Link>
      }
      title={cluster.label}
      lead={`A five-minute sample lesson for the ${members.length} students who hold this belief.`}
      aside={
        <>
          <Card>
            <CardHead title="Who this is for" hint="Attach the roster when you send it" />
            <div className="px-5 py-4 flex items-center gap-4">
              <span
                className="grid place-items-center w-12 h-12 rounded-full shrink-0 text-white font-display text-[18px] font-semibold"
                style={{ background: toneColor(cluster.tone) }}
                aria-hidden
              >
                {members.length}
              </span>
              <div className="min-w-0 text-[13px] text-ink-2">
                students, {((members.length / TOTAL_ANSWERS) * 100).toFixed(0)}% of the class.
                Pull them aside, or send the pack to everyone and let it land where it needs to.
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Where to put it" />
            <ul className="px-5 py-4 flex flex-col gap-2.5 text-[13px] text-ink-2">
              <li>Paste the lesson into your Monday slides as one section.</li>
              <li>Send the diagnostic to the class group before the next lecture.</li>
              <li>Read the two rows below the questions — they tell you what each answer means.</li>
            </ul>
          </Card>

          <Card className="bg-surface-2">
            <div className="px-5 py-4 text-[13px] text-ink-2">
              <b className="text-ink font-semibold">Nothing here is generic.</b> The lesson names
              the belief, shows why it is intuitive, then shows exactly where it breaks — because
              a student who is told only that they are wrong will make the same move again.
            </div>
          </Card>
        </>
      }
    >
      <ActionArea note="Copy or download this sample lesson and its affected-student roster.">
        <Button variant="secondary" size="md" onClick={copyPack}>
          {copied ? (
            <Check size={16} strokeWidth={2.2} aria-hidden />
          ) : (
            <Copy size={16} strokeWidth={1.9} aria-hidden />
          )}
          Copy lesson
        </Button>
        <Button variant="secondary" size="md" onClick={downloadMarkdown}>
          <FileDown size={16} strokeWidth={1.9} aria-hidden />
          Download Markdown
        </Button>
        <Button variant="secondary" size="md" onClick={downloadRoster}>
          <Download size={16} strokeWidth={2} aria-hidden />
          Download roster CSV
        </Button>
        <span aria-live="polite" aria-atomic="true" className="text-[13px] text-ink-2">
          {copied ? "Copied" : ""}
        </span>
      </ActionArea>

      {/* Micro-lesson */}
      <Card>
        <CardHead
          title={`Micro-lesson: ${pack.lesson[0]?.heading ?? cluster.label}`}
          hint="Start with the objective, then use the explanation and worked example."
          action={<Badge tone="brand">~5 min</Badge>}
        />
        <div className="px-5 sm:px-8 py-6 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[18px] font-semibold">Objective</h3>
            <p className="text-[15px] leading-[1.65] text-ink-2 max-w-[68ch]">
              Recognise and correct the misconception before answering the diagnostic.
            </p>
          </section>
          {pack.lesson.map((section, i) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h3 className="flex items-baseline gap-2.5 font-display text-[18px] font-semibold">
                <span className="label-caps text-ink-3 tnum">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {i === 0 ? "Explanation" : i === 2 ? "Worked example" : section.heading}
              </h3>
              {section.body.split("\n\n").map((para, j) => (
                <p key={j} className="text-[15px] leading-[1.65] text-ink-2 max-w-[68ch]">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Card>

      {/* Diagnostics */}
      {pack.diagnostics.length > 0 ? (
        <Card>
          <CardHead
            title="Two-question diagnostic"
            hint="A student holding this belief fails these. A student who has corrected it passes."
          />
          <ol className="flex flex-col gap-3 px-3 py-3 sm:px-4">
            {pack.diagnostics.map((d, i) => (
              <li key={i}>
                <Card className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-3">
                      <span
                        className="grid place-items-center w-7 h-7 rounded-full shrink-0 text-[13px] font-semibold text-white tnum"
                        style={{ background: toneColor(cluster.tone) }}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <p className="text-[15.5px] leading-relaxed font-medium max-w-[68ch]">
                        {d.prompt}
                      </p>
                    </div>

                    <details className="sm:ml-10 rounded-[12px] border border-border bg-surface-2">
                      <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold text-ink">
                        Reveal diagnostic responses
                      </summary>
                      <div className="grid gap-3 border-t border-border px-4 py-4 sm:grid-cols-2">
                        <div className="rounded-[12px] border border-crit-line bg-crit-soft px-4 py-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <CircleX size={14} strokeWidth={2.2} className="text-crit" aria-hidden />
                            <span className="label-caps text-crit">Still holds the belief</span>
                          </div>
                          <p className="text-[13px] text-ink-2 leading-relaxed">
                            {d.holderAnswers}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-ok-line bg-ok-soft px-4 py-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <CircleCheck size={14} strokeWidth={2.2} className="text-ok" aria-hidden />
                            <span className="label-caps text-ok">Has corrected it</span>
                          </div>
                          <p className="text-[13px] text-ink-2 leading-relaxed">
                            {d.correctedAnswers}
                          </p>
                        </div>
                      </div>
                    </details>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <p className="text-[13px] text-ink-2 flex items-center gap-2">
          <Users size={15} strokeWidth={1.9} className="text-ink-3" aria-hidden />
          Roster attached — the finding converts straight into an action.
        </p>
        <Link href={`/clusters/${cluster.id}`} className={buttonClass("ghost", "sm")}>
          Back to the evidence
        </Link>
      </div>
    </Page>
  );
}

function buildMarkdown(
  label: string,
  pack: { lesson: { heading: string; body: string }[]; diagnostics: { prompt: string }[] },
  count: number,
) {
  const lines = [
    `# Reteach: ${label}`,
    ``,
    `_Affects ${count} students in this class._`,
    ``,
    `## Five-minute micro-lesson`,
    ``,
  ];
  for (const s of pack.lesson) {
    lines.push(`### ${s.heading}`, ``, s.body, ``);
  }
  if (pack.diagnostics.length) {
    lines.push(`## Diagnostic`, ``);
    pack.diagnostics.forEach((d, i) => lines.push(`${i + 1}. ${d.prompt}`, ``));
  }
  lines.push(`---`, `Sample pack for classroom review.`);
  return lines.join("\n");
}
