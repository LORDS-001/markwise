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

function EmptyHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open empty panel</button>
      <OverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        ariaLabel="Empty panel"
      >
        <p>No actions are available.</p>
      </OverlayPanel>
    </>
  );
}

function DynamicFocusHarness() {
  const [showFirst, setShowFirst] = useState(true);
  return (
    <>
      <button>Outside action</button>
      <OverlayPanel open onClose={() => undefined} side="right" ariaLabel="Dynamic panel">
        {showFirst ? (
          <button onClick={() => setShowFirst(false)}>Remove focused action</button>
        ) : null}
        <button>Remaining action</button>
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
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  await user.tab();
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

it("focuses the panel when it has no focusable descendants", async () => {
  const user = userEvent.setup();
  render(<EmptyHarness />);

  await user.click(screen.getByRole("button", { name: "Open empty panel" }));

  expect(screen.getByRole("dialog", { name: "Empty panel" })).toHaveFocus();
});

it("returns outside focus to the panel after a focused child is removed", async () => {
  const user = userEvent.setup();
  render(<DynamicFocusHarness />);
  const removeAction = screen.getByRole("button", { name: "Remove focused action" });
  expect(removeAction).toHaveFocus();

  await user.click(removeAction);
  expect(document.body).toHaveFocus();
  await user.tab();

  expect(screen.getByRole("button", { name: "Remaining action" })).toHaveFocus();
});

it("restores the previous body overflow when an open panel unmounts", () => {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "clip";

  try {
    const { unmount } = render(
      <OverlayPanel open onClose={() => undefined} side="right" ariaLabel="Cleanup panel">
        <button>Inside action</button>
      </OverlayPanel>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("clip");
  } finally {
    document.body.style.overflow = previousOverflow;
  }
});
