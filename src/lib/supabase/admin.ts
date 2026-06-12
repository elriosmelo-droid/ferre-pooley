import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service role: salta RLS. Usar SOLO en el flujo público de
// aceptación por token y otras operaciones de servidor sin sesión.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
