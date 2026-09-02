import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountLink } from "@/components/account-link";
import { AuthProvider } from "@/components/auth-provider";

const getBrowserClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({ getBrowserClient }));

type FakeUser = { id: string; email?: string | null };
type UpdateResult = { error: { message: string } | null };

function createClient({
  session = { user: { id: "anon-1", email: null } },
  sessionPromise,
  updatePromise = Promise.resolve({ error: null }),
}: {
  session?: { user: FakeUser } | null;
  sessionPromise?: Promise<{ data: { session: { user: FakeUser } | null } }>;
  updatePromise?: Promise<UpdateResult>;
} = {}) {
  const subscription = { unsubscribe: vi.fn() };
  return {
    auth: {
      getSession: vi.fn(() => sessionPromise ?? Promise.resolve({ data: { session } })),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { user: { id: "created-anon", email: null } },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription } }),
      updateUser: vi.fn(() => updatePromise),
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderAccount() {
  return render(
    <AuthProvider>
      <AccountLink />
    </AuthProvider>,
  );
}

beforeEach(() => {
  getBrowserClient.mockReset().mockReturnValue(null);
});

it("names the loading account region while the session resolves", () => {
  getBrowserClient.mockReturnValue(
    createClient({ sessionPromise: new Promise(() => undefined) }),
  );
  renderAccount();
  expect(screen.getByRole("region", { name: "Account connection" })).toBeVisible();
});

it("names the linked region and states the preview sync limit exactly", async () => {
  getBrowserClient.mockReturnValue(
    createClient({ session: { user: { id: "linked-1", email: "lecturer@example.edu" } } }),
  );
  renderAccount();
  const region = screen.getByRole("region", { name: "Account connection" });
  await waitFor(() =>
    expect(region).toHaveTextContent(
      "Signed in as lecturer@example.edu. Batch results are not synced in this preview.",
    ),
  );
});

it("names the demo region and uses the approved tab-lifetime copy", () => {
  renderAccount();
  const region = screen.getByRole("region", { name: "Account connection" });
  expect(region).toHaveTextContent("Connect an email");
  expect(region).toHaveTextContent(
    "Use an email for your Markwise identity. This demo batch remains in this tab.",
  );
  expect(screen.queryByRole("button", { name: "Connect email" })).not.toBeInTheDocument();
});

it("validates anonymous email input and disables linking while the request is pending", async () => {
  const user = userEvent.setup();
  const update = deferred<UpdateResult>();
  getBrowserClient.mockReturnValue(createClient({ updatePromise: update.promise }));
  renderAccount();

  const region = screen.getByRole("region", { name: "Account connection" });
  const email = await screen.findByRole("textbox", { name: "Email address" });
  const connect = screen.getByRole("button", { name: "Connect email" });
  expect(region).toHaveTextContent("Connect an email");
  expect(region).toHaveTextContent(
    "Use an email for your Markwise identity. This demo batch remains in this tab.",
  );
  expect(connect).toBeDisabled();
  await user.type(email, "not-an-email");
  expect(connect).toBeDisabled();
  await user.clear(email);
  await user.type(email, "lecturer@example.edu");
  expect(connect).toBeEnabled();

  await user.click(connect);
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await act(async () => {
    update.resolve({ error: null });
    await update.promise;
  });
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "Account connection" })).toHaveTextContent(
      "Check lecturer@example.edu and click the link to finish. You can export now either way.",
    ),
  );
}, 15_000);

it("keeps an account-link error explanatory, optional, and free of a competing primary action", async () => {
  const user = userEvent.setup();
  getBrowserClient.mockReturnValue(
    createClient({ updatePromise: Promise.resolve({ error: { message: "Email already linked" } }) }),
  );
  const { container } = renderAccount();

  await user.type(
    await screen.findByRole("textbox", { name: "Email address" }),
    "lecturer@example.edu",
  );
  await user.click(screen.getByRole("button", { name: "Connect email" }));

  const region = screen.getByRole("region", { name: "Account connection" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Email already linked");
  expect(region).toHaveTextContent("Optional — export works without it.");
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Connect email" })).toBeEnabled();
});

it("names the pending region and preserves its exact export-availability copy", async () => {
  const user = userEvent.setup();
  getBrowserClient.mockReturnValue(createClient());
  renderAccount();
  await user.type(await screen.findByRole("textbox", { name: "Email address" }), "lecturer@example.edu");
  await user.click(screen.getByRole("button", { name: "Connect email" }));

  const region = screen.getByRole("region", { name: "Account connection" });
  await waitFor(() =>
    expect(region).toHaveTextContent(
      "Check lecturer@example.edu and click the link to finish. You can export now either way.",
    ),
  );
});
