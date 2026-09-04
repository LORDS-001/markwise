"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CircleCheck, CircleHelp, Loader2, Send, TriangleAlert } from "lucide-react";
import { Button, Card, CardHead, Textarea, cn } from "@/components/ui";
import { MarkwiseLogo } from "@/components/logo";
import { ANSWERS, CLUSTERS, RETEACH_PACKS } from "@/lib/mock";
import { recordDiagnosticResponses } from "@/lib/diagnostic-store";
import type { DiagnosticResponse, DiagnosticVerdict } from "@/lib/types";

/**
 * One student's diagnostic — PRD v2 §5 step 7.
 *
 * Deliberately outside the lecturer's shell: no navigation, no session
 * progress, no other student's work. A student reaching this page has no
 * account and should see exactly one thing — their own misconception, and the
 * two questions that test it.
 */

interface Question {
  prompt: string;
  holderAnswers: string;
  correctedAnswers: string;
}

interface Diagnostic {
  answerId: string;
  clusterLabel: string;
  clusterWhy: string;
  lesson: { heading: string; body: string }[];
  questions: Question[];
}

/**
 * Resolves a token against the seeded class.
 *
 * The demo has to work with no database, so the seeded tokens resolve locally.
 * A saved run resolves server-side instead, through a function scoped to one
 * token — never by searching a list held in the browser.
 */
function demoDiagnostic(token: string): Diagnostic | null {
  const answer = ANSWERS.find((a) => a.diagnosticToken === token);
  if (!answer?.clusterId) return null;

  const cluster = CLUSTERS.find((c) => c.id === answer.clusterId);
  if (!cluster || cluster.isOther) return null;

  const pack = RETEACH_PACKS[cluster.id];
  return {
    answerId: answer.id,
    clusterLabel: cluster.label,
    clusterWhy: cluster.why,
    lesson: pack?.lesson ?? [],
    questions: pack?.diagnostics ?? [],
  };
}

