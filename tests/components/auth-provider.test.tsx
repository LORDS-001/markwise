import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";

const getBrowserClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({ getBrowserClient }));

function createClient(updateError: { message: string } | null = null) {
  const subscription = { unsubscribe: vi.fn() };
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "anon-1", email: null } } },
      }),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { user: { id: "created-anon", email: null } },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription } }),
      updateUser: vi.fn().mockResolvedValue({ error: updateError }),
    },
  };
}

function Probe() {
  const { status, pendingEmail, linking, error, linkEmail } = useAuth();
  const [result, setResult] = useState("");
  return (
    <>
      <button
        onClick={async () => {
          setResult(String(await linkEmail("lecturer@example.edu")));
        }}
      >
        Connect
      </button>
      <output aria-label="Status">{status}</output>
      <output aria-label="Pending email">{pendingEmail}</output>
      <output aria-label="Linking">{String(linking)}</output>
      <output aria-label="Error">{error}</output>
      <output aria-label="Result">{result}</output>
    </>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  getBrowserClient.mockReset().mockReturnValue(null);
});

it("reports unavailable linking without claiming session persistence", async () => {
  const user = userEvent.setup();
  renderProbe();
  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(screen.getByLabelText("Error")).toHaveTextContent(
    "Account linking is unavailable in this preview.",
  );
  expect(screen.getByLabelText("Result")).toHaveTextContent("false");
});

it("passes the email and redirect to updateUser then exposes the pending state", async () => {
  const user = userEvent.setup();
  const client = createClient();
  getBrowserClient.mockReturnValue(client);
  renderProbe();
  expect(await screen.findByText("anonymous", { selector: 'output[aria-label="Status"]' })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(client.auth.updateUser).toHaveBeenCalledWith(
    { email: "lecturer@example.edu" },
    { emailRedirectTo: "http://localhost:3000/export" },
  );
  expect(screen.getByLabelText("Pending email")).toHaveTextContent("lecturer@example.edu");
  expect(screen.getByLabelText("Linking")).toHaveTextContent("false");
  expect(screen.getByLabelText("Result")).toHaveTextContent("true");
  expect(screen.getByLabelText("Error")).toBeEmptyDOMElement();
});

it("propagates updateUser errors without setting a pending email", async () => {
  const user = userEvent.setup();
  const client = createClient({ message: "Email already linked" });
  getBrowserClient.mockReturnValue(client);
  renderProbe();
  expect(await screen.findByText("anonymous", { selector: 'output[aria-label="Status"]' })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(screen.getByLabelText("Error")).toHaveTextContent("Email already linked");
  expect(screen.getByLabelText("Pending email")).toBeEmptyDOMElement();
  expect(screen.getByLabelText("Linking")).toHaveTextContent("false");
  expect(screen.getByLabelText("Result")).toHaveTextContent("false");
});
