"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ClienteFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"nombre" | "rut" | "correo" | "telefono" | "direccion", string[]>
  >;
};

const clienteSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  rut: z.string().trim().optional(),
  correo: z.string().trim().pipe(z.email("Ingresa un correo válido")),
  telefono: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
});

function parseClienteForm(formData: FormData) {
  return clienteSchema.safeParse({
    nombre: String(formData.get("nombre") ?? ""),
    rut: String(formData.get("rut") ?? ""),
    correo: String(formData.get("correo") ?? ""),
    telefono: String(formData.get("telefono") ?? ""),
    direccion: String(formData.get("direccion") ?? ""),
  });
}

function toClienteRow(data: z.infer<typeof clienteSchema>) {
  return {
    nombre: data.nombre,
    rut: data.rut || null,
    correo: data.correo,
    telefono: data.telefono || null,
    direccion: data.direccion || null,
  };
}

export async function crearCliente(
  _prevState: ClienteFormState,
  formData: FormData
): Promise<ClienteFormState> {
  const parsed = parseClienteForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert(toClienteRow(parsed.data));

  if (error) {
    console.error("Error al crear cliente:", error.message);
    return { error: "No se pudo guardar el cliente. Intenta nuevamente." };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function actualizarCliente(
  id: string,
  _prevState: ClienteFormState,
  formData: FormData
): Promise<ClienteFormState> {
  const parsed = parseClienteForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update(toClienteRow(parsed.data))
    .eq("id", id);

  if (error) {
    console.error("Error al actualizar cliente:", error.message);
    return { error: "No se pudo actualizar el cliente. Intenta nuevamente." };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function eliminarCliente(
  id: string
): Promise<{ error?: string } | void> {
  const supabase = await createClient();
  const { error } = await supabase.from("clientes").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "No se puede eliminar: el cliente tiene documentos asociados",
      };
    }
    console.error("Error al eliminar cliente:", error.message);
    return { error: "No se pudo eliminar el cliente. Intenta nuevamente." };
  }

  revalidatePath("/clientes");
}
