import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ClusterDetailPage from "@/app/clusters/[id]/page";
import { SessionProvider } from "@/components/session-provider";

const navigation = vi.hoisted(() => ({
  id: "cl-impedance",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => navigation,
}));

afterEach(() => {
  navigation.id = "cl-impedance";
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <SessionProvider>
      <ClusterDetailPage />
    </SessionProvider>,
  );
}

async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
  options: { shift?: boolean } = {},
) {
  for (let index = 0; index < 100; index += 1) {
    if (document.activeElement === target) return;
    await user.tab({ shift: options.shift });
  }
  throw new Error(`Could not reach ${target.textContent || target.getAttribute("aria-label")}`);
}

it("restores keyboard focus to Split after confirming a split", async () => {
  const user = userEvent.setup();
  renderPage();

  const split = screen.getByRole("button", { name: /^split$/i });
  await tabTo(user, split);
  await user.keyboard("{Enter}");

  const checkbox = screen.getAllByRole("checkbox")[0];
  await tabTo(user, checkbox, { shift: true });
  await user.keyboard(" ");

  const name = screen.getByRole("textbox", { name: "New cluster name" });
  await tabTo(user, name);
  await user.keyboard("New group");

  const confirm = screen.getByRole("button", { name: "Split 1 selected" });
  await tabTo(user, confirm);
  await user.keyboard("{Enter}");

  expect(screen.queryByText("EEE/022/0103")).not.toBeInTheDocument();
  expect(navigation.push).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: /^split$/i })).toHaveFocus());
  expect(document.body).not.toHaveFocus();
}, 15_000);

it("moves focus to map recovery when a split removes its source cluster", async () => {
  const user = userEvent.setup();
  renderPage();

  fireEvent.click(screen.getByRole("button", { name: /^split$/i }));
  screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));

  const name = screen.getByRole("textbox", { name: "New cluster name" });
  await user.click(name);
  await user.keyboard("Replacement cluster");
  await user.tab();
  expect(screen.getByRole("button", { name: "Split 15 selected" })).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(screen.getByRole("heading", { name: "This cluster no longer exists" })).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Back to misconception map" })).toHaveFocus(),
  );
  expect(document.body).not.toHaveFocus();
}, 10_000);

it("updates split selection through the checkbox itself", async () => {
  const user = userEvent.setup();
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: /^split$/i }));
  const checkbox = screen.getAllByRole("checkbox")[0];
  checkbox.focus();
  await user.keyboard(" ");
  fireEvent.change(screen.getByRole("textbox", { name: "New cluster name" }), {
    target: { value: "New group" },
  });
  expect(checkbox).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Split 1 selected" }));
  expect(screen.queryByText("EEE/022/0103")).not.toBeInTheDocument();
  expect(navigation.push).not.toHaveBeenCalled();
}, 10_000);

it("puts verbatim evidence before the roster and cluster editing", () => {
  renderPage();

  const evidence = screen.getByRole("heading", { name: "Verbatim evidence" });
  const roster = screen.getByRole("heading", { name: "Affected students" });
  const editing = screen.getByRole("heading", { name: "Edit cluster" });

  expect(evidence.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(roster.compareDocumentPosition(editing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("Why these responses belong together")).toBeVisible();
});

it("uses the page action area for split confirmation", () => {
  const { container } = renderPage();

  fireEvent.click(screen.getByRole("button", { name: /^split$/i }));

  expect(screen.getByRole("region", { name: "Page actions" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Split 0 selected" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
  expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
});

it("keeps the rename mutation on its existing path", () => {
  renderPage();

  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  const name = screen.getByRole("textbox", { name: "Cluster name" });
  fireEvent.change(name, { target: { value: "Resistance-only model" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByText("Resistance-only model")).toBeVisible();
});

it("keeps the merge mutation and target route on their existing paths", () => {
  renderPage();

  fireEvent.click(screen.getByRole("button", { name: "Merge" }));
  fireEvent.click(
    screen.getByRole("radio", {
      name: /Reactance adds to resistance arithmetically/i,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Merge into selected" }));

  expect(navigation.push).toHaveBeenCalledWith("/clusters/cl-arithmetic");
  expect(screen.getByRole("heading", { name: "This cluster no longer exists" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to misconception map" })).toHaveAttribute(
    "href",
    "/map",
  );
});

it("keeps the rejected-cluster fallback linked to the misconception map", () => {
  renderPage();

  fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
  fireEvent.click(screen.getByRole("button", { name: "Reject this cluster" }));

  expect(screen.getByRole("heading", { name: "This cluster no longer exists" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to misconception map" })).toHaveAttribute(
    "href",
    "/map",
  );
  expect(navigation.push).toHaveBeenCalledWith("/map");
});

it("keeps a missing cluster linked back to the misconception map", () => {
  navigation.id = "cl-missing";
  renderPage();

  expect(screen.getByRole("heading", { name: "This cluster no longer exists" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to misconception map" })).toHaveAttribute(
    "href",
    "/map",
  );
});
