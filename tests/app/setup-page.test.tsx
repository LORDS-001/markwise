import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import SetupPage from "@/app/page";
import { SessionProvider } from "@/components/session-provider";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

class DeferredFileReader {
  static instances: DeferredFileReader[] = [];

  private storedResult: string | ArrayBuffer | null = null;
  resultReadCount = 0;
  onload: FileReader["onload"] = null;
  onerror: FileReader["onerror"] = null;
  abortShouldThrow = false;
  abort = vi.fn(() => {
    if (this.abortShouldThrow) throw new DOMException("Reader already closed", "InvalidStateError");
  });
  readAsText = vi.fn((file: Blob) => void file);

  constructor() {
    DeferredFileReader.instances.push(this);
  }

  get result() {
    this.resultReadCount += 1;
    return this.storedResult;
  }

  set result(value: string | ArrayBuffer | null) {
    this.storedResult = value;
  }

  complete(text: string) {
    this.result = text;
    this.onload?.call(
      this as unknown as FileReader,
      new ProgressEvent("load") as unknown as ProgressEvent<FileReader>,
    );
  }

  fail() {
    this.onerror?.call(
      this as unknown as FileReader,
      new ProgressEvent("error") as unknown as ProgressEvent<FileReader>,
    );
  }
}

function installDeferredFileReader() {
  DeferredFileReader.instances = [];
  vi.stubGlobal("FileReader", DeferredFileReader);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  expect(csvInput).toHaveAttribute("required");
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

it("does not count hidden pasted answers while the unsupported Photos mode is active", async () => {
  const user = userEvent.setup();
  renderSetup();

  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeEnabled();
  expect(screen.getByText("40 detected")).toBeVisible();

  await user.click(screen.getByRole("tab", { name: /Photos/ }));

  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeDisabled();
  expect(screen.queryByText("40 detected")).not.toBeInTheDocument();
});

it("clears a rejected file selection so the same path can be chosen again", async () => {
  const user = userEvent.setup({ applyAccept: false });
  const { container } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
  const rejected = new File(["not a spreadsheet"], "answers.txt", { type: "text/plain" });

  await user.upload(fileInput!, rejected);

  expect(screen.getByRole("alert")).toHaveAccessibleName("CSV upload failed");
  expect(fileInput).toHaveValue("");

  await user.upload(fileInput!, rejected);
  expect(screen.getByRole("alert")).toHaveAccessibleName("CSV upload failed");
});

it("keeps an accepted CSV natively valid across mode changes until Setup is cleared", async () => {
  const user = userEvent.setup();
  const { container } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>("#answers-csv");
  const preview = screen.getByRole("button", { name: "Preview sample analysis" });
  const accepted = new File(
    ["student,answer\nS1,First response\nS2,Second response"],
    "accepted-answers.csv",
    { type: "text/csv" },
  );

  await user.upload(fileInput!, accepted);

  const acceptedStatus = await screen.findByRole("status");
  expect(acceptedStatus).toHaveTextContent("accepted-answers.csv");
  expect(acceptedStatus).toHaveTextContent("2 rows");
  expect(fileInput?.files).toHaveLength(1);
  expect(fileInput?.files?.item(0)?.name).toBe("accepted-answers.csv");
  expect(fileInput).not.toHaveAttribute("required");
  expect(fileInput).toHaveAttribute("aria-required", "true");
  expect(fileInput?.validity.valueMissing).toBe(false);
  expect(fileInput?.checkValidity()).toBe(true);
  expect(preview).toBeEnabled();

  await user.click(screen.getByRole("tab", { name: "Paste" }));
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));

  expect(fileInput?.files?.item(0)?.name).toBe("accepted-answers.csv");
  expect(fileInput).not.toHaveAttribute("required");
  expect(fileInput).toHaveAttribute("aria-required", "true");
  expect(fileInput?.validity.valueMissing).toBe(false);
  expect(fileInput?.checkValidity()).toBe(true);
  expect(preview).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Clear" }));

  expect(fileInput).toHaveValue("");
  expect(fileInput).toBeRequired();
  expect(fileInput).toHaveAttribute("required");
  expect(fileInput).toHaveAttribute("aria-required", "true");
  expect(fileInput?.validity.valueMissing).toBe(true);
  expect(fileInput?.checkValidity()).toBe(false);
  expect(screen.queryByText("accepted-answers.csv")).not.toBeInTheDocument();
  expect(preview).toBeDisabled();
});

