// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const backend = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => backend);
vi.mock("@/lib/supabase/config", () => ({
  SUPABASE_URL: "https://project.example", SUPABASE_ANON_KEY: "public-test-key", isSupabaseConfigured: true,
}));

beforeEach(() => { backend.createServerClient.mockReset(); });

it("forwards refreshed authentication cookies to this request and the browser", async () => {
  backend.createServerClient.mockImplementation((_url, _key, options) => ({
    auth: { getUser: async () => {
      options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true } }]);
      return { data: { user: { id: "user" } }, error: null };
    } },
  }));
  const { proxy } = await import("@/proxy");
  const request = new NextRequest("http://localhost/map", { headers: { cookie: "session=expired" } });
  const response = await proxy(request);
  expect(request.cookies.get("session")?.value).toBe("refreshed");
  expect(response.cookies.get("session")?.value).toBe("refreshed");
});

it("lets the demo render during an authentication service outage", async () => {
  backend.createServerClient.mockReturnValue({ auth: { getUser: async () => { throw new Error("network"); } } });
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest("http://localhost/map"));
  expect(response.status).toBe(200);
});
