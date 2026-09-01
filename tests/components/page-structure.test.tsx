import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ActionArea, PageHeader } from "@/components/page-structure";

it("renders a single page heading and labelled action region", () => {
  render(
    <>
      <PageHeader
        eyebrow="Step 2 of 7"
        title="Prepare the analysis"
        lead="Keep this page open while the preview is prepared."
      />
      <ActionArea note="Your inputs stay in this tab.">
        <button>Continue</button>
      </ActionArea>
    </>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Prepare the analysis",
  );
  expect(screen.getByRole("region", { name: "Page actions" })).toBeVisible();
});
