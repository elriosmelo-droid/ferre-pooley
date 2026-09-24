import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PerfilActual } from "@/lib/auth/rol";

// Opciones del selector de proveedor. Proveedores son solo de admin (RLS):
// para los demás devuelve undefined y el form no muestra el campo.
export async function proveedoresOpciones(
  perfil: PerfilActual
): Promise<{ id: string; nombre: string }[] | undefined> {
  if (perfil.rol !== "admin") return undefined;
  const supabase = await createClient();
  const { data } = await supabase
    .from("proveedores")
    .select("id, rut, razon_social")
    .order("razon_social");
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.razon_social ? `${p.razon_social} (${p.rut})` : p.rut,
  }));
}
