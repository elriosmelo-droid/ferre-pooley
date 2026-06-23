// Catálogo de tipos de proveedor (debe coincidir con el check de la tabla
// `proveedores`). Vive fuera de actions.ts porque un archivo "use server" solo
// puede exportar funciones async.
export const TIPOS_PROVEEDOR = [
  "combustibles",
  "transporte",
  "materiales",
] as const;

export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];

export const ETIQUETAS_TIPO: Record<TipoProveedor, string> = {
  combustibles: "Combustibles",
  transporte: "Transporte",
  materiales: "Materiales",
};
