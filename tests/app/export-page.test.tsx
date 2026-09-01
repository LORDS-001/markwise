import { useEffect, useRef, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import ExportPage from "@/app/export/page";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider, useSession } from "@/components/session-provider";
import { buildRows, classStats } from "@/lib/export";
import { ANSWERS, CLUSTERS, SESSION } from "@/lib/mock";

const downloadMocks = vi.hoisted(() => ({
  downloadXlsx: vi.fn(),
  downloadDocx: vi.fn(),
}));

vi.mock("@/lib/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export")>();
  return {
    ...actual,
    downloadXlsx: downloadMocks.downloadXlsx,
    downloadDocx: downloadMocks.downloadDocx,
  };
});

vi.mock("@/lib/supabase/client", () => ({
  getBrowserClient: () => null,
}));

beforeEach(() => {
  downloadMocks.downloadXlsx.mockReset().mockResolvedValue(undefined);
  downloadMocks.downloadDocx.mockReset().mockResolvedValue(undefined);
});

function ReviewedSession({ children }: { children: ReactNode }) {
  const { answers, setStatus } = useSession();
  const prepared = useRef(false);
  useEffect(() => {
    if (prepared.current) return;
    prepared.current = true;
    answers.forEach((answer) => setStatus(answer.id, "accepted"));
  }, [answers, setStatus]);
  return children;
}

function renderReadyExport() {
  return render(
    <AuthProvider>
      <SessionProvider>
        <ReviewedSession>
          <ExportPage />
        </ReviewedSession>
      </SessionProvider>
    </AuthProvider>,
  );
}

async function waitForReadyExport() {
  return screen.findByRole("heading", { level: 1, name: "Export reviewed results" });
}

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

it("orders the ready flow and keeps exactly one primary through validation and confirmation", async () => {
  const user = userEvent.setup();
  const { container } = renderReadyExport();
  await waitForReadyExport();

  const review = screen.getByRole("heading", { name: "Review complete" });
  const confirmation = screen.getByRole("heading", { name: "Lecturer confirmation" });
  const format = screen.getByRole("heading", { name: "Choose a format" });
  const preview = screen.getByRole("heading", { name: "Preview" });
  const account = screen.getByRole("region", { name: "Account connection" });

  expectBefore(review, confirmation);
  expectBefore(confirmation, format);
  expectBefore(format, preview);
  expectBefore(preview, account);
  expect(screen.getByText("First 6 of 40 reviewed rows shown here")).toBeVisible();
  expect(screen.queryByText(/exactly as they'll be written/i)).not.toBeInTheDocument();

  const reviewer = screen.getByRole("textbox", { name: "Confirmed by" });
  const confirm = screen.getByRole("button", { name: "Confirm reviewer" });
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);

  await user.clear(reviewer);
  await user.type(reviewer, "   ");
  expect(confirm).toBeDisabled();
  await user.clear(reviewer);
  await user.type(reviewer, "Prof. Reviewer");
  expect(confirm).toBeEnabled();

  await user.click(confirm);
  expect(reviewer).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Confirm reviewer" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download XLSX" })).toBeVisible();
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  expectBefore(account, screen.getByRole("heading", { name: "Download reviewed results" }));

  await user.click(screen.getByRole("button", { name: "Reopen for edits" }));
  expect(reviewer).toBeEnabled();
  expect(screen.queryByRole("heading", { name: "Download reviewed results" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm reviewer" })).toBeVisible();
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
}, 15_000);

it("uses native radio keyboard behavior and dispatches both formats with reviewed data", async () => {
  const user = userEvent.setup();
  renderReadyExport();
  await waitForReadyExport();

  const xlsx = screen.getByRole("radio", { name: /\.xlsx/i });
  const docx = screen.getByRole("radio", { name: /\.docx/i });
  expect(xlsx).toHaveAttribute("type", "radio");
  expect(docx).toHaveAttribute("type", "radio");
  expect(xlsx).toHaveAttribute("name", "export-format");
  expect(docx).toHaveAttribute("name", "export-format");
  expect(xlsx).toBeChecked();
  expect(docx).not.toBeChecked();

  const confirm = screen.getByRole("button", { name: "Confirm reviewer" });
  confirm.focus();
  await user.tab();
  expect(xlsx).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(docx).toHaveFocus();
  expect(docx).toBeChecked();
  expect(xlsx).not.toBeChecked();
  await user.keyboard("{ArrowLeft}");
  expect(xlsx).toHaveFocus();
  expect(xlsx).toBeChecked();

  await user.click(confirm);
  const xlsxWork = deferred<void>();
  downloadMocks.downloadXlsx.mockReturnValueOnce(xlsxWork.promise);
  await user.click(screen.getByRole("button", { name: "Download XLSX" }));
  expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();

  const reviewedRows = buildRows(
    ANSWERS.map((answer) => ({ ...answer, status: "accepted" })),
    CLUSTERS,
  );
  const reviewedStats = classStats(reviewedRows);
  expect(downloadMocks.downloadXlsx).toHaveBeenCalledWith(reviewedRows, reviewedStats, {
    courseCode: "EEE 301",
    question: SESSION.question,
    lecturer: "Dr. A. Daniel",
  });

  await act(async () => {
    xlsxWork.resolve();
    await xlsxWork.promise;
  });
  expect(screen.getByRole("button", { name: "Download XLSX" })).toBeEnabled();

  docx.focus();
  await user.keyboard(" ");
  expect(docx).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Download DOCX" }));
  expect(downloadMocks.downloadDocx).toHaveBeenCalledWith(reviewedRows, reviewedStats, {
    courseCode: "EEE 301",
    courseTitle: "Circuit Theory II",
    question: SESSION.question,
    lecturer: "Dr. A. Daniel",
    topMisconceptions: [
      { label: "Impedance and resistance are the same quantity", count: 15, pct: 37.5 },
      {
        label: "Reactance adds to resistance arithmetically, not in quadrature",
        count: 11,
        pct: 27.500000000000004,
      },
      {
        label: "The phase angle is between current and resistance, not voltage and current",
        count: 6,
        pct: 15,
      },
    ],
  });
}, 15_000);

it("keeps an export error visible through reopen and clears it on a successful retry", async () => {
  const user = userEvent.setup();
  downloadMocks.downloadXlsx.mockRejectedValueOnce(new Error("generation failed"));
  renderReadyExport();
  await waitForReadyExport();

  await user.click(screen.getByRole("button", { name: "Confirm reviewer" }));
  await user.click(screen.getByRole("button", { name: "Download XLSX" }));
  const message = "The file couldn't be generated. Try the other format, or reload the page.";
  expect(await screen.findByRole("alert")).toHaveTextContent(message);

  await user.click(screen.getByRole("button", { name: "Reopen for edits" }));
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  await user.click(screen.getByRole("button", { name: "Confirm reviewer" }));
  expect(screen.getByRole("alert")).toHaveTextContent(message);

  await user.click(screen.getByRole("button", { name: "Download XLSX" }));
  await waitFor(() => expect(downloadMocks.downloadXlsx).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
}, 15_000);
