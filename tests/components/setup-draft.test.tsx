import { useLayoutEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "@/components/session-provider";
import { ANSWERS, CRITERIA, SESSION } from "@/lib/mock";
import { answersFromPaste } from "@/lib/pipeline/parse-answers";
import type { PipelineInput, PipelineResult } from "@/lib/pipeline/types";
import {
  createDemoSetupDraft,
  createEmptySetupDraft,
  createSetupDraftFromRun,
} from "@/lib/setup-draft";

const getBrowserClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient }));

const input: PipelineInput = {
  subject: "Mathematics",
  level: "Year 2",
  question: "Explain the derivative.",
  scheme: "Connect the derivative to the instantaneous rate of change.",
  criteria: [{ id: "rate", label: "Instantaneous rate", marks: 4 }],
  answers: [
    { studentRef: "student-one", text: "It describes a rate." },
    { studentRef: "student-two", text: "It is the gradient." },
  ],
};
const course = { code: "MTH 201", title: "Calculus" };
const runPrediction = "They will confuse a rate with a total.";
const result: PipelineResult = {
  answers: input.answers.map((answer, index) => ({
    ...ANSWERS[index],
    id: `test-answer-${index}`,
    studentId: answer.studentRef,
    answer: answer.text,
    maxScore: 4,
    provisionalScore: 2,
    clusterId: null,
  })),
  clusters: [],
  reteachPacks: {},
  maxScore: 4,
};

let session: ReturnType<typeof useSession>;

function Probe() {
  const current = useSession();
  useLayoutEffect(() => { session = current; }, [current]);
  return <output data-testid="draft">{JSON.stringify(current.setupDraft)}</output>;
}

function storeRun(ownerKey: string) {
  window.sessionStorage.setItem(`markwise:run:${ownerKey}`, JSON.stringify({
    ...result,
    context: input,
    prediction: runPrediction,
    sessionId: "saved-run",
    courseCode: course.code,
    courseTitle: course.title,
    ownerKey,
  }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  getBrowserClient.mockReturnValue(null);
});

it("starts with blank custom inputs and gives each draft independent criteria", () => {
  const first = createEmptySetupDraft();
  const second = createEmptySetupDraft();
  expect(first).toMatchObject({
    courseCode: "", courseTitle: "", subject: "", level: "", question: "", scheme: "",
    prediction: "", paste: "", csvName: null, csvAnswers: [], mode: "paste", isDemo: false,
    criteria: [{ id: "c-1", label: "", marks: 1 }],
  });
  first.criteria[0].marks = 10;
  expect(second.criteria[0].marks).toBe(1);
  render(<SessionProvider><Probe /></SessionProvider>);
  expect(session.setupDraft).toEqual(second);
  expect(session.isDemo).toBe(true);
});

it("loads the complete sample only through its explicit factory", () => {
  const draft = createDemoSetupDraft();
  expect(draft).toMatchObject({
    courseCode: SESSION.courseCode,
    courseTitle: SESSION.courseTitle,
    subject: SESSION.subject,
    question: SESSION.question,
    prediction: SESSION.prediction,
    isDemo: true,
  });
  expect(answersFromPaste(draft.paste)).toEqual(ANSWERS.map((answer) => ({ studentRef: answer.studentId, text: answer.answer })));
  expect(draft.criteria).toEqual(CRITERIA);
  expect(draft.criteria[0]).not.toBe(CRITERIA[0]);
});

it("reconstructs custom course, prediction and answer identifiers without sharing criteria", () => {
  const draft = createSetupDraftFromRun(input, course, runPrediction);
  expect(draft).toMatchObject({
    courseCode: course.code,
    courseTitle: course.title,
    prediction: runPrediction,
    subject: input.subject,
    question: input.question,
    isDemo: false,
    mode: "paste",
  });
  expect(answersFromPaste(draft.paste)).toEqual(input.answers);
  expect(draft.criteria[0]).not.toBe(input.criteria[0]);
});

it("preserves multiline responses and pipe-containing identifiers as parsed CSV rows", () => {
  const specialInput = {
    ...input,
    answers: [{ studentRef: "class|one", text: "First line\nSecond line" }, input.answers[1]],
  };
  const draft = createSetupDraftFromRun(specialInput, course);
  expect(draft.mode).toBe("csv");
  expect(draft.csvAnswers).toEqual(specialInput.answers);
  expect(draft.csvAnswers[0]).not.toBe(specialInput.answers[0]);
  expect(draft.paste).toBe("");
});

it("retains draft edits when the setup consumer unmounts and does not change active run identity", () => {
  const view = render(<SessionProvider><Probe /></SessionProvider>);
  act(() => {
    session.setSetupDraft((draft) => ({ ...draft, courseCode: "MTH 305", question: "My new question" }));
    session.setSetupDraft((draft) => ({ ...draft, courseTitle: "Linear algebra" }));
  });
  view.rerender(<SessionProvider><p>Another route</p></SessionProvider>);
  view.rerender(<SessionProvider><Probe /></SessionProvider>);
  expect(session.setupDraft).toMatchObject({ courseCode: "MTH 305", courseTitle: "Linear algebra", question: "My new question" });
  expect(session.courseCode).toBe(SESSION.courseCode);
  expect(session.context.question).toBe(SESSION.question);
});

it("does not discard a custom setup draft when previewing the sample results", () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  const draft = createSetupDraftFromRun(input, course, runPrediction);
  act(() => {
    session.setSetupDraft(draft);
    session.previewDemo();
  });
  expect(session.setupDraft).toEqual(draft);
  expect(session.isDemo).toBe(true);
});

