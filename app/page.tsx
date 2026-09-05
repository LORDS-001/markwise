import SetupPage from "@/components/setup-page";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SetupRoute() {
  // Send only a capability flag to the browser. Provider and service keys
  // remain in this server component; missing configuration selects the demo.
  const liveEnabled = Boolean(
    isSupabaseConfigured &&
    process.env.GEMINI_API_KEY?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  return <SetupPage liveEnabled={liveEnabled} />;
}
