import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import SetupPage from "@/app/page";
import { SessionProvider } from "@/components/session-provider";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

function renderSetup() {
  return render(
    <SessionProvider>
      <SetupPage />
    </SessionProvider>,
  );
}

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

it("keeps criterion descriptions shrinkable beside marks and remove controls", () => {
  render(
    <SessionProvider>
      <SetupPage />
    </SessionProvider>,
  );

  for (const description of screen.getAllByRole("textbox", {
    name: /Criterion \d+ description/,
  })) {
    expect(description).toHaveClass("min-w-0", "flex-1");
  }
});

it("keeps criterion mark fields at a bounded width", () => {
  render(
    <SessionProvider>
      <SetupPage />
    </SessionProvider>,
  );

  for (const marks of screen.getAllByRole("spinbutton", {
    name: /Marks for criterion \d+/,
  })) {
    expect(marks).toHaveClass("!w-[74px]", "shrink-0");
  }
});

it.each(["Subject", "Level"])(
  "disables preview when %s contains no nonblank value",
  async (fieldName) => {
    const user = userEvent.setup();
    renderSetup();
    const preview = screen.getByRole("button", { name: "Preview sample analysis" });
    const field = screen.getByRole("textbox", { name: new RegExp(`^${fieldName}`) });

    expect(preview).toBeEnabled();
    await user.clear(field);
    await user.type(field, "   ");

    expect(preview).toBeDisabled();
  },
);

it("exposes every visible required Setup field while keeping prediction optional", async () => {
  const user = userEvent.setup();
  const { container } = renderSetup();

  for (const name of ["Subject", "Level", "Question text", "Model answer or scheme", "Answers"]) {
    const field = screen.getByRole("textbox", { name: new RegExp(`^${name}.*required`, "i") });
    expect(field).toBeRequired();
  }
  expect(
    screen.getByRole("textbox", { name: "What do you think most of them got wrong?" }),
  ).not.toBeRequired();

  await user.click(screen.getByRole("tab", { name: "CSV upload" }));

  const csvInput = container.querySelector<HTMLInputElement>("#answers-csv");
  expect(csvInput).toHaveAccessibleName("CSV file (required)");
  expect(csvInput).toBeRequired();
  expect(container.querySelector("#paste")).not.toBeRequired();

  await user.click(screen.getByRole("tab", { name: /Photos/ }));

  expect(csvInput).not.toBeRequired();
  expect(container.querySelector("#paste")).not.toBeRequired();
});

it("moves and activates answer tabs with the tablist keyboard model", async () => {
  const user = userEvent.setup();
  renderSetup();
  const paste = screen.getByRole("tab", { name: "Paste" });
  const csv = screen.getByRole("tab", { name: "CSV upload" });
  const photos = screen.getByRole("tab", { name: /Photos/ });

  expect(paste).toHaveAttribute("tabindex", "0");
  expect(csv).toHaveAttribute("tabindex", "-1");
  expect(photos).toHaveAttribute("tabindex", "-1");
  expect(paste).toHaveAttribute("aria-controls", "answer-panel-paste");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "answer-tab-paste");

  paste.focus();
  await user.keyboard("{ArrowRight}");
  expect(csv).toHaveFocus();
  expect(csv).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "answer-tab-csv");

  await user.keyboard("{End}");
  expect(photos).toHaveFocus();
  expect(photos).toHaveAttribute("aria-selected", "true");

  await user.keyboard("{ArrowRight}");
  expect(paste).toHaveFocus();
  expect(paste).toHaveAttribute("aria-selected", "true");

  await user.keyboard("{ArrowLeft}");
  expect(photos).toHaveFocus();
  await user.keyboard("{Home}");
  expect(paste).toHaveFocus();
});

it("explains an invalid CSV without introducing a competing primary action and recovers", async () => {
  const user = userEvent.setup({ applyAccept: false });
  const { container } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(fileInput).not.toBeNull();

  await user.upload(
    fileInput!,
    new File(["not a spreadsheet"], "answers.txt", { type: "text/plain" }),
  );

  const alert = screen.getByRole("alert");
  expect(alert).toHaveAccessibleName("CSV upload failed");
  expect(alert).toHaveTextContent("Export your sheet as CSV and try again.");
  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeDisabled();
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  const recovery = screen.getByRole("button", { name: "Choose another CSV" });
  expect(recovery).toHaveAttribute("data-variant", "secondary");

  await user.click(recovery);
  await user.upload(
    fileInput!,
    new File(["student,answer\nS1,First\nS2,Second"], "answers.csv", {
      type: "text/csv",
    }),
  );

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(await screen.findByText("answers.csv")).toBeVisible();
  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeEnabled();
});
