import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SetupPage from "@/app/page";
import { SessionProvider } from "@/components/session-provider";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

it("presents one truthful primary action and optional advanced guidance", () => {
  const { container } = render(
    <SessionProvider>
      <SetupPage />
    </SessionProvider>,
  );
  expect(
    screen.getByRole("heading", { level: 1, name: "Set up this marking session" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Preview sample analysis" }),
  ).toBeEnabled();
  expect(screen.getByText("Advanced marking guidance")).toBeVisible();
  expect(container.querySelectorAll('button[data-variant="primary"]')).toHaveLength(1);
});
