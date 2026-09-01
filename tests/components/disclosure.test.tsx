import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Disclosure } from "@/components/disclosure";

it("reveals optional detail through native summary semantics", async () => {
  const user = userEvent.setup();
  render(
    <Disclosure title="How processing works">
      <p>Technical explanation</p>
    </Disclosure>,
  );
  const summary = screen.getByText("How processing works");
  const details = summary.closest("details");
  expect(details).not.toHaveAttribute("open");
  await user.click(summary);
  expect(details).toHaveAttribute("open");
  expect(screen.getByText("Technical explanation")).toBeVisible();
});