export default function StudentDiagnosticPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  // The seeded class resolves during render: it is a pure function of the
  // token, so it renders on the server with no loading flash and no hydration
  // mismatch. Only a saved run needs the round trip below.
  const local = useMemo(() => demoDiagnostic(token), [token]);

  const [loading, setLoading] = useState(local === null);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(local);
  const [responses, setResponses] = useState<string[]>(
    local ? local.questions.map(() => "") : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [verdicts, setVerdicts] = useState<
    { verdict: DiagnosticVerdict; rationale: string }[] | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Already resolved from the seeded class during render.
    if (local) return;

    let cancelled = false;

    async function load() {
      try {
        const { diagnosticForTokenAction } = await import("@/app/actions");
        const remote = await diagnosticForTokenAction(token);
        if (cancelled) return;
        if (remote) {
          setDiagnostic({
            answerId: token,
            clusterLabel: remote.clusterLabel,
            clusterWhy: remote.clusterWhy,
            lesson: remote.lesson,
            questions: remote.diagnostics,
          });
          setResponses(remote.diagnostics.map(() => ""));
          setDone(remote.alreadyDone);
        }
      } catch {
        // Falls through to the not-found state below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, local]);

  const answered = useMemo(
    () => responses.some((r) => r.trim().length > 0),
    [responses],
  );

  const submit = useCallback(async () => {
    if (!diagnostic || submitting) return;
    setSubmitting(true);
    setNotice(null);

    try {
      const { submitDiagnosticAction } = await import("@/app/actions");
      const result = await submitDiagnosticAction({
        token,
        misconception: diagnostic.clusterLabel,
        questions: diagnostic.questions,
        responses,
      });

      const graded: DiagnosticResponse[] = diagnostic.questions.map((_, index) => ({
        answerId: diagnostic.answerId,
        questionIndex: index,
        responseText: responses[index] ?? "",
        verdict: result.ok ? result.verdicts[index]?.verdict ?? null : null,
        rationale: result.ok ? (result.verdicts[index]?.rationale ?? "") : "",
      }));

      recordDiagnosticResponses(graded);
      setDone(true);

      if (result.ok) setVerdicts(result.verdicts);
      else setNotice(result.error);
    } catch {
      setNotice(
        "Something went wrong sending your answers. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [diagnostic, responses, submitting, token]);

  if (loading) {
    return (
      <Frame>
        <div className="flex items-center gap-2 text-ink-2 text-[14px]">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Loading your check…
        </div>
      </Frame>
    );
  }

  if (!diagnostic) {
    return (
      <Frame>
        <Card>
          <div className="px-6 py-8 text-center">
            <CircleHelp
              size={26}
              strokeWidth={1.6}
              className="mx-auto mb-3 text-ink-3"
              aria-hidden
            />
            <h1 className="font-display text-[20px] font-semibold">
              This link doesn&apos;t open anything
            </h1>
            <p className="mt-2 text-[13.5px] text-ink-2 max-w-[46ch] mx-auto">
              It may have been mistyped, or the session it belonged to may have
              been removed. Ask whoever sent it for a new one.
            </p>
          </div>
        </Card>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <header>
          <span className="label-caps text-brand">A quick check</span>
          <h1 className="font-display text-[24px] sm:text-[28px] font-semibold leading-tight mt-1">
            {diagnostic.clusterLabel}
          </h1>
          {diagnostic.clusterWhy ? (
            <p className="text-[14px] text-ink-2 mt-2 max-w-[62ch]">
              {diagnostic.clusterWhy}
            </p>
          ) : null}
        </header>

        {diagnostic.lesson.length > 0 ? (
          <Card>
            <CardHead
              title="Read this first"
              hint="Five minutes, then two questions"
            />
            <div className="px-5 py-4 flex flex-col gap-4">
              {diagnostic.lesson.map((section, i) => (
                <section key={i}>
                  <h2 className="text-[14px] font-semibold mb-1">
                    {section.heading}
                  </h2>
                  <p className="text-[13.5px] leading-relaxed text-ink-2">
                    {section.body}
                  </p>
                </section>
              ))}
            </div>
          </Card>
        ) : null}

        {diagnostic.questions.length === 0 ? (
          <Card>
            <p className="px-5 py-6 text-[13.5px] text-ink-2">
              There are no questions attached to this check yet.
            </p>
          </Card>
        ) : (
          <Card>
            <CardHead
              title="Two questions"
              hint="Answer in your own words — there is no mark for this"
            />
            <div className="px-5 py-5 flex flex-col gap-6">
              {diagnostic.questions.map((question, index) => {
                const verdict = verdicts?.[index];
                return (
                  <div key={index}>
                    <p className="text-[14px] font-medium mb-2">
                      <span className="label-caps text-ink-3 mr-2">
                        {index + 1}
                      </span>
                      {question.prompt}
                    </p>
                    <Textarea
                      rows={4}
                      value={responses[index] ?? ""}
                      disabled={done}
                      aria-label={`Your answer to question ${index + 1}`}
                      onChange={(e) =>
                        setResponses((prev) =>
                          prev.map((r, i) => (i === index ? e.target.value : r)),
                        )
                      }
                      placeholder="Explain your reasoning…"
                    />
                    {verdict ? (
                      <div
                        className={cn(
                          "mt-2 flex gap-2 rounded-[10px] border px-3 py-2 text-[13px]",
                          verdict.verdict === "corrected"
                            ? "border-ok-line bg-ok-soft"
                            : verdict.verdict === "holds"
                              ? "border-warn-line bg-warn-soft"
                              : "border-border bg-surface-2",
                        )}
                      >
                        {verdict.verdict === "corrected" ? (
                          <CircleCheck
                            size={16}
                            className="mt-0.5 shrink-0 text-ok"
                            aria-hidden
                          />
                        ) : (
                          <CircleHelp
                            size={16}
                            className="mt-0.5 shrink-0 text-ink-3"
                            aria-hidden
                          />
                        )}
                        <span className="text-ink-2">{verdict.rationale}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {!done ? (
              <div className="px-5 pb-5">
                <Button onClick={submit} disabled={!answered || submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={16} strokeWidth={2} aria-hidden />
                      Send my answers
                    </>
                  )}
                </Button>
                {!answered ? (
                  <p className="text-[12.5px] text-ink-3 mt-2">
                    Answer at least one question first.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="px-5 pb-5">
                {/* Suppressed when a notice is showing: that already says the
                    answers were recorded, and saying it twice reads as though
                    something happened twice. */}
                {notice ? null : (
                  <p className="text-[13.5px] text-ink-2" role="status">
                    Thanks — your answers were recorded.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {notice ? (
          <Card className="border-warn-line bg-warn-soft">
            <div className="flex gap-3 px-5 py-3.5" role="status">
              <TriangleAlert
                size={17}
                className="mt-0.5 shrink-0 text-warn"
                aria-hidden
              />
              <span className="text-[13px] text-ink-2">{notice}</span>
            </div>
          </Card>
        ) : null}
      </div>
    </Frame>
  );
}

/** No shell: a student is not inside the lecturer's session. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-surface-2 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[46rem] flex flex-col gap-6">
        <MarkwiseLogo className="h-6 w-auto" />
        {children}
        <p className="text-[12px] text-ink-3">
          Only your own answer is shown here. Nothing you write is shared with
          other students.
        </p>
      </div>
    </main>
  );
}
