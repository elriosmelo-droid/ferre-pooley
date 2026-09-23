"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfilActual } from "@/lib/auth/rol";
import {
  permisosSchema,
  validarCambioRol,
  type Permisos,
} from "@/lib/auth/permisos";

export type UsuarioFormState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<
    Record<"email" | "password" | "nombre" | "rol" | "permisos", string[]>
  >;
};

const crearSchema = z.object({
  email: z.email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  nombre: z.string().trim().min(1, "Ingresa el nombre"),
  rol: z.enum(["admin", "vendedor"]),
});

// Permisos del form (JSON en un campo oculto). Con rol admin se guardan vacíos:
// el admin no los usa y así no quedan permisos "fantasma" si luego se degrada.
function leerPermisos(
  formData: FormData,
  rol: "admin" | "vendedor"
): { ok: true; permisos: Permisos } | { ok: false; error: string } {
  if (rol === "admin") return { ok: true, permisos: {} };
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("permisos") ?? "{}"));
  } catch {
    return { ok: false, error: "Permisos inválidos." };
  }
  const parsed = permisosSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Permisos inválidos." };
  }
  return { ok: true, permisos: parsed.data };
}

export async function crearUsuario(
  _prevState: UsuarioFormState,
  formData: FormData
): Promise<UsuarioFormState> {
  const perfil = await getPerfilActual();
  if (perfil?.rol !== "admin") {
    return { error: "No tienes permiso para crear usuarios." };
  }

  const parsed = crearSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    nombre: String(formData.get("nombre") ?? ""),
    rol: String(formData.get("rol") ?? "admin"),
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const perms = leerPermisos(formData, parsed.data.rol);
  if (!perms.ok) return { fieldErrors: { permisos: [perms.error] } };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    // No se registra la contraseña. Mensaje de duplicado según el código.
    const yaExiste =
      error?.code === "email_exists" ||
      /already/i.test(error?.message ?? "");
    console.error("Error al crear usuario:", error?.message);
    return {
      error: yaExiste
        ? "Ya existe un usuario con ese correo."
        : "No se pudo crear el usuario. Intenta nuevamente.",
    };
  }

  const { error: perfilError } = await admin.from("perfiles").insert({
    user_id: data.user.id,
    nombre: parsed.data.nombre,
    rol: parsed.data.rol,
    permisos: perms.permisos,
  });

  if (perfilError) {
    // Si el perfil no se pudo crear, deshace el usuario para no dejar huérfano.
    await admin.auth.admin.deleteUser(data.user.id);
    console.error("Error al crear perfil del usuario:", perfilError.message);
    return { error: "No se pudo crear el usuario. Intenta nuevamente." };
  }

  revalidatePath("/usuarios");
  return { success: true };
}

const actualizarSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresa el nombre"),
  rol: z.enum(["admin", "vendedor"]),
});

export async function actualizarUsuario(
  id: string,
  _prevState: UsuarioFormState,
  formData: FormData
): Promise<UsuarioFormState> {
  const perfil = await getPerfilActual();
  if (perfil?.rol !== "admin") {
    return { error: "No tienes permiso para editar usuarios." };
  }

  const parsed = actualizarSchema.safeParse({
    nombre: String(formData.get("nombre") ?? ""),
    rol: String(formData.get("rol") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const perms = leerPermisos(formData, parsed.data.rol);
  if (!perms.ok) return { fieldErrors: { permisos: [perms.error] } };

  const admin = createAdminClient();
  const [{ data: actual }, { count: totalAdmins }] = await Promise.all([
    admin.from("perfiles").select("rol").eq("user_id", id).maybeSingle(),
    admin.from("perfiles").select("user_id", { count: "exact", head: true }).eq("rol", "admin"),
  ]);
  if (!actual) return { error: "El usuario no existe." };

  const errorRol = validarCambioRol({
    esMismoUsuario: id === perfil.userId,
    rolActual: actual.rol === "admin" ? "admin" : "vendedor",
    rolNuevo: parsed.data.rol,
    totalAdmins: totalAdmins ?? 0,
  });
  if (errorRol) return { error: errorRol };

  const { error } = await admin
    .from("perfiles")
    .update({
      nombre: parsed.data.nombre,
      rol: parsed.data.rol,
      permisos: perms.permisos,
    })
    .eq("user_id", id);
  if (error) {
    console.error("Error al actualizar usuario:", error.message);
    return { error: "No se pudo guardar. Intenta nuevamente." };
  }

  revalidatePath("/usuarios");
  return { success: true };
}

export type EliminarUsuarioResult = { error?: string; success?: boolean };

export async function eliminarUsuario(
  id: string
): Promise<EliminarUsuarioResult> {
  const perfil = await getPerfilActual();
  if (perfil?.rol !== "admin") {
    return { error: "No tienes permiso para eliminar usuarios." };
  }
  if (id === perfil.userId) {
    return { error: "No puedes eliminar tu propia cuenta." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("Error al eliminar usuario:", error.message);
    return { error: "No se pudo eliminar el usuario. Intenta nuevamente." };
  }

  revalidatePath("/usuarios");
  return { success: true };
}
