import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ReteachPackPage from "@/app/reteach/[id]/page";

const state = vi.hoisted(() => ({
  clusters: [{ id: "cluster", label: "Belief", memberIds: [], tone: 1 }],
  answers: [], processed: true, totalAnswers: 0, reteachPacks: {},
  setReteachPack: vi.fn(), context: {}, sessionId: "saved-session", flushChanges: vi.fn(),
}));
const generateReteachAction = vi.hoisted(() => vi.fn());
vi.mock("@/components/session-provider", () => ({ useSession: () => state }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "cluster" }) }));
vi.mock("@/app/actions", () => ({ generateReteachAction }));

it("waits for edits to persist before generating against their saved context", async () => {
  let finish!: (ok: boolean) => void;
  state.flushChanges.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
  generateReteachAction.mockResolvedValue({ ok: false, error: "Expected test stop" });
  render(<ReteachPackPage />);
  fireEvent.click(screen.getByRole("button", { name: "Generate reteach pack" }));
  await waitFor(() => expect(state.flushChanges).toHaveBeenCalledTimes(1));
  expect(generateReteachAction).not.toHaveBeenCalled();
  finish(true);
  await waitFor(() => expect(generateReteachAction).toHaveBeenCalledTimes(1));
});

it("blocks generation when the latest cluster edits could not be saved", async () => {
  state.flushChanges.mockResolvedValue(false);
  render(<ReteachPackPage />);
  fireEvent.click(screen.getByRole("button", { name: "Generate reteach pack" }));
  expect(await screen.findByText(/latest edits have not been saved/)).toBeVisible();
  expect(generateReteachAction).not.toHaveBeenCalled();
});
