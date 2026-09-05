import { NextResponse, type NextRequest } from "next/server";
import {
  geminiRequestCapacity,
  geminiRequestsPerMinute,
  isPipelineConfigured,
} from "@/lib/pipeline/gemini";
import { estimateMaximumPipelineRequests, runPipeline } from "@/lib/pipeline/run";
import { persistRun } from "@/lib/db/persist";
import { authorizeAiRequest } from "@/lib/server/ai-access";
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

// Keep cleanup and response-flush time inside Next's 300-second ceiling.
export const maxDuration = 300;

const MAX_BODY_BYTES = 1024 * 1024;
const RUN_BUDGET_MS = 270_000;

interface RunRequest {
  input: PipelineInput;
  prediction?: string | null;
  courseCode?: string;
  courseTitle?: string;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

class BodyReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isFinite(size) || size < 0) {
      throw new BodyReadError("Invalid Content-Length header.", 400);
    }
    if (size > MAX_BODY_BYTES) {
      throw new BodyReadError("Request body exceeds the 1 MiB limit.", 413);
    }
  }

  if (!request.body) throw new BodyReadError("Request body was not valid JSON.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyReadError("Request body exceeds the 1 MiB limit.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError("Request body was not valid JSON.", 400);
  }
}

function optionalString(
  value: unknown,
  name: string,
  maxLength: number,
): { value: string | null | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (typeof value !== "string") return { error: `${name} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { error: `${name} is too long.` };
  return { value: trimmed };
}

function validate(body: unknown): RunRequest | string {
  if (typeof body !== "object" || body === null) return "Malformed request body.";
  const { input, prediction, courseCode, courseTitle } = body as RunRequest;

  if (!input || typeof input !== "object") return "Missing pipeline input.";
  if (typeof input.question !== "string" || input.question.trim().length === 0) {
    return "A question is required.";
  }
  if (input.question.length > 20_000) return "The question is too long.";
  if (typeof input.scheme !== "string" || input.scheme.trim().length === 0) {
    return "A marking scheme is required.";
  }
  if (input.scheme.length > 20_000) return "The marking scheme is too long.";
  if (!Array.isArray(input.criteria) || input.criteria.length === 0) {
    return "At least one marking criterion is required.";
  }
  if (input.criteria.length > 50) return "At most 50 marking criteria are allowed.";
  if (!Array.isArray(input.answers) || input.answers.length < 2) {
    return "At least two student answers are required.";
  }
  if (input.answers.length > 100) return "At most 100 student answers are allowed.";
  if (input.answers.some((a) => typeof a !== "object" || a === null)) {
    return "Every answer must be an object.";
  }
  if (input.answers.some((a) => typeof a?.text !== "string" || !a.text.trim())) {
    return "Every answer needs some text.";
  }
  if (input.answers.some((a) => a.text.length > 10_000)) {
    return "Each student answer must be at most 10,000 characters.";
  }
  if (
    input.answers.some(
      (a) =>
        a.studentRef !== undefined &&
        (typeof a.studentRef !== "string" || a.studentRef.length > 200),
    )
  ) {
    return "Student references must be text of at most 200 characters.";
  }

  const ids = new Set<string>();
  for (const criterion of input.criteria) {
    if (!criterion || typeof criterion !== "object") return "Every criterion must be an object.";
    if (typeof criterion.id !== "string" || !criterion.id.trim()) {
      return "Every criterion needs an id.";
    }
    if (ids.has(criterion.id.trim())) return "Criterion ids must be unique.";
    ids.add(criterion.id.trim());
    if (typeof criterion.label !== "string" || !criterion.label.trim()) {
      return "Every criterion needs a label.";
    }
    if (
      typeof criterion.marks !== "number" ||
      !Number.isFinite(criterion.marks) ||
      !Number.isInteger(criterion.marks) ||
      criterion.marks <= 0 ||
      criterion.marks > 1000
    ) {
      return "Criterion marks must be whole numbers greater than 0 and at most 1,000.";
    }
  }

  const subject = optionalString(input.subject, "Subject", 200);
  if ("error" in subject) return subject.error;
  const level = optionalString(input.level, "Level", 200);
  if ("error" in level) return level.error;
  const safePrediction = optionalString(prediction, "Prediction", 10_000);
  if ("error" in safePrediction) return safePrediction.error;
  const safeCourseCode = optionalString(courseCode, "Course code", 100);
  if ("error" in safeCourseCode) return safeCourseCode.error;
  const safeCourseTitle = optionalString(courseTitle, "Course title", 300);
  if ("error" in safeCourseTitle) return safeCourseTitle.error;

  return {
    input: {
      question: input.question.trim(),
      scheme: input.scheme.trim(),
      criteria: input.criteria.map((c) => ({
        id: c.id.trim(),
        label: c.label.trim(),
        marks: c.marks,
      })),
      subject: subject.value ?? "",
      level: level.value ?? "",
      answers: input.answers.map((a) => ({
        studentRef:
          typeof a.studentRef === "string" ? a.studentRef.trim().slice(0, 200) : "",
        text: a.text.trim(),
      })),
    },
    prediction: safePrediction.value ?? null,
    courseCode: safeCourseCode.value ?? undefined,
    courseTitle: safeCourseTitle.value ?? undefined,
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
    body = await readBoundedJson(request);
  } catch (error) {
    const failure = error as BodyReadError;
    return NextResponse.json({ error: failure.message }, { status: failure.status ?? 400 });
  }

  const validated = validate(body);
  if (typeof validated === "string") return badRequest(validated);

  const maximumRequests = estimateMaximumPipelineRequests(
    validated.input.answers.length,
  );
  const requestCapacity = geminiRequestCapacity(RUN_BUDGET_MS);
  if (maximumRequests > requestCapacity) {
    return NextResponse.json(
      {
        error: `This batch can require ${maximumRequests} AI requests, but the configured ${geminiRequestsPerMinute()} RPM limit can admit ${requestCapacity} within the run time budget. Use a smaller batch or raise GEMINI_RPM only when your provider quota supports it.`,
        code: "batch_exceeds_runtime",
      },
      { status: 422 },
    );
  }

  const authorization = await authorizeAiRequest("run");
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const budget = new AbortController();
      const abort = () => budget.abort(request.signal.reason);
      request.signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(
        () => budget.abort(new Error("The run exceeded its run time budget.")),
        RUN_BUDGET_MS,
      );
      const send = (event: Record<string, unknown>) => {
        if (!request.signal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      try {
        const result = await runPipeline(
          validated.input,
          (progress: StageProgress) => {
            send({ type: "progress", ...progress });
            if (progress.warning) {
              send({ type: "warning", message: progress.warning });
            }
          },
          { signal: budget.signal },
        );

        // Persistence is best effort. A lecturer who has waited for a run
        // for a diagnosis must not lose it because a database write failed —
        // the run is returned either way, and the client keeps it in memory.
        let sessionId: string | null = null;
        let finalResult = result;

        try {
          const saved = await persistRun({
            supabase: authorization.supabase,
            ownerId: authorization.userId,
            input: validated.input,
            result,
            prediction: validated.prediction ?? null,
            courseCode: validated.courseCode,
            courseTitle: validated.courseTitle,
          });
          sessionId = saved.sessionId;
          finalResult = saved.result ?? result;
        } catch {
          send({
            type: "warning",
            message:
              "The run finished but could not be saved. Keep this result open and try saving again.",
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
        clearTimeout(timer);
        request.signal.removeEventListener("abort", abort);
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
