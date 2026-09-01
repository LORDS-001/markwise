import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import ScoresPage from "@/app/scores/page";
import { SessionProvider } from "@/components/session-provider";

it(
  "labels the review table and keeps progress ahead of technical detail",
  () => {
    render(
      <SessionProvider>
        <ScoresPage />
      </SessionProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Review provisional scores" }),
    ).toBeVisible();
    expect(screen.getByText("Student score review")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeVisible();
    expect(screen.getByText("How confidence is used")).toBeVisible();
  },
  20_000,
);
