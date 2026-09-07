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

/**
 * The half of the extraction prompt that is identical for every answer in a
 * batch: the question, the scheme, the criteria.
 *
 * Sent as the cached prefix, so forty answers pay for the scheme once rather
 * than forty times — which is most of the input cost of a run.
 */
export function extractionContext(input: PipelineInput): string {
  const total = input.criteria.reduce((sum, c) => sum + c.marks, 0);

  return `SUBJECT: ${input.subject}
LEVEL: ${input.level}

QUESTION AS THE STUDENTS SAW IT:
${input.question}

MARKING SCHEME / MODEL ANSWER:
${input.scheme}

CRITERIA (award against these ids exactly):
${criteriaBlock(input.criteria)}

TOTAL MARKS AVAILABLE: ${total}`;
}

/**
 * The half that changes: one student's answer. Never cached.
 *
 * The answer is identified by a correlation reference — "submission-4" — and
 * never by the student's own reference. The model needs a handle to talk about
 * the answer with; it does not need to know whose it is.
 */
export function extractionAnswer(
  answer: RawAnswer,
  correlationReference = "submission",
): string {
  return `STUDENT ANSWER (reference ${correlationReference}):
---
${answer.text}
---

Diagnose this answer and award its criteria.`;
}

/* ------------------------------------------------------------------ */
/*  Steps 4 and 5 — cluster labelling and prerequisite damage          */
/* ------------------------------------------------------------------ */

/**
 * The stable half of the cluster assessment: everything except the signatures.
 *
 * Labelling and damage ranking are one call because they share all of this
 * context, and splitting them doubled the per-cluster request count against a
 * route budget measured in request starts.
 */
export function clusterAssessmentContext(input: PipelineInput): string {
  return `SUBJECT: ${input.subject}
LEVEL: ${input.level}
QUESTION: ${input.question}

You will be given the individual diagnoses of several students whose mistakes
were grouped together because their underlying beliefs are semantically close.

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
restatement of the error.

After choosing that canonical misconception, assess its prerequisite damage.

Rules for downstream damage:
- Name between 1 and 4 real later topics in this subject and level —
  "resonance in RLC circuits", not "later calculations".
- Order them by how soon the student encounters them.
- severity is 1 to 5: 1 is contained to this question; 5 blocks a foundational
  chain the rest of the course rests on.
- Judge severity by what the belief BLOCKS, never by how many students hold it.
  Spread is counted separately, and rating by popularity here would double-count
  it and make the damage sort meaningless.`;
}

/** The half that changes: the signatures of one cluster's members. */
export function clusterAssessmentSignatures(signatures: string[]): string {
  return `${signatures.length} students were grouped together. Their individual diagnoses:

${signatures.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Name the misconception they share and assess its prerequisite damage.`;
}

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
class, as exactly 5 sections. The sections must, in order:
1. Name the false belief out loud, so students recognise it as theirs.
2. Show why it is intuitive — grant that it is a reasonable thing to think.
3. Give an ANALOGY from outside this subject that makes the correct idea
   obvious. It must break where the belief breaks, not merely decorate.
4. Work through a WORKED EXAMPLE using this question's own numbers, line by
   line, showing the step where the belief leads the student astray.
5. State the correct principle in one memorable line.

Each section: a short heading, and a body of 2-4 sentences the lecturer could
read aloud. No bullet points inside the body. No preamble about the lesson.

Then write TWO diagnostic questions. This is the part that must be right:
a student who still holds this misconception must get them WRONG, and a student
who has corrected it must get them RIGHT. A question both students answer the
same way is worthless here — it tests recall, not the belief.

For each diagnostic, state what a student who still holds the misconception
would answer, and what a corrected student would answer.`;
}

/* ------------------------------------------------------------------ */
/*  Step 8 — grading the diagnostic                                    */
/* ------------------------------------------------------------------ */

/**
 * Judges a student's free-text answers against the misconception itself.
 *
 * Both questions go in one call. Forty students marking two questions each is
 * eighty calls if graded singly, and the pair share all their context anyway.
 *
 * The rubric is not "is this right" — it is "does this answer still show the
 * belief". Those come apart: a student can reach a wrong number while
 * reasoning correctly about the belief, and a student can guess the right
 * number while still holding it. The before/after figure in PRD v2 §12
 * measures the belief, so that is what gets judged.
 */
export function diagnosticGradingContext(
  misconception: string,
  questions: {
    prompt: string;
    holderAnswers: string;
    correctedAnswers: string;
  }[],
): string {
  const blocks = questions
    .map((q, i) => {
      return `QUESTION ${i + 1}: ${q.prompt}

A student who STILL HOLDS the misconception answers along these lines:
${q.holderAnswers}

A student who has CORRECTED it answers along these lines:
${q.correctedAnswers}`;
    })
    .join("\n\n---\n\n");

  return `MISCONCEPTION BEING TESTED: ${misconception}

${blocks}

For each question, decide whether the student's answer still shows the
misconception.

- "holds" — the answer reflects the false belief, whatever else is right about it.
- "corrected" — the answer reflects the corrected understanding, even if the
  arithmetic or the wording is poor. You are marking the belief, not the sum.
- "unclear" — the answer is blank, off-topic, or too thin to tell. Use this
  honestly and often. A guess recorded as "corrected" becomes improvement the
  lecturer never actually achieved, in the one number this whole exercise
  produces.

Give a one-sentence reason for each, quoting the phrase that decided it.
Return one verdict per question, in the order the questions are numbered.`;
}

/**
 * The half that changes: one student's answers.
 *
 * The whole cohort is graded against the same misconception and the same two
 * questions, so everything above this is identical for every student in the
 * class and is sent as the cached prefix.
 */
export function diagnosticGradingResponses(responses: string[]): string {
  const blocks = responses
    .map(
      (response, i) => `ANSWER TO QUESTION ${i + 1}:
"""
${response.trim().length > 0 ? response : "(no answer given)"}
"""`,
    )
    .join("\n\n");

  return `THIS STUDENT ANSWERED:

${blocks}`;
}
