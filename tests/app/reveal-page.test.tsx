import { useEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import RevealPage from "@/app/reveal/page";
import { SessionProvider, useSession } from "@/components/session-provider";

function ReadySession({ children }: { children: ReactNode }) {
  const { setPrediction, setProcessed } = useSession();
  useEffect(() => {
    setPrediction("Students may add resistance and reactance directly.");
    setProcessed(true);
  }, [setPrediction, setProcessed]);
  return children;
}

function GuardedSession({
  prediction,
  processed,
  children,
}: {
  prediction: string;
  processed: boolean;
  children: ReactNode;
}) {
  const { setPrediction, setProcessed } = useSession();
  useEffect(() => {
    setPrediction(prediction);
    setProcessed(processed);
  }, [prediction, processed, setPrediction, setProcessed]);
  return children;
}

it("puts the lecturer comparison before supporting explanation", async () => {
  render(
    <SessionProvider>
      <ReadySession>
        <RevealPage />
      </ReadySession>
    </SessionProvider>,
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Compare your prediction" }),
  ).toBeVisible();
  expect(screen.getByText("Your prediction")).toBeVisible();
  expect(screen.getByText("What the sample shows")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "View misconception map" }),
  ).toBeVisible();
});

it("keeps the no-prediction guard destinations", async () => {
  render(
    <SessionProvider>
      <GuardedSession prediction="" processed={true}>
        <RevealPage />
      </GuardedSession>
    </SessionProvider>,
  );

  expect(await screen.findByText("No prediction was entered")).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to setup" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Skip to the map" })).toHaveAttribute("href", "/map");
});

it("keeps the not-processed guard destination with truthful preview copy", async () => {
  render(
    <SessionProvider>
      <GuardedSession prediction="Expected misconception" processed={false}>
        <RevealPage />
      </GuardedSession>
    </SessionProvider>,
  );

  expect(await screen.findByText("The sample analysis isn't ready yet")).toBeVisible();
  expect(screen.getByRole("link", { name: "Preview sample analysis" })).toHaveAttribute(
    "href",
    "/processing",
  );
});
