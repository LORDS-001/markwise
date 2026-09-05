// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({ kind: "admin" })));

vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/supabase/config", () => ({
  SUPABASE_URL: "https://project.supabase.co",
}));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  createClient.mockClear();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

it("throws before a service key can be used in a browser", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  vi.stubGlobal("window", {});
  const { getAdminClient } = await import("@/lib/supabase/admin");

  expect(() => getAdminClient()).toThrow(/server-only/i);
  expect(createClient).not.toHaveBeenCalled();
});

it("returns null without the service role key", async () => {
  const { getAdminClient } = await import("@/lib/supabase/admin");
  expect(getAdminClient()).toBeNull();
  expect(createClient).not.toHaveBeenCalled();
});

it("creates a service-only client without a persisted auth session", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const { getAdminClient } = await import("@/lib/supabase/admin");

  expect(getAdminClient()).toEqual({ kind: "admin" });
  expect(createClient).toHaveBeenCalledWith(
    "https://project.supabase.co",
    "service-role-test-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
});
