import type { Criterion } from "@/lib/types";
import type { PipelineInput, RawAnswer } from "./types";

/**
 * Prompts for every model stage.
 *
 * The extraction prompt is the single highest-risk artefact in the project
 * (PRD §11): if it returns descriptions of answers instead of the beliefs
 * behind them, nothing downstream can recover — "student wrote the wrong
 * formula" will not cluster with anything, while "believes reactance does not
 * contribute to opposition" will. The few-shot block below therefore shows
 * both the wanted form and explicit rejections of the unwanted one.
 */

function criteriaBlock(criteria: Criterion[]): string {
  return criteria
    .map(
      (c) =>
        `- id "${c.id}" (${c.marks} mark${c.marks === 1 ? "" : "s"}): ${c.label}`,
    )
    .join("\n");
}

const EXTRACTION_SYSTEM = `You are an experienced university lecturer marking a batch of exam answers to one question.

You do two things in a single pass, because they are the same act of reading:
1. Name the FALSE BELIEF that produced the mistake.
2. Award the marking-scheme criteria the answer actually earned.

THE FALSE BELIEF IS THE HARD PART. Read these carefully.

An error_signature states what the student believes to be true about the world.
It must be a claim that could be written on a blackboard and argued with.

GOOD — these are beliefs, and they group with other students who share them:
  "believes impedance and resistance are interchangeable quantities"
  "believes reactance does not contribute to the opposition that limits current"
  "believes inductance is measured in millihenries by default"
  "believes the phase angle is measured between current and resistance"

BAD — these describe the answer, not the belief. They are useless, because two
students with the same misconception produce different descriptions and so
never group together. NEVER produce output of this shape:
  "used the wrong formula"       -> WHICH formula, and what did they think it meant?
  "did not show working"         -> that is a behaviour, not a belief
  "made a calculation error"     -> that is an outcome, not a belief
  "forgot to include reactance"  -> why did they think it could be left out?
  "answer is incomplete"         -> says nothing about what they think
  "misunderstood the question"   -> which part, and what did they take it to mean?

Rewrite every candidate signature until it begins with "believes " and names a
specific proposition the student is treating as true.

If an answer is fully correct, set is_correct true and error_signature empty.
If an answer is blank, off-topic, or too incoherent to diagnose, set
is_correct false and error_signature empty — do not invent a belief that is not
evidenced in the text.

evidence_span must be copied VERBATIM from the answer: the exact substring that
reveals the belief. Never paraphrase it. If no span reveals it, leave it empty.

confidence is your own certainty about the diagnosis and the score, from 0 to 1.
Be honest and use the low end: below 0.7 flags the answer for mandatory human
review, which is the safety mechanism of this whole product. An answer you had
to guess at should score well under 0.7.

Award criteria strictly against the scheme. criteria_met and criteria_missed
must together account for every criterion id, each appearing exactly once.
provisional_score must equal the sum of the marks of the criteria you met.`;

export function extractionSystemPrompt(): string {
  return EXTRACTION_SYSTEM;
}

export function extractionPrompt(
  input: PipelineInput,
  answer: RawAnswer,
): string {
  const total = input.criteria.reduce((sum, c) => sum + c.marks, 0);

  return `SUBJECT: ${input.subject}
LEVEL: ${input.level}

QUESTION AS THE STUDENTS SAW IT:
${input.question}

MARKING SCHEME / MODEL ANSWER:
${input.scheme}

CRITERIA (award against these ids exactly):
${criteriaBlock(input.criteria)}

TOTAL MARKS AVAILABLE: ${total}

STUDENT ANSWER (id ${answer.studentRef}):
---
${answer.text}
---

Diagnose this answer and award its criteria.`;
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    is_correct: { type: "boolean" },
    error_signature: {
      type: "string",
      description:
        "The false belief, starting with the word believes. Empty when correct or undiagnosable.",
    },
    confidence: { type: "number" },
    evidence_span: {
      type: "string",
      description: "Verbatim substring of the answer. Empty when none applies.",
    },
    provisional_score: { type: "integer" },
    criteria_met: { type: "array", items: { type: "string" } },
    criteria_missed: { type: "array", items: { type: "string" } },
    score_rationale: { type: "string" },
  },
  required: [
    "is_correct",
    "error_signature",
    "confidence",
    "evidence_span",
    "provisional_score",
    "criteria_met",
    "criteria_missed",
    "score_rationale",
  ],
} as const;