it.each(["Clear", "Load demo class"])(
  "ignores a pending CSV read completed after %s resets Setup",
  async (resetAction) => {
    installDeferredFileReader();
    const user = userEvent.setup();
    const { container } = renderSetup();
    await user.click(screen.getByRole("tab", { name: "CSV upload" }));
    const fileInput = container.querySelector<HTMLInputElement>("#answers-csv")!;

    await user.upload(
      fileInput,
      new File(["pending"], "stale-answers.csv", { type: "text/csv" }),
    );
    const staleReader = DeferredFileReader.instances[0];

    await user.click(screen.getByRole("button", { name: resetAction }));
    act(() => {
      staleReader.complete("student,answer\nS1,First\nS2,Second");
    });
    if (resetAction === "Load demo class") {
      await user.click(screen.getByRole("tab", { name: "CSV upload" }));
    }

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("stale-answers.csv")).not.toBeInTheDocument();
    expect(fileInput).toHaveValue("");
    expect(fileInput).toHaveAttribute("required");
    expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeDisabled();
  },
);

it("keeps the newest completed CSV when an older read finishes last", async () => {
  installDeferredFileReader();
  const user = userEvent.setup();
  const { container } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>("#answers-csv")!;

  await user.upload(
    fileInput,
    new File(["first"], "first-answers.csv", { type: "text/csv" }),
  );
  const firstReader = DeferredFileReader.instances[0];
  await user.upload(
    fileInput,
    new File(["second"], "second-answers.csv", { type: "text/csv" }),
  );
  const secondReader = DeferredFileReader.instances[1];

  act(() => {
    secondReader.complete("student,answer\nS1,First\nS2,Second");
  });
  expect(screen.getByRole("status")).toHaveTextContent("second-answers.csv");
  expect(screen.getByRole("status")).toHaveTextContent("2 rows");

  act(() => {
    firstReader.complete("student,answer\nS1,First\nS2,Second\nS3,Third");
  });

  expect(screen.getByRole("status")).toHaveTextContent("second-answers.csv");
  expect(screen.getByRole("status")).toHaveTextContent("2 rows");
  expect(screen.queryByText("first-answers.csv")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeEnabled();
});

it("keeps a rejected replacement authoritative when an older CSV finishes", async () => {
  installDeferredFileReader();
  const user = userEvent.setup({ applyAccept: false });
  const { container } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>("#answers-csv")!;

  await user.upload(
    fileInput,
    new File(["pending"], "stale-answers.csv", { type: "text/csv" }),
  );
  const staleReader = DeferredFileReader.instances[0];
  await user.upload(
    fileInput,
    new File(["rejected"], "replacement.txt", { type: "text/plain" }),
  );

  act(() => {
    staleReader.complete("student,answer\nS1,First\nS2,Second");
  });

  expect(screen.getByRole("alert")).toHaveAccessibleName("CSV upload failed");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(fileInput).toHaveValue("");
  expect(fileInput).toHaveAttribute("required");
  expect(screen.getByRole("button", { name: "Preview sample analysis" })).toBeDisabled();
});

it("invalidates a failed read and permits a same-path retry", async () => {
  installDeferredFileReader();
  const user = userEvent.setup();
  const { container } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>("#answers-csv")!;
  const retryFile = new File(["pending"], "retry-answers.csv", { type: "text/csv" });

  await user.upload(fileInput, retryFile);
  const failedReader = DeferredFileReader.instances[0];
  act(() => {
    failedReader.fail();
    failedReader.complete("student,answer\nS1,Stale\nS2,Stale");
  });

  expect(screen.getByRole("alert")).toHaveAccessibleName("CSV upload failed");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(fileInput).toHaveValue("");

  await user.upload(fileInput, retryFile);
  const retryReader = DeferredFileReader.instances[1];
  act(() => {
    retryReader.complete("student,answer\nS1,First\nS2,Second");
  });
  expect(screen.getByRole("status")).toHaveTextContent("retry-answers.csv");
});

it("contains abort errors while cleaning up a pending read on unmount", async () => {
  installDeferredFileReader();
  const user = userEvent.setup();
  const { container, unmount } = renderSetup();
  await user.click(screen.getByRole("tab", { name: "CSV upload" }));
  const fileInput = container.querySelector<HTMLInputElement>("#answers-csv")!;

  await user.upload(
    fileInput,
    new File(["pending"], "unmount-answers.csv", { type: "text/csv" }),
  );
  const unmountedReader = DeferredFileReader.instances[0];
  unmountedReader.abortShouldThrow = true;

  expect(() => unmount()).not.toThrow();
  expect(unmountedReader.abort).toHaveBeenCalledOnce();
  act(() => {
    unmountedReader.complete("student,answer\nS1,Stale\nS2,Stale");
  });
  expect(unmountedReader.resultReadCount).toBe(0);
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
