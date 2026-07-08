"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PerfilFormState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<
    Record<
      | "nombre"
      | "razon_social"
      | "rut_empresa"
      | "direccion_empresa"
      | "telefono_empresa"
      | "correo_aviso",
      string[]
    >
  >;
};

const perfilSchema = z.object({
  nombre: z.string().trim(),
  razon_social: z.string().trim(),
  rut_empresa: z.string().trim(),
  direccion_empresa: z.string().trim(),
  telefono_empresa: z.string().trim(),
  correo_aviso: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Ingresa un correo válido"
    ),
});

export async function guardarPerfil(
  _prevState: PerfilFormState,
  formData: FormData
): Promise<PerfilFormState> {
  const parsed = perfilSchema.safeParse({
    nombre: String(formData.get("nombre") ?? ""),
    razon_social: String(formData.get("razon_social") ?? ""),
    rut_empresa: String(formData.get("rut_empresa") ?? ""),
    direccion_empresa: String(formData.get("direccion_empresa") ?? ""),
    telefono_empresa: String(formData.get("telefono_empresa") ?? ""),
    correo_aviso: String(formData.get("correo_aviso") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "No se pudo verificar tu sesión. Vuelve a iniciar sesión.",
    };
  }

  // Update (no upsert): la fila de perfil ya existe para todo usuario
  // provisionado (backfill 011 + panel de usuarios). La RLS ya no permite que
  // un usuario inserte su propia fila, así que no se intenta crearla aquí.
  // No se toca `rol`: lo gestiona el panel de administración.
  const { error } = await supabase
    .from("perfiles")
    .update({
      nombre: parsed.data.nombre || null,
      razon_social: parsed.data.razon_social || null,
      rut_empresa: parsed.data.rut_empresa || null,
      direccion_empresa: parsed.data.direccion_empresa || null,
      telefono_empresa: parsed.data.telefono_empresa || null,
      correo_aviso: parsed.data.correo_aviso || null,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("Error al guardar perfil:", error.message);
    return { error: "No se pudo guardar el perfil. Intenta nuevamente." };
  }

  revalidatePath("/perfil");
  return { success: true };
}
