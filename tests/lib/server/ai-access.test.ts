// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerClient = vi.hoisted(() => vi.fn());
const getAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ getServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));

const requestClient = {
  auth: { getUser: vi.fn() },
};
const adminClient = {
  rpc: vi.fn(),
  from: vi.fn(),
};

beforeEach(() => {
  vi.resetModules();
  getServerClient.mockReset();
  getAdminClient.mockReset();
  requestClient.auth.getUser.mockReset();
  adminClient.rpc.mockReset();
  adminClient.from.mockReset();
  getServerClient.mockResolvedValue(requestClient);
  getAdminClient.mockReturnValue(adminClient);
  requestClient.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  adminClient.rpc.mockResolvedValue({
    data: [{ allowed: true, reason: null, retry_after_seconds: 0 }],
    error: null,
  });
});

describe("authorizeAiRequest", () => {
  it("requires a verified Supabase user for lecturer operations", async () => {
    requestClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { authorizeAiRequest } = await import("@/lib/server/ai-access");

    await expect(authorizeAiRequest("run")).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when persistence or service administration is unavailable", async () => {
    getAdminClient.mockReturnValue(null);
    const { authorizeAiRequest } = await import("@/lib/server/ai-access");

    await expect(authorizeAiRequest("reteach")).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("turns quota backend failures into a safe 503", async () => {
    adminClient.rpc.mockRejectedValue(new Error("database secret detail"));
    const { authorizeAiRequest } = await import("@/lib/server/ai-access");

    const result = await authorizeAiRequest("run");

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(result)).not.toContain("database secret detail");
  });

  it("uses the atomic service-only quota and returns the request client", async () => {
    const { authorizeAiRequest } = await import("@/lib/server/ai-access");

    await expect(authorizeAiRequest("run")).resolves.toEqual({
      ok: true,
      supabase: requestClient,
      userId: "user-1",
    });
    expect(adminClient.rpc).toHaveBeenCalledWith("authorize_ai_request", {
      p_operation: "run",
      p_principal: "user:user-1",
    });
  });

  it("returns 429 when the durable quota refuses the operation", async () => {
    adminClient.rpc.mockResolvedValue({
      data: [{ allowed: false, reason: "principal_limit", retry_after_seconds: 3600 }],
      error: null,
    });
    const { authorizeAiRequest } = await import("@/lib/server/ai-access");

    await expect(authorizeAiRequest("run")).resolves.toMatchObject({
      ok: false,
      status: 429,
    });
  });

  it("resolves diagnostic tokens with the admin client and never sends the token as quota identity", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { session: { owner_id: "owner-1" } },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    adminClient.from.mockReturnValue({ select });
    const { authorizeAiRequest } = await import("@/lib/server/ai-access");

    const result = await authorizeAiRequest("diagnostic", "real-secret-token");

    expect(result).toMatchObject({ ok: true, supabase: adminClient, userId: "owner-1" });
    const quotaArgs = adminClient.rpc.mock.calls[0][1];
    expect(quotaArgs.p_principal).toMatch(/^token:[a-f0-9]{64}$/);
    expect(JSON.stringify(quotaArgs)).not.toContain("real-secret-token");
  });
});
