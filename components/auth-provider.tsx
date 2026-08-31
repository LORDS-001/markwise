"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Anonymous-first authentication.
 *
 * A visitor gets a real Supabase user on arrival — no form, no email — so the
 * whole product is usable before anyone is asked for anything. RLS keys off
 * `auth.uid()`, which an anonymous user has just like a permanent one.
 *
 * Linking an email later calls `updateUser`, which keeps the same user id and
 * therefore the same rows. This is why we must not use `signInWithOtp` here:
 * that would mint a *new* user and strand the lecturer's batch under the old
 * anonymous id.
 */

export type AuthStatus = "loading" | "demo" | "anonymous" | "linked";

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  /** Set once a confirmation email is out but the link hasn't been clicked. */
  pendingEmail: string | null;
  linking: boolean;
  error: string | null;
  linkEmail: (email: string) => Promise<boolean>;
  dismissError: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getBrowserClient();

  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "demo");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const apply = (user: { id: string; email?: string | null } | null) => {
      if (cancelled) return;
      if (!user) {
        setUserId(null);
        setEmail(null);
        setStatus("anonymous");
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? null);
      setStatus(user.email ? "linked" : "anonymous");
      if (user.email) setPendingEmail(null);
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session?.user) {
        apply(data.session.user);
        return;
      }

      // First visit: mint an anonymous user so the session has an owner.
      const { data: created, error: signInError } =
        await supabase.auth.signInAnonymously();
      if (cancelled) return;

      if (signInError) {
        // Most often this means anonymous sign-in is off in the dashboard.
        // Fall back to demo data rather than blocking the whole app.
        setStatus("demo");
        return;
      }
      apply(created.user ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const linkEmail = useCallback(
    async (next: string) => {
      if (!supabase) {
        // Demo mode: accept the address for the provenance line, but there is
        // nowhere to persist it. Say so rather than pretending it saved.
        setError("Connect Supabase to keep this session across devices.");
        return false;
      }
      setLinking(true);
      setError(null);
      const { error: updateError } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: `${window.location.origin}/export` },
      );
      setLinking(false);

      if (updateError) {
        setError(updateError.message);
        return false;
      }
      setPendingEmail(next);
      return true;
    },
    [supabase],
  );

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      userId,
      email,
      pendingEmail,
      linking,
      error,
      linkEmail,
      dismissError,
    }),
    [status, userId, email, pendingEmail, linking, error, linkEmail, dismissError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
