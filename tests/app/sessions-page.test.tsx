import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import SessionsPage from "@/app/sessions/page";
import { SessionProvider, useSession } from "@/components/session-provider";

const listSessionsAction = vi.hoisted(() => vi.fn());
const loadSessionAction = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/app/session-actions", () => ({ listSessionsAction, loadSessionAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: () => null }));

const SUMMARY = {
  id: "10000000-0000-4000-8000-000000000001",
  question: "Explain impedance in a series RL circuit.",
  createdAt: "2026-09-05T10:00:00Z",
  courseCode: "EEE 301",
  courseTitle: "Circuit Theory",
};

const LOADED = {
  prediction: "They omit reactance",
  course: { code: "EEE 301", title: "Circuit Theory" },
  input: {
    question: SUMMARY.question,
    scheme: "Full marks require reactance.",
    criteria: [{ id: "c-1", label: "Reactance", marks: 10 }],
    subject: "Engineering",
    level: "300 level",
  },
  result: {
    answers: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        studentId: "EEE/1",
        initials: "AB",
        answer: "Z = R",
        isCorrect: false,
        clusterId: null,
        errorSignature: "impedance equals resistance",
        evidenceSpan: "Z = R",
        confidence: 0.8,
        provisionalScore: 4,
        maxScore: 10,
        criteriaMet: [],
        criteriaMissed: ["c-1"],
        scoreRationale: "",
        status: "unreviewed" as const,
        diagnosticToken: "token",
      },
    ],
    clusters: [],
    reteachPacks: {},
    maxScore: 10,
  },
};

function Probe() {
  const { isDemo, courseCode, totalAnswers, prediction } = useSession();
  return <p data-testid="probe">{`${isDemo}|${courseCode}|${totalAnswers}|${prediction}`}</p>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  listSessionsAction.mockReset();
  loadSessionAction.mockReset();
  replace.mockReset();
});

it("shows a loading state while saved sessions are being fetched", () => {
  listSessionsAction.mockReturnValue(new Promise(() => undefined));
  render(
    <SessionProvider>
      <SessionsPage />
    </SessionProvider>,
  );
  expect(screen.getByText(/loading saved sessions/i)).toBeVisible();
});

it("shows an actionable empty state", async () => {
  listSessionsAction.mockResolvedValue({ ok: true, sessions: [] });
  render(
    <SessionProvider>
      <SessionsPage />
    </SessionProvider>,
  );
  expect(await screen.findByText(/no saved sessions yet/i)).toBeVisible();
  expect(screen.getByRole("link", { name: /start a run/i })).toHaveAttribute("href", "/");
});

it("shows load errors rather than an empty list", async () => {
  listSessionsAction.mockResolvedValue({ ok: false, error: "Sessions unavailable" });
  render(
    <SessionProvider>
      <SessionsPage />
    </SessionProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Sessions unavailable");
});

it("restores a selected run into the shared session state", async () => {
  listSessionsAction.mockResolvedValue({ ok: true, sessions: [SUMMARY] });
  loadSessionAction.mockResolvedValue({ ok: true, run: LOADED });
  render(
    <SessionProvider>
      <SessionsPage />
      <Probe />
    </SessionProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: /open session/i }));

  await waitFor(() =>
    expect(screen.getByTestId("probe")).toHaveTextContent(
      "false|EEE 301|1|They omit reactance",
    ),
  );
  expect(replace).toHaveBeenCalledWith("/reveal");
});
