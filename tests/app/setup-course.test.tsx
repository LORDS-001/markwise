import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import SetupPage from "@/components/setup-page";
import { SessionProvider, useSession } from "@/components/session-provider";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: () => null }));

beforeEach(() => {
  sessionStorage.clear();
  navigation.push.mockClear();
});

function RunProbe() {
  const { pendingRun, courseCode, courseTitle } = useSession();
  return <output data-testid="run">{JSON.stringify({ pendingRun, courseCode, courseTitle })}</output>;
}

function renderSetup(liveEnabled = true) {
  return render(<SessionProvider><SetupPage liveEnabled={liveEnabled} /><RunProbe /></SessionProvider>);
}

function fillCourse() {
  const values = {
    "Course code": " CSC201 ",
    "Course title": " Data Structures ",
    Subject: "Computer Science",
    Level: "200 level",
    "Question text": "Explain why binary search requires sorted input.",
    "Model answer or scheme": "Compare the target with the midpoint and discard half the search range.",
    "Criterion 1 description": "Explains ordered partitioning",
    Answers: "S1 | Sorting makes it possible to discard half.\nS2 | It checks every element in turn.",
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByRole("textbox", { name: new RegExp(`^${label}`) }), { target: { value } });
  }
}

it("starts a blank course and passes its entered identity into the live run", () => {
  renderSetup();
  expect(screen.getByRole("textbox", { name: /^Course code/ })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: /^Course title/ })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: /^Question text/ })).toHaveValue("");
  fillCourse();
  expect(screen.getByRole("heading", { name: "Data Structures" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Analyse class answers" }));
  const run = JSON.parse(screen.getByTestId("run").textContent!);
  expect(run.pendingRun).toMatchObject({
    courseCode: "CSC201", courseTitle: "Data Structures",
    input: { subject: "Computer Science", level: "200 level", answers: [{ studentRef: "S1" }, { studentRef: "S2" }] },
  });
  expect(run.courseCode).toBe("CSC201");
  expect(run.courseTitle).toBe("Data Structures");
  expect(navigation.push).toHaveBeenCalledWith("/processing");
});

it("requires course identity before a custom session can be analysed", () => {
  renderSetup();
  fillCourse();
  const button = screen.getByRole("button", { name: "Analyse class answers" });
  expect(button).toBeEnabled();
  fireEvent.change(screen.getByRole("textbox", { name: /^Course code/ }), { target: { value: "   " } });
  expect(button).toBeDisabled();
});

it("clears the course for a new session and loads the sample only on request", () => {
  renderSetup();
  fillCourse();
  fireEvent.click(screen.getByRole("button", { name: "New marking session" }));
  expect(screen.getByRole("textbox", { name: /^Course code/ })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: /^Course title/ })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: /^Answers/ })).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Load demo class" }));
  expect(screen.getByRole("textbox", { name: /^Course code/ })).toHaveValue("EEE 301");
  expect(screen.getByRole("textbox", { name: /^Course title/ })).toHaveValue("Circuit Theory II");
  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Preview sample analysis" }));
  expect(JSON.parse(screen.getByTestId("run").textContent!).pendingRun).toBeNull();
});

it("never substitutes demo results for a custom course when live marking is unavailable", () => {
  renderSetup(false);
  fillCourse();
  expect(screen.getByText(/Live analysis is not available/i)).toBeVisible();
  const button = screen.getByRole("button", { name: "Analyse class answers" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(navigation.push).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByTestId("run").textContent!).pendingRun).toBeNull();
});