/* ------------------------------------------------------------------ */
/*  Step 4 — cluster labelling                                         */
/* ------------------------------------------------------------------ */

export function labelPrompt(
  input: PipelineInput,
  signatures: string[],
): string {
  return `SUBJECT: ${input.subject}
LEVEL: ${input.level}
QUESTION: ${input.question}

${signatures.length} students made mistakes that were grouped together because their
underlying beliefs are semantically close. Here are the individual diagnoses:

${signatures.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Write ONE canonical misconception that captures what these students share.

Rules:
- State the belief itself, not the group. "Impedance is treated as resistance"
  is right; "students who confused impedance" is wrong.
- One sentence, under 90 characters, no trailing full stop.
- It must be recognisable to a lecturer skimming a list of misconceptions.
- If these diagnoses genuinely share no single belief, say so plainly in the
  label rather than inventing a false common thread.

Also write one sentence on WHY a student would plausibly arrive at this belief
— the reasoning that makes it feel correct from the inside. This is what the
lecturer will teach against, so it must be sympathetic and specific, not a
restatement of the error.`;
}

export const LABEL_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    why: { type: "string" },
  },
  required: ["label", "why"],
} as const;

/* ------------------------------------------------------------------ */
/*  Step 5 — prerequisite damage ranking                               */
/* ------------------------------------------------------------------ */

export function damagePrompt(input: PipelineInput, label: string): string {
  return `SUBJECT: ${input.subject}
LEVEL: ${input.level}
QUESTION THIS AROSE FROM: ${input.question}

MISCONCEPTION: ${label}

A student carries this belief forward. Name the specific later topics in this
subject that it will break, and rate how badly.

Rules:
- Between 1 and 4 topics, each a real named topic in this syllabus at this
  level — "resonance in RLC circuits", not "later calculations".
- Order them by how soon the student hits them.
- severity is 1 to 5, where 1 means the belief stops at this question and 5
  means it poisons a foundational chain the rest of the course rests on.
- Judge severity by what the belief BLOCKS, not by how many students hold it.
  Spread is counted separately; rating by popularity here would double-count it
  and make the damage sort meaningless.`;
}

export const DAMAGE_SCHEMA = {
  type: "object",
  properties: {
    downstream: { type: "array", items: { type: "string" } },
    severity: { type: "integer" },
  },
  required: ["downstream", "severity"],
} as const;

/* ------------------------------------------------------------------ */
/*  Step 6 — reteach pack                                              */
/* ------------------------------------------------------------------ */

export function reteachPrompt(
  input: PipelineInput,
  label: string,
  why: string,
  evidence: string[],
): string {
  return `SUBJECT: ${input.subject}
LEVEL: ${input.level}
QUESTION: ${input.question}

MISCONCEPTION TO CORRECT: ${label}
WHY STUDENTS ARRIVE AT IT: ${why}

ACTUAL STUDENT WORK SHOWING IT:
${evidence.map((e, i) => `${i + 1}. "${e}"`).join("\n")}

Write a five-minute micro-lesson a lecturer can deliver at the start of the next
class, as 3 or 4 sections. The sections must, in order:
1. Name the false belief out loud, so students recognise it as theirs.
2. Show why it is intuitive — grant that it is a reasonable thing to think.
3. Show exactly where it breaks, using this question's own numbers.
4. State the correct principle in one memorable line.

Each section: a short heading, and a body of 2-4 sentences the lecturer could
read aloud. No bullet points inside the body. No preamble about the lesson.

Then write TWO diagnostic questions. This is the part that must be right:
a student who still holds this misconception must get them WRONG, and a student
who has corrected it must get them RIGHT. A question both students answer the
same way is worthless here — it tests recall, not the belief.

For each diagnostic, state what a student who still holds the misconception
would answer, and what a corrected student would answer.`;
}

export const RETEACH_SCHEMA = {
  type: "object",
  properties: {
    lesson: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
        required: ["heading", "body"],
      },
    },
    diagnostics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          holder_answers: { type: "string" },
          corrected_answers: { type: "string" },
        },
        required: ["prompt", "holder_answers", "corrected_answers"],
      },
    },
  },
  required: ["lesson", "diagnostics"],
} as const;
