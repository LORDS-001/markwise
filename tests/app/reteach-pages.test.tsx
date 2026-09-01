import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ReteachIndexPage from "@/app/reteach/page";
import ReteachPackPage from "@/app/reteach/[id]/page";
import { SessionProvider } from "@/components/session-provider";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "cl-arithmetic" }),
}));

it("presents the cluster choices under one page heading", () => {
  render(
    <SessionProvider>
      <ReteachIndexPage />
    </SessionProvider>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Choose a misconception to reteach",
  );
  expect(screen.getAllByRole("link", { name: /View pack/i }).length).toBeGreaterThan(0);
});

it("groups the existing copy and download actions in one labelled region", () => {
  render(
    <SessionProvider>
      <ReteachPackPage />
    </SessionProvider>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  const actions = screen.getByRole("region", { name: "Page actions" });
  expect(actions).toContainElement(screen.getByRole("button", { name: /copy lesson/i }));
  expect(screen.getByRole("button", { name: /copy lesson/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /download markdown/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /download roster csv/i })).toBeVisible();
});
