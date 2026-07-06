"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarRut } from "@/lib/rut";
import { TIPOS_PROVEEDOR, type TipoProveedor } from "./tipos";

// Deja el RUT en el mismo formato que guarda el sync del SII: cuerpo + guion +
// dígito verificador, sin puntos ("76.109.779-2" -> "76109779-2"). Así la clave
// natural (rut) calza si más adelante llega una compra de ese proveedor.
function rutConGuion(valor: string): string {
  const limpio = normalizarRut(valor);
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

export type SetTipoResult = { error?: string; success?: boolean };

// Asigna (o limpia con null) el tipo de un proveedor. Valida contra el catálogo
// para que coincida con el check de la tabla.
export async function setTipoProveedor(
  id: string,
  tipo: TipoProveedor | null
): Promise<SetTipoResult> {
  if (tipo !== null && !TIPOS_PROVEEDOR.includes(tipo)) {
    return { error: "Tipo de proveedor inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .update({ tipo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error al asignar tipo de proveedor:", error.message);
    return { error: "No se pudo guardar el tipo. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "El proveedor ya no existe" };
  }

  revalidatePath("/proveedores");
  return { success: true };
}

export type ProveedorCreado = {
  id: string;
  rut: string;
  razon_social: string | null;
  correo: string | null;
};

export type CrearProveedorInput = {
  rut: string;
  razon_social: string;
  correo?: string;
  tipo?: TipoProveedor | null;
};

export type CrearProveedorResult =
  | { error: string }
  | { proveedor: ProveedorCreado };

// Crea un proveedor a mano (los del SII se siembran solos). Sirve para poder
// asignarlo en una orden de compra antes de que exista una factura suya.
export async function crearProveedor(
  input: CrearProveedorInput
): Promise<CrearProveedorResult> {
  const rut = rutConGuion(input.rut);
  if (rut.replace(/[^0-9kK]/gi, "").length < 2) {
    return { error: "Ingresa un RUT válido" };
  }

  const razon_social = input.razon_social.trim();
  if (razon_social === "") {
    return { error: "Ingresa la razón social" };
  }

  const correo = (input.correo ?? "").trim();
  if (correo !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    return { error: "Correo inválido" };
  }

  const tipo = input.tipo ?? null;
  if (tipo !== null && !TIPOS_PROVEEDOR.includes(tipo)) {
    return { error: "Tipo de proveedor inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .insert({
      rut,
      razon_social,
      correo: correo || null,
      tipo,
    })
    .select("id, rut, razon_social, correo")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un proveedor con ese RUT" };
    }
    console.error("Error al crear proveedor:", error.message);
    return { error: "No se pudo crear el proveedor. Intenta nuevamente." };
  }

  revalidatePath("/proveedores");
  revalidatePath("/ordenes-compra/nueva");
  return { proveedor: data as ProveedorCreado };
}

export type SetCorreoResult = { error?: string; success?: boolean };

// Asigna (o limpia con cadena vacía → null) el correo del proveedor, usado para
// enviarle órdenes de compra. Valida un formato de correo básico.
export async function setCorreoProveedor(
  id: string,
  correo: string
): Promise<SetCorreoResult> {
  const limpio = correo.trim();
  if (limpio !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio)) {
    return { error: "Correo inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .update({ correo: limpio || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error al asignar correo de proveedor:", error.message);
    return { error: "No se pudo guardar el correo. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "El proveedor ya no existe" };
  }

  revalidatePath("/proveedores");
  return { success: true };
}
