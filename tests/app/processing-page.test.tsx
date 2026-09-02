import { useLayoutEffect, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ProcessingPage from "@/app/processing/page";
import { SessionProvider, useSession } from "@/components/session-provider";

function UnprocessedSession({ children }: { children: ReactNode }) {
  const { processed, setProcessed } = useSession();
  useLayoutEffect(() => {
    setProcessed(false);
  }, [setProcessed]);
  return processed ? null : children;
}

function LifecycleSession() {
  const { processed, setProcessed } = useSession();
  useLayoutEffect(() => {
    setProcessed(false);
  }, [setProcessed]);
  return (
    <>
      <span data-testid="processed-state">{processed ? "processed" : "not processed"}</span>
      {processed ? null : <ProcessingPage />}
    </>
  );
}

it("keeps optional processing mechanics collapsed during an active preview", async () => {
  render(
    <SessionProvider>
      <UnprocessedSession>
        <ProcessingPage />
      </UnprocessedSession>
    </SessionProvider>,
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Preparing the sample analysis" }),
  ).toBeVisible();
  const summary = screen.getByText("How processing works");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(
    screen.getByText("Keep this page open while the preview is prepared."),
  ).toBeVisible();
  expect(
    screen.getByRole("progressbar", { name: "Sample analysis progress" }),
  ).toBeVisible();
});

it("completes the existing preview lifecycle and keeps the reveal destination", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const now = vi.spyOn(performance, "now").mockReturnValue(0);

  render(
    <SessionProvider>
      <LifecycleSession />
    </SessionProvider>,
  );

  expect(await screen.findByTestId("processed-state")).toHaveTextContent("not processed");
  expect(frames).toHaveLength(1);

  now.mockReturnValue(9_000);
  act(() => frames[0](9_000));

  expect(screen.getByTestId("processed-state")).toHaveTextContent("processed");
});

it("announces the next stage at an exact stage boundary", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const now = vi.spyOn(performance, "now").mockReturnValue(0);

  render(
    <SessionProvider>
      <UnprocessedSession>
        <ProcessingPage />
      </UnprocessedSession>
    </SessionProvider>,
  );

  expect(
    await screen.findByText("Starting sample analysis", {
      selector: '[aria-live="polite"]',
    }),
  ).toBeVisible();
  expect(frames).toHaveLength(1);

  now.mockReturnValue(4_140);
  act(() => frames[0](4_140));

  expect(
    screen.getByText("Compare reasoning patterns", {
      selector: '[aria-live="polite"]',
    }),
  ).toBeVisible();
});

it("shows the completed preview state with the existing reveal destination", () => {
  render(
    <SessionProvider>
      <ProcessingPage />
    </SessionProvider>,
  );

  expect(
    screen.getByRole("heading", { level: 1, name: "Sample analysis ready" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Compare my prediction" })).toHaveAttribute(
    "href",
    "/reveal",
  );
});
