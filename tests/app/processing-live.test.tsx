import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ProcessingPage from "@/app/processing/page";

const session = vi.hoisted(() => ({
  processed: false,
  setProcessed: vi.fn(),
  prediction: "My prediction",
  pendingRun: {
    input: { question: "Question", scheme: "Scheme", criteria: [{ id: "one", label: "Reasoning", marks: 2 }], answers: [{ text: "First" }, { text: "Second" }] },
    prediction: "My prediction", courseCode: "EEE301", courseTitle: "Circuits",
  },
  applyRun: vi.fn(),
}));
vi.mock("@/components/session-provider", () => ({ useSession: () => session }));
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });

function stream(lines: string) {
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(lines));
    controller.close();
  } }));
}

it("starts exactly one live request in Strict Mode and accepts a final line without a newline", async () => {
  const result = { answers: [], clusters: [], reteachPacks: {}, maxScore: 2 };
  fetchMock.mockResolvedValue(stream(JSON.stringify({ type: "result", sessionId: "saved-id", result })));
  render(<StrictMode><ProcessingPage /></StrictMode>);
  await waitFor(() => expect(session.applyRun).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(session.applyRun).toHaveBeenCalledWith(result, "saved-id", session.pendingRun.input, { code: "EEE301", title: "Circuits" });
  expect(screen.getByRole("heading", { name: "Class analysis ready" })).toBeVisible();
});

it("shows a recoverable error when a live stream ends without a result", async () => {
  fetchMock.mockResolvedValue(stream(JSON.stringify({ type: "progress", stage: "extract", progress: 0.5 }) + "\n"));
  render(<ProcessingPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/ended before a result/);
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(session.applyRun).not.toHaveBeenCalled();
});
