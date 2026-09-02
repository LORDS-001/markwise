import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ScoresPage from "@/app/scores/page";
import { SessionProvider, useSession } from "@/components/session-provider";
import { ANSWERS } from "@/lib/mock";
import { installMatchMedia } from "../match-media";

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

function installScrollIntoViewMock() {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  const mock = vi.fn();

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: mock,
  });

  return {
    mock,
    restore() {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    },
  };
}

it(
  "labels the review workspace, every score input, and the bounded review table",
  () => {
    renderScores();

    expect(
      screen.getByRole("heading", { level: 1, name: "Review provisional scores" }),
    ).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Score review progress" })).toBeVisible();
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
    expect(screen.getByText("Every row has been reviewed. Clear the filter to see them all.")).toBeVisible();
  },
  TEST_TIMEOUT,
);

it.each([
  { viewport: "mobile", matchesDesktop: false, rowTag: "LI" },
  { viewport: "desktop", matchesDesktop: true, rowTag: "TR" },
])(
  "moves focus to unresolved $viewport work every time Review remaining is activated",
  ({ matchesDesktop, rowTag }) => {
    installMatchMedia(matchesDesktop);
    const scrollIntoView = installScrollIntoViewMock();

    try {
      renderScores();
      const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });

      fireEvent.click(within(toolbar).getByRole("button", { name: "Accept high-confidence" }));
      const reviewRemaining = within(toolbar).getByRole("button", { name: "Review remaining" });
      fireEvent.click(reviewRemaining);

      const firstTarget = document.activeElement;
      expect(firstTarget).toHaveAttribute("data-review-row", "unreviewed");
      expect(firstTarget?.tagName).toBe(rowTag);
      expect(firstTarget).toHaveAccessibleName(/Review unresolved response from/);
      expect(scrollIntoView.mock).toHaveBeenNthCalledWith(1, { block: "nearest" });
      expect(scrollIntoView.mock.mock.contexts[0]).toBe(firstTarget);

      const search = within(toolbar).getByRole("searchbox", { name: "Search responses" });
      search.focus();
      expect(search).toHaveFocus();
      fireEvent.click(reviewRemaining);

      const secondTarget = document.activeElement;
      expect(secondTarget).toHaveAttribute("data-review-row", "unreviewed");
      expect(secondTarget?.tagName).toBe(rowTag);
      expect(scrollIntoView.mock).toHaveBeenNthCalledWith(2, { block: "nearest" });
      expect(scrollIntoView.mock.mock.contexts[1]).toBe(secondTarget);
      expect(primaryActions(toolbar)).toHaveLength(1);
      expect(primaryActions(toolbar)[0]).toHaveAccessibleName("Review remaining");
    } finally {
      scrollIntoView.restore();
    }
  },
  TEST_TIMEOUT,
);

it(
  "does not steal focus from score editing after Review remaining",
  () => {
    installMatchMedia(true);
    renderScores();
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });

    fireEvent.click(within(toolbar).getByRole("button", { name: "Accept high-confidence" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "Review remaining" }));
    fireEvent.click(within(toolbar).getByRole("checkbox", { name: /Only unreviewed/ }));

    const table = screen.getByRole("table", { name: "Student score review" });
    const unresolvedRow = table.querySelector(
      'tbody > tr[data-review-row="unreviewed"]',
    ) as HTMLTableRowElement;
    const score = within(unresolvedRow).getByRole("spinbutton") as HTMLInputElement;
    const nextScore = Number(score.value) === 10 ? 9 : Number(score.value) + 1;
    score.focus();
    fireEvent.change(score, { target: { value: String(nextScore) } });

    expect(score).toHaveFocus();
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
  "explains an unmatched search without claiming the review is complete",
  () => {
    renderScores();
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });
    fireEvent.change(within(toolbar).getByRole("searchbox", { name: "Search responses" }), {
      target: { value: "no-such-response" },
    });

    expect(
      screen.getByText(
        'No responses match "no-such-response". Try a different search or clear it.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Every row has been reviewed. Clear the filter to see them all."),
    ).not.toBeInTheDocument();
  },
  TEST_TIMEOUT,
);

it(
  "explains when status and search filters hide the remaining reviews",
  () => {
    renderScores();
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });

    fireEvent.click(within(toolbar).getByRole("button", { name: "Accept high-confidence" }));
    fireEvent.change(within(toolbar).getByRole("searchbox", { name: "Search responses" }), {
      target: { value: "EEE/022/0103" },
    });
    fireEvent.click(within(toolbar).getByRole("checkbox", { name: /Only unreviewed/ }));

    expect(
      screen.getByText(
        'No unreviewed responses match "EEE/022/0103". Try a different search or clear a filter.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(
        'No responses match "EEE/022/0103". Try a different search or clear it.',
      ),
    ).not.toBeInTheDocument();
  },
  TEST_TIMEOUT,
);

it(
  "prioritizes an exhausted review message over a nonblank search",
  () => {
    renderScores({ completionProbe: true });
    const toolbar = screen.getByRole("toolbar", { name: "Score review controls" });

    fireEvent.click(within(toolbar).getByRole("button", { name: "Accept high-confidence" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "Review remaining" }));
    fireEvent.change(within(toolbar).getByRole("searchbox", { name: "Search responses" }), {
      target: { value: "no-such-response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete remaining review" }));

    expect(screen.getByText("Every row has been reviewed. Clear the filter to see them all.")).toBeVisible();
    expect(
      screen.queryByText(
        'No responses match "no-such-response". Try a different search or clear it.',
      ),
    ).not.toBeInTheDocument();
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
