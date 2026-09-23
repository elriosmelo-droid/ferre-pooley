import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MODULOS,
  normalizarPermisos,
  primeraRutaPermitida,
  tienePermiso,
  type ClaveModulo,
  type Nivel,
  type Permisos,
  type Rol,
} from "@/lib/auth/permisos";

export type { Rol };

export type PerfilActual = {
  userId: string;
  email: string | null;
  rol: Rol;
  permisos: Permisos;
};

export const SIN_PERMISO = "No tienes permiso para esta acción.";

// Rol y permisos del usuario logueado. Lee su propia fila de perfiles (RLS
// "perfil select own" lo permite). cache(): layout, página y actions del mismo
// request comparten una sola consulta.
export const getPerfilActual = cache(async (): Promise<PerfilActual | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, permisos")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    // Cualquier cosa que no sea 'admin' se trata como vendedor (falla cerrado).
    rol: perfil?.rol === "admin" ? "admin" : "vendedor",
    permisos: normalizarPermisos(perfil?.permisos),
  };
});

export async function esAdmin(): Promise<boolean> {
  const perfil = await getPerfilActual();
  return perfil?.rol === "admin";
}

// Para páginas server: exige sesión admin o redirige. Devuelve el perfil.
export async function requireAdmin(): Promise<PerfilActual> {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  if (perfil.rol !== "admin") redirect(primeraRutaPermitida(perfil));
  return perfil;
}

// Para páginas server: exige el permiso o redirige. Si pide escritura y solo
// tiene lectura, vuelve al listado del módulo; si no, a su primer módulo.
export async function requirePermiso(
  clave: ClaveModulo,
  nivel: Nivel = "lectura"
): Promise<PerfilActual> {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  if (tienePermiso(perfil, clave, nivel)) return perfil;
  if (nivel === "escritura" && tienePermiso(perfil, clave, "lectura")) {
    redirect(MODULOS.find((m) => m.clave === clave)!.ruta);
  }
  redirect(primeraRutaPermitida(perfil));
}

// Para server actions: devuelve el perfil si tiene el permiso, o null. La
// action responde { error: SIN_PERMISO }.
export async function checkPermiso(
  clave: ClaveModulo,
  nivel: Nivel = "lectura"
): Promise<PerfilActual | null> {
  const perfil = await getPerfilActual();
  return tienePermiso(perfil, clave, nivel) ? perfil : null;
}
