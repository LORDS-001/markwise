import SetupPage from "@/components/setup-page";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SetupRoute() {
  // Send only a capability flag to the browser. Provider and service keys
  // remain in this server component; missing configuration selects the demo.
  // Both provider keys: a run extracts on Claude and embeds on Gemini, so
  // checking one would offer live analysis that the run endpoint then refuses
  // with a 503 — the promise the demo fallback exists to avoid making.
  const liveEnabled = Boolean(
    isSupabaseConfigured &&
    process.env.ANTHROPIC_API_KEY?.trim() &&
    process.env.GEMINI_API_KEY?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  return <SetupPage liveEnabled={liveEnabled} />;
}
