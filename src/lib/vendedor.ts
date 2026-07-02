import type { createClient } from "@/lib/supabase/server";

// Nombre del vendedor que crea el documento: nombre de su perfil, o su correo
// como respaldo si todavía no lo cargó.
export async function resolverVendedor(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("user_id", user.id)
    .maybeSingle();
  return perfil?.nombre?.trim() || user.email || null;
}
