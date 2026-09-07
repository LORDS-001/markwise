import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

export type AiOperation = "run" | "reteach" | "diagnostic";

export type AiAuthorization =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; error: string; status: number };

interface QuotaDecision {
  allowed: boolean;
  reason: string | null;
  retry_after_seconds: number;
}

function unavailable(): AiAuthorization {
  return {
    ok: false,
    error:
      "Live AI is unavailable because secure persistence is not configured. Configure Supabase and its service role key, then try again.",
    status: 503,
  };
}

async function consumeQuota(
  admin: SupabaseClient,
  operation: AiOperation,
  principal: string,
): Promise<AiAuthorization | null> {
  const { data, error } = await admin.rpc("authorize_ai_request", {
    p_operation: operation,
    p_principal: principal,
  });

  if (error) return unavailable();
  const row = (Array.isArray(data) ? data[0] : data) as QuotaDecision | null;
  if (!row || typeof row.allowed !== "boolean") return unavailable();
  if (row.allowed) return null;

  return {
    ok: false,
    error:
      row.reason === "global_limit"
        ? "The service-wide AI budget has been reached. Try again tomorrow."
        : "Your daily AI budget has been reached. Try again tomorrow.",
    status: 429,
  };
}

/**
 * Authorizes one paid AI operation and consumes its durable daily allowance.
 * Lecturer operations return the cookie-bound client so subsequent reads and
 * persistence stay under the verified user. Diagnostics resolve their opaque
 * token with the service client and return that same service client to the
 * server-only grading flow.
 */
export async function authorizeAiRequest(
  operation: AiOperation,
  token?: string,
): Promise<AiAuthorization> {
  try {
    if (!(["run", "reteach", "diagnostic"] as string[]).includes(operation)) {
      return { ok: false, error: "Unknown AI operation.", status: 400 };
    }
    const admin = getAdminClient();
    if (!admin) return unavailable();

    if (operation === "diagnostic") {
      const diagnosticToken = token?.trim();
      if (!diagnosticToken || diagnosticToken.length > 256) {
        return { ok: false, error: "A valid diagnostic token is required.", status: 400 };
      }

      const { data, error } = await admin
        .from("answers")
        .select("session:sessions!inner(owner_id)")
        .eq("diagnostic_token", diagnosticToken)
        .maybeSingle();
      const session = (data as { session?: { owner_id?: string } } | null)?.session;
      if (error || !session?.owner_id) {
        return { ok: false, error: "This diagnostic link is invalid.", status: 404 };
      }

      const digest = createHash("sha256").update(diagnosticToken).digest("hex");
      const quotaFailure = await consumeQuota(
        admin,
        operation,
        `token:${digest}`,
      );
      if (quotaFailure) return quotaFailure;
      return { ok: true, supabase: admin, userId: session.owner_id };
    }

    const supabase = await getServerClient();
    if (!supabase) return unavailable();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return {
        ok: false,
        error: "Sign in before using live AI features.",
        status: 401,
      };
    }

    const quotaFailure = await consumeQuota(
      admin,
      operation,
      `user:${user.id}`,
    );
    if (quotaFailure) return quotaFailure;
    return { ok: true, supabase, userId: user.id };
  } catch {
    return unavailable();
  }
}
