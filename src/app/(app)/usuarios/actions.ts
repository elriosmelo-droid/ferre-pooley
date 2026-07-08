"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfilActual } from "@/lib/auth/rol";

export type CrearUsuarioState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<
    Record<"email" | "password" | "nombre" | "rol", string[]>
  >;
};

const crearSchema = z.object({
  email: z.email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  nombre: z.string().trim().min(1, "Ingresa el nombre"),
  rol: z.enum(["admin", "usuario"]),
});

export async function crearUsuario(
  _prevState: CrearUsuarioState,
  formData: FormData
): Promise<CrearUsuarioState> {
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
