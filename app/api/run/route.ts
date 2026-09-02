import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { isPipelineConfigured } from "@/lib/pipeline/gemini";
import { runPipeline } from "@/lib/pipeline/run";
import { persistRun } from "@/lib/db/persist";
import type { PipelineInput, StageProgress } from "@/lib/pipeline/types";

/**
 * Runs the pipeline and streams stage progress as it goes.
 *
 * PRD §9 puts the pipeline behind server actions, and every mutation in this
 * app is one. The run itself is the exception: a server action resolves once,
 * so it can only report progress after the work it was reporting on is over.
 * PRD §7.2 requires live stage progress and calls it the product's
 * credibility, so the run streams NDJSON instead — one JSON object per line,
 * progress events followed by a terminal result or error event.
 */

// A 40-answer run is ~40 extraction calls plus a handful per cluster. The
// two-minute product budget in PRD §12 fits well inside this ceiling.
export const maxDuration = 300;

interface RunRequest {
  input: PipelineInput;
  prediction?: string | null;
  courseCode?: string;
  courseTitle?: string;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function validate(body: unknown): RunRequest | string {
  if (typeof body !== "object" || body === null) return "Malformed request body.";
  const { input, prediction, courseCode, courseTitle } = body as RunRequest;

  if (!input || typeof input !== "object") return "Missing pipeline input.";
  if (typeof input.question !== "string" || input.question.trim().length === 0) {
    return "A question is required.";
  }
  if (typeof input.scheme !== "string" || input.scheme.trim().length === 0) {
    return "A marking scheme is required.";
  }
  if (!Array.isArray(input.criteria) || input.criteria.length === 0) {
    return "At least one marking criterion is required.";
  }
  if (!Array.isArray(input.answers) || input.answers.length < 2) {
    return "At least two student answers are required.";
  }
  if (input.answers.some((a) => typeof a?.text !== "string" || !a.text.trim())) {
    return "Every answer needs some text.";
  }
  if (input.criteria.reduce((sum, c) => sum + (Number(c.marks) || 0), 0) <= 0) {
    return "The marking scheme must award at least one mark.";
  }

  return {
    input: {
      question: input.question.trim(),
      scheme: input.scheme.trim(),
      criteria: input.criteria.map((c) => ({
        id: String(c.id),
        label: String(c.label ?? ""),
        marks: Math.max(0, Number(c.marks) || 0),
      })),
      subject: String(input.subject ?? "").trim(),
      level: String(input.level ?? "").trim(),
      answers: input.answers.map((a) => ({
        studentRef: String(a.studentRef ?? "").trim(),
        text: String(a.text).trim(),
      })),
    },
    prediction: typeof prediction === "string" ? prediction : null,
    courseCode,
    courseTitle,
  };
}

export async function POST(request: NextRequest) {
  if (!isPipelineConfigured()) {
    return NextResponse.json(
      {
        error:
          "The marking pipeline is not configured on this deployment. Set GEMINI_API_KEY to run it on your own answers.",
        code: "not_configured",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body was not valid JSON.");
  }

  const validated = validate(body);
  if (typeof validated === "string") return badRequest(validated);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const result = await runPipeline(
          validated.input,
          (progress: StageProgress) => send({ type: "progress", ...progress }),
        );

        // Persistence is best effort. A lecturer who has waited two minutes
        // for a diagnosis must not lose it because a database write failed —
        // the run is returned either way, and the client keeps it in memory.
        let sessionId: string | null = null;
        let finalResult = result;

        try {
          const supabase = await getServerClient();
          if (supabase) {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const saved = await persistRun({
                supabase,
                ownerId: user.id,
                input: validated.input,
                result,
                prediction: validated.prediction ?? null,
                courseCode: validated.courseCode,
                courseTitle: validated.courseTitle,
              });
              sessionId = saved.sessionId;
              finalResult = saved.result;
            }
          }
        } catch (error) {
          send({
            type: "warning",
            message:
              error instanceof Error
                ? `The run finished but could not be saved: ${error.message}`
                : "The run finished but could not be saved.",
          });
        }

        send({ type: "result", sessionId, result: finalResult });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "The pipeline failed for an unknown reason.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Proxies that buffer would defeat the point of streaming progress.
      "X-Accel-Buffering": "no",
    },
  });
}
