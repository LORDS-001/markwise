// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerClient = vi.hoisted(() => vi.fn());
const loadRun = vi.hoisted(() => vi.fn());
const persistRun = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ getServerClient }));
vi.mock("@/lib/db/persist", () => ({ loadRun, persistRun }));

function serverClient(options: {
  userId?: string | null;
  sessions?: unknown[];
  listError?: string;
  deleteError?: string;
}) {
  const eq = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === "sessions") {
      const result = {
        data: options.sessions ?? [],
        error: options.listError ? { message: options.listError } : null,
      };
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          eq(...args);
          return builder;
        },
        order: () => builder,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    }
    if (table === "clusters") {
      const result = {
        data: null,
        error: options.deleteError ? { message: options.deleteError } : null,
      };
      const builder = {
        update: () => builder,
        eq: (...args: unknown[]) => {
          eq(...args);
          return builder;
        },
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    }
    const result = {
      data: null,
      error: options.deleteError ? { message: options.deleteError } : null,
    };
    const builder = {
      delete: () => builder,
      in: () => builder,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  });
  return {
    client: {
      auth: {
        getUser: async () => ({ data: { user: options.userId ? { id: options.userId } : null } }),
      },
      from,
    },
    eq,
    from,
  };
}

beforeEach(() => {
  getServerClient.mockReset();
  loadRun.mockReset();
  persistRun.mockReset();
});

describe("session actions", () => {
  it("lists ready sessions explicitly scoped to the authenticated owner", async () => {
    const fake = serverClient({
      userId: "owner-1",
      sessions: [
        {
          id: "session-1",
          question: "Question",
          created_at: "2026-09-05T10:00:00Z",
          courses: { code: "EEE 301", title: "Circuit Theory" },
        },
      ],
    });
    getServerClient.mockResolvedValue(fake.client);
    const { listSessionsAction } = await import("@/app/session-actions");

    const result = await listSessionsAction();

    expect(result).toEqual({
      ok: true,
      sessions: [
        {
          id: "session-1",
          question: "Question",
          createdAt: "2026-09-05T10:00:00Z",
          courseCode: "EEE 301",
          courseTitle: "Circuit Theory",
        },
      ],
    });
    expect(fake.eq).toHaveBeenCalledWith("owner_id", "owner-1");
    expect(fake.eq).toHaveBeenCalledWith("status", "ready");
  });

  it("does not expose sessions without a verified user", async () => {
    const fake = serverClient({ userId: null });
    getServerClient.mockResolvedValue(fake.client);
    const { listSessionsAction } = await import("@/app/session-actions");

    const result = await listSessionsAction();

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/sign in/i) });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("loads through the owned loadRun query and reports missing sessions", async () => {
    const fake = serverClient({ userId: "owner-1" });
    getServerClient.mockResolvedValue(fake.client);
    loadRun.mockResolvedValue(null);
    const { loadSessionAction } = await import("@/app/session-actions");

    const result = await loadSessionAction({ sessionId: "session-1" });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/not found/i) });
  });

  it("surfaces pack invalidation failures to the edit queue", async () => {
    const fake = serverClient({ userId: "owner-1", deleteError: "write failed" });
    getServerClient.mockResolvedValue(fake.client);
    const { invalidateReteachPacksAction } = await import("@/app/session-actions");

    const result = await invalidateReteachPacksAction({ clusterIds: ["cluster-1"] });

    expect(result).toEqual({ ok: false, error: "write failed" });
  });

  it("scopes merged cluster shape updates to the selected owned row", async () => {
    const fake = serverClient({ userId: "owner-1" });
    getServerClient.mockResolvedValue(fake.client);
    const { updateClusterShapeAction } = await import("@/app/session-actions");

    const result = await updateClusterShapeAction({
      clusterId: "cluster-1",
      severity: 4,
      downstream: ["Resonance"],
    });

    expect(result).toEqual({ ok: true });
    expect(fake.eq).toHaveBeenCalledWith("id", "cluster-1");
  });

  it("retries saving a completed result under the verified owner without AI", async () => {
    const fake = serverClient({ userId: "owner-1" });
    getServerClient.mockResolvedValue(fake.client);
    persistRun.mockResolvedValue({ sessionId: "saved-session", result: { answers: [], clusters: [], reteachPacks: {}, maxScore: 10 } });
    const { saveCompletedRunAction } = await import("@/app/session-actions");
    const result = await saveCompletedRunAction({
      input: { question: "Q", scheme: "S", criteria: [], subject: "", level: "" },
      result: { answers: [], clusters: [], reteachPacks: {}, maxScore: 10 },
      prediction: "Prediction",
      course: { code: "EEE 301", title: "Circuit Theory" },
    });

    expect(result).toEqual({
      ok: true,
      sessionId: "saved-session",
      result: { answers: [], clusters: [], reteachPacks: {}, maxScore: 10 },
    });
    expect(persistRun).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-1" }));
  });

  it("rejects oversized retry payloads before persistence", async () => {
    const fake = serverClient({ userId: "owner-1" });
    getServerClient.mockResolvedValue(fake.client);
    const { saveCompletedRunAction } = await import("@/app/session-actions");
    const result = await saveCompletedRunAction({
      input: { question: "Q", scheme: "S", criteria: [], subject: "", level: "" },
      result: { answers: Array.from({ length: 101 }, () => ({})), clusters: [], reteachPacks: {}, maxScore: 10 } as never,
      prediction: "",
      course: { code: "", title: "" },
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/100/) });
    expect(persistRun).not.toHaveBeenCalled();
  });
});
