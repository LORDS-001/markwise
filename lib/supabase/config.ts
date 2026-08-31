/**
 * Supabase is optional at runtime.
 *
 * With no credentials the app runs entirely on the seeded demo class, which
 * keeps the deployed demo and the local dev loop working before a project
 * exists — and means a missing env var can never take the live URL down
 * during judging.
 *
 * These must be referenced as literal `process.env.NEXT_PUBLIC_*` reads so
 * Next inlines them into the client bundle at build time.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
