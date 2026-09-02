import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Progress, Segmented } from "@/components/ui";

function SegmentedHarness() {
  const [value, setValue] = useState<"alpha" | "beta" | "gamma">("alpha");

  return (
    <Segmented
      label="Example view"
      value={value}
      onChange={setValue}
      options={[
        { value: "alpha", label: "Alpha" },
        { value: "beta", label: "Beta" },
        { value: "gamma", label: "Gamma" },
      ]}
    />
  );
}

it("uses the roving radio keyboard model and wraps directional navigation", async () => {
  const user = userEvent.setup();
  render(<SegmentedHarness />);
  const alpha = screen.getByRole("radio", { name: "Alpha" });
  const beta = screen.getByRole("radio", { name: "Beta" });
  const gamma = screen.getByRole("radio", { name: "Gamma" });

  expect(alpha).toBeChecked();
  expect(alpha).toHaveAttribute("tabindex", "0");
  expect(beta).toHaveAttribute("tabindex", "-1");
  expect(gamma).toHaveAttribute("tabindex", "-1");

  alpha.focus();
  await user.keyboard("{ArrowRight}");
  expect(beta).toHaveFocus();
  expect(beta).toBeChecked();

  await user.keyboard("{ArrowDown}");
  expect(gamma).toHaveFocus();
  expect(gamma).toBeChecked();

  await user.keyboard("{ArrowRight}");
  expect(alpha).toHaveFocus();
  expect(alpha).toBeChecked();

  await user.keyboard("{ArrowLeft}");
  expect(gamma).toHaveFocus();
  expect(gamma).toBeChecked();

  await user.keyboard("{ArrowUp}");
  expect(beta).toHaveFocus();
  expect(beta).toBeChecked();

  await user.keyboard("{Home}");
  expect(alpha).toHaveFocus();
  expect(alpha).toBeChecked();

  await user.keyboard("{End}");
  expect(gamma).toHaveFocus();
  expect(gamma).toBeChecked();

  beta.focus();
  await user.keyboard(" ");
  expect(beta).toBeChecked();
  await user.click(alpha);
  expect(alpha).toBeChecked();
});

it("gives the progressbar its required consumer-provided name", () => {
  render(<Progress value={37} label="Upload completion" />);

  expect(screen.getByRole("progressbar", { name: "Upload completion" })).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
});
