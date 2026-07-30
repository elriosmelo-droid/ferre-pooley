// Estados en los que una orden de compra todavía se puede editar. `enviada`
// exige motivo y deja rastro en orden_compra_ediciones: el proveedor ya tiene
// el PDF anterior. Recibida y cerrada quedan congeladas.
//
// Vive fuera de actions.ts porque un archivo "use server" solo puede exportar
// funciones async.
export const ESTADOS_EDITABLES = ["borrador", "enviada"] as const;

export type EstadoEditable = (typeof ESTADOS_EDITABLES)[number];

export function esEstadoEditable(estado: string): estado is EstadoEditable {
  return (ESTADOS_EDITABLES as readonly string[]).includes(estado);
}
