import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Rol = "admin" | "usuario";

export type PerfilActual = {
  userId: string;
  email: string | null;
  rol: Rol;
};

// Rol del usuario logueado. Lee su propia fila de perfiles (RLS "own perfil" lo
// permite). Si no hay sesión o no tiene perfil, devuelve null.
export async function getPerfilActual(): Promise<PerfilActual | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    rol: (perfil?.rol as Rol) ?? "usuario",
  };
}

export async function esAdmin(): Promise<boolean> {
  const perfil = await getPerfilActual();
  return perfil?.rol === "admin";
}

// Para páginas server: exige sesión admin o redirige. Devuelve el perfil.
export async function requireAdmin(): Promise<PerfilActual> {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  if (perfil.rol !== "admin") redirect("/dashboard");
  return perfil;
}
