import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { installMatchMedia } from "../match-media";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <ThemeProvider>
      <button onClick={() => setOpen(true)}>Settings</button>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </ThemeProvider>
  );
}

it("offers exactly three appearance choices and applies dark mode", async () => {
  installMatchMedia(false);
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const choices = screen.getAllByRole("radio");
  expect(choices).toHaveLength(3);
  await user.click(screen.getByRole("radio", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
});
