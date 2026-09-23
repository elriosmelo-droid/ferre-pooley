import { z } from "zod";

// Catálogo único de módulos que se pueden habilitar a un vendedor. Lo usan el
// sidebar, la grilla de permisos del panel de usuarios y los guards. Compras,
// Órdenes de Compra, Proveedores y Usuarios NO están: son siempre solo admin.
// El orden importa: define la "primera ruta permitida" al redirigir.
export const MODULOS = [
  { clave: "dashboard", label: "Dashboard", ruta: "/dashboard", escritura: false },
  { clave: "cotizaciones", label: "Cotizaciones", ruta: "/cotizaciones", escritura: true },
  { clave: "notas_venta", label: "Notas de Venta", ruta: "/notas-venta", escritura: true },
  { clave: "ventas", label: "Ventas (facturas)", ruta: "/ventas", escritura: false },
  { clave: "conciliacion", label: "Conciliación", ruta: "/conciliacion", escritura: false },
  { clave: "clientes", label: "Clientes", ruta: "/clientes", escritura: true },
  { clave: "estados_cuenta", label: "Estados de Cuenta", ruta: "/estados-cuenta", escritura: false },
  { clave: "productos", label: "Productos", ruta: "/productos", escritura: true },
  { clave: "finanzas", label: "Finanzas", ruta: "/finanzas", escritura: false },
  { clave: "correos", label: "Correos", ruta: "/correos", escritura: true },
] as const;

export type ClaveModulo = (typeof MODULOS)[number]["clave"];
export type Nivel = "lectura" | "escritura";
export type Rol = "admin" | "vendedor";
export type Permisos = Partial<Record<ClaveModulo, Nivel>> & {
  ver_costos?: boolean;
};
export type SujetoPermisos = { rol: Rol; permisos: Permisos };

const nivel = z.enum(["lectura", "escritura"]);
const soloLectura = z.literal("lectura");

// Forma válida del jsonb perfiles.permisos. strict: una clave fuera del
// catálogo (p. ej. "compras") invalida todo.
export const permisosSchema = z
  .strictObject({
    dashboard: soloLectura.optional(),
    cotizaciones: nivel.optional(),
    notas_venta: nivel.optional(),
    ventas: soloLectura.optional(),
    conciliacion: soloLectura.optional(),
    clientes: nivel.optional(),
    estados_cuenta: soloLectura.optional(),
    productos: nivel.optional(),
    finanzas: soloLectura.optional(),
    correos: nivel.optional(),
    ver_costos: z.boolean().optional(),
  })
  // Finanzas es utilidad de punta a punta: sin ver costos no tiene sentido.
  .refine((p) => !p.finanzas || p.ver_costos === true, {
    message: "Finanzas requiere «Ver costos, márgenes y flete»",
    path: ["finanzas"],
  });

export const PERMISOS_DEFAULT_VENDEDOR: Permisos = {
  cotizaciones: "escritura",
  notas_venta: "escritura",
  clientes: "lectura",
  productos: "lectura",
  ver_costos: false,
};

// Lo que viene de la BD se valida: si está corrupto, el vendedor queda sin
// acceso (falla cerrado) en vez de con permisos inventados.
export function normalizarPermisos(raw: unknown): Permisos {
  const parsed = permisosSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function tienePermiso(
  s: SujetoPermisos | null,
  clave: ClaveModulo,
  nivelPedido: Nivel
): boolean {
  if (!s) return false;
  if (s.rol === "admin") return true;
  const actual = s.permisos[clave];
  if (!actual) return false;
  return nivelPedido === "lectura" || actual === "escritura";
}

export function puedeVerCostos(s: SujetoPermisos | null): boolean {
  if (!s) return false;
  return s.rol === "admin" || s.permisos.ver_costos === true;
}

export function primeraRutaPermitida(s: SujetoPermisos | null): string {
  const m = MODULOS.find((m) => tienePermiso(s, m.clave, "lectura"));
  return m?.ruta ?? "/sin-acceso";
}

export function contarModulos(p: Permisos): number {
  return MODULOS.filter((m) => p[m.clave]).length;
}

// Reglas al cambiar el rol de un usuario desde el panel. Devuelve el mensaje
// de error o null si el cambio es válido.
export function validarCambioRol(i: {
  esMismoUsuario: boolean;
  rolActual: Rol;
  rolNuevo: Rol;
  totalAdmins: number;
}): string | null {
  const degrada = i.rolActual === "admin" && i.rolNuevo !== "admin";
  if (!degrada) return null;
  if (i.esMismoUsuario) return "No puedes quitarte el rol de administrador a ti mismo.";
  if (i.totalAdmins <= 1) return "No puedes degradar al último administrador.";
  return null;
}
