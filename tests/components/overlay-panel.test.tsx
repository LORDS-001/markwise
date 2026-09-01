import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { OverlayPanel } from "@/components/overlay-panel";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open panel</button>
      <OverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        labelledBy="panel-title"
      >
        <h2 id="panel-title">Panel title</h2>
        <button>First action</button>
        <button onClick={() => setOpen(false)}>Close panel</button>
      </OverlayPanel>
    </>
  );
}

it("traps focus, closes with Escape, unlocks scroll, and restores focus", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open panel" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "Panel title" })).toBeVisible();
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByTestId("overlay-backdrop"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