it("populates the setup draft when a custom saved run is explicitly opened", () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  act(() => session.applyRun(result, "saved-run", input, course, runPrediction));
  expect(session.setupDraft).toEqual(createSetupDraftFromRun(input, course, runPrediction));
  expect(session.isDemo).toBe(false);
});

it("fills an untouched draft when a completed pending run arrives", () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  act(() => session.startRun({ input, prediction: runPrediction, courseCode: course.code, courseTitle: course.title }));
  act(() => session.applyRun(result, "saved-run", input, course));
  expect(session.setupDraft).toEqual(createSetupDraftFromRun(input, course, runPrediction));
});

it("preserves newer draft edits when a pending run completes in the background", () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  act(() => session.startRun({ input, prediction: runPrediction, courseCode: course.code, courseTitle: course.title }));
  act(() => session.setSetupDraft((draft) => ({ ...draft, question: "Next assessment question" })));
  act(() => session.applyRun(result, "saved-run", input, course));
  expect(session.setupDraft.question).toBe("Next assessment question");
  expect(session.context.question).toBe(input.question);
});

it("restores a custom draft from the owner-scoped run snapshot", async () => {
  storeRun("local");
  render(<SessionProvider><Probe /></SessionProvider>);
  await waitFor(() => expect(session.setupDraft.courseCode).toBe(course.code));
  expect(session.setupDraft).toEqual(createSetupDraftFromRun(input, course, runPrediction));
});

it("does not overwrite draft edits when account-scoped recovery resolves late", async () => {
  let resolveUser!: (value: { data: { user: { id: string } } }) => void;
  getBrowserClient.mockReturnValue({
    auth: {
      getUser: () => new Promise((resolve) => { resolveUser = resolve; }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  });
  storeRun("user:account-a");
  render(<SessionProvider><Probe /></SessionProvider>);
  act(() => session.setSetupDraft((draft) => ({ ...draft, courseCode: "NEW 101", question: "New local draft" })));
  await act(async () => resolveUser({ data: { user: { id: "account-a" } } }));
  await waitFor(() => expect(session.sessionId).toBe("saved-run"));
  expect(session.setupDraft.courseCode).toBe("NEW 101");
  expect(session.setupDraft.question).toBe("New local draft");
});

it("clears draft contents when the authenticated account changes", async () => {
  let accountChanged!: (event: string, next: { user: { id: string } } | null) => void;
  getBrowserClient.mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "account-a" } } }),
      onAuthStateChange: (callback: typeof accountChanged) => {
        accountChanged = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  });
  render(<SessionProvider><Probe /></SessionProvider>);
  await act(async () => Promise.resolve());
  act(() => session.setSetupDraft((draft) => ({ ...draft, question: "Private account A draft" })));
  act(() => accountChanged("SIGNED_IN", { user: { id: "account-b" } }));
  await waitFor(() => expect(screen.getByTestId("draft")).not.toHaveTextContent("Private account A draft"));
  expect(session.setupDraft).toEqual(createEmptySetupDraft());
});

it("does not revert the current account draft when its initial account lookup resolves stale", async () => {
  let resolveUser!: (value: { data: { user: { id: string } } }) => void;
  let accountChanged!: (event: string, next: { user: { id: string } } | null) => void;
  getBrowserClient.mockReturnValue({
    auth: {
      getUser: () => new Promise((resolve) => { resolveUser = resolve; }),
      onAuthStateChange: (callback: typeof accountChanged) => {
        accountChanged = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  });
  render(<SessionProvider><Probe /></SessionProvider>);
  act(() => accountChanged("SIGNED_IN", { user: { id: "account-b" } }));
  act(() => session.setSetupDraft((draft) => ({ ...draft, question: "Current account B draft" })));
  await act(async () => resolveUser({ data: { user: { id: "account-a" } } }));
  expect(session.setupDraft.question).toBe("Current account B draft");
});
