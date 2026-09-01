import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import ScoresPage from "@/app/scores/page";
import { SessionProvider, useSession } from "@/components/session-provider";
import { ANSWERS } from "@/lib/mock";

const TEST_TIMEOUT = 40_000;

function renderScores({ completionProbe = false } = {}) {
  return render(
    <SessionProvider>
      <ScoresPage />
      {completionProbe ? <ReviewCompletionProbe /> : null}
    </SessionProvider>,
  );
}

function ReviewCompletionProbe() {
  const { answers, setStatus } = useSession();

  return (
    <button
      type="button"
      onClick={() => {
        answers.forEach((answer) => {
          if (answer.status === "unreviewed") setStatus(answer.id, "accepted");
        });
      }}
    >
      Complete remaining review
    </button>
  );
}

function primaryActions(toolbar: HTMLElement) {
  return Array.from(toolbar.querySelectorAll<HTMLElement>('[data-variant="primary"]'));
}

function firstStudentId(table: HTMLElement) {
  return table.querySelector("tbody > tr > td")?.textContent?.trim();
}

it(
  "labels the review workspace, every score input, and the bounded review table",
  () => {
    renderScores();

    expect(
      screen.getByRole("heading", { level: 1, name: "Review provisional scores" }),
    ).toBeVisible();
    expect(screen.getByRole("progressbar")).toBeVisible();
    expect(screen.getByText("How confidence is used")).toBeVisible();

    const table = screen.getByRole("table", { name: "Student score review" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
    expect(table.parentElement).toHaveClass(
      "max-h-[70vh]",
      "overflow-x-auto",
      "overflow-y-auto",
    );

    const scoreLabels = Array.from(
      table.querySelectorAll<HTMLInputElement>('input[type="number"]'),
      (input) => input.getAttribute("aria-label"),
    ).sort();
    expect(scoreLabels).toEqual(
      ANSWERS.map((answer) => `Score for ${answer.initials}`).sort(),
    );

    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });
    expect(primaryActions(toolbar)).toHaveLength(1);
    expect(primaryActions(toolbar)[0]).toHaveAccessibleName("Accept high-confidence");
  },
  TEST_TIMEOUT,
);

it(
  "keeps one truthful primary action through bulk acceptance and export unlocking",
  () => {
    renderScores({ completionProbe: true });
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });

    fireEvent.click(within(toolbar).getByRole("button", { name: "Accept high-confidence" }));
    expect(primaryActions(toolbar)).toHaveLength(1);
    expect(primaryActions(toolbar)[0]).toHaveAccessibleName("Review remaining");

    fireEvent.click(within(toolbar).getByRole("button", { name: "Review remaining" }));
    expect(screen.getByRole("checkbox", { name: /Only unreviewed/ })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Complete remaining review" }));
    expect(primaryActions(toolbar)).toHaveLength(1);
    expect(primaryActions(toolbar)[0]).toHaveAccessibleName("Continue to export");
    expect(primaryActions(toolbar)[0]).toHaveAttribute("href", "/export");
  },
  TEST_TIMEOUT,
);

it(
  "searches row text while preserving confidence, score, and cluster sorting",
  () => {
    renderScores();
    const table = screen.getByRole("table", { name: "Student score review" });
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });
    const search = within(toolbar).getByRole("searchbox", { name: "Search responses" });

    expect(firstStudentId(table)).toContain("EEE/022/0169");
    fireEvent.click(within(toolbar).getByRole("radio", { name: "Score" }));
    expect(firstStudentId(table)).toContain("EEE/022/0173");
    fireEvent.click(within(toolbar).getByRole("radio", { name: "Cluster" }));
    expect(firstStudentId(table)).toContain("EEE/022/0133");

    fireEvent.change(search, { target: { value: "EEE/022/0103" } });
    expect(table.querySelectorAll("tbody > tr")).toHaveLength(1);
    expect(table).toHaveTextContent("EEE/022/0103");

    fireEvent.change(search, { target: { value: "Other / one-off errors" } });
    expect(table.querySelectorAll("tbody > tr")).toHaveLength(4);
  },
  TEST_TIMEOUT,
);

it(
  "keeps status filtering, score edits, accepting, and flagging wired to session state",
  () => {
    renderScores();
    const table = screen.getByRole("table", { name: "Student score review" });
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });
    fireEvent.change(within(toolbar).getByRole("searchbox", { name: "Search responses" }), {
      target: { value: "EEE/022/0103" },
    });

    let row = table.querySelector("tbody > tr") as HTMLTableRowElement;
    const score = within(row).getByRole("spinbutton", { name: "Score for A.O." });
    fireEvent.change(score, { target: { value: "7" } });
    expect(score).toHaveValue(7);
    expect(within(row).getByRole("button", { name: "Edited" })).toBeVisible();

    fireEvent.click(within(row).getByRole("button", { name: "Edited" }));
    fireEvent.click(within(row).getByRole("button", { name: "Accept" }));
    expect(within(row).getByRole("button", { name: "Accepted" })).toBeVisible();

    const onlyUnreviewed = within(toolbar).getByRole("checkbox", { name: /Only unreviewed/ });
    fireEvent.click(onlyUnreviewed);
    expect(table.querySelectorAll("tbody > tr")).toHaveLength(0);

    fireEvent.click(onlyUnreviewed);
    row = table.querySelector("tbody > tr") as HTMLTableRowElement;
    fireEvent.click(within(row).getByRole("button", { name: "Accepted" }));
    fireEvent.click(within(row).getByRole("button", { name: "Flag for a second look" }));
    expect(within(row).getByRole("button", { name: "Flagged" })).toBeVisible();
  },
  TEST_TIMEOUT,
);

it(
  "expands full-width evidence with the named marking criteria",
  () => {
    renderScores();
    const table = screen.getByRole("table", { name: "Student score review" });
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });
    fireEvent.change(within(toolbar).getByRole("searchbox", { name: "Search responses" }), {
      target: { value: "EEE/022/0103" },
    });

    const row = table.querySelector("tbody > tr") as HTMLTableRowElement;
    expect(row).toHaveTextContent("2/5");
    fireEvent.click(within(row).getByRole("button", { name: "Expand answer" }));

    const expanded = table.querySelector('td[colspan="8"]') as HTMLTableCellElement;
    expect(expanded).toBeVisible();
    expect(expanded).toHaveTextContent("The answer");
    expect(expanded).toHaveTextContent("Reactance term included");
    expect(expanded).toHaveTextContent("Marking scheme, criterion by criterion");
    expect(within(expanded).getByText(/^Rationale$/)).toBeVisible();
  },
  TEST_TIMEOUT,
);
