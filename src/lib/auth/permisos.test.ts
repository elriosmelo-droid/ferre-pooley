import { describe, expect, it } from "vitest";
import {
  MODULOS,
  PERMISOS_DEFAULT_VENDEDOR,
  contarModulos,
  normalizarPermisos,
  permisosSchema,
  primeraRutaPermitida,
  puedeVerCostos,
  tienePermiso,
  validarCambioRol,
  type SujetoPermisos,
} from "./permisos";

const admin: SujetoPermisos = { rol: "admin", permisos: {} };
const vend = (permisos: SujetoPermisos["permisos"]): SujetoPermisos => ({
  rol: "vendedor",
  permisos,
});

describe("tienePermiso", () => {
  it("admin tiene todo", () => {
    expect(tienePermiso(admin, "finanzas", "lectura")).toBe(true);
    expect(tienePermiso(admin, "cotizaciones", "escritura")).toBe(true);
  });
  it("sin sujeto no tiene nada", () => {
    expect(tienePermiso(null, "dashboard", "lectura")).toBe(false);
  });
  it("escritura implica lectura", () => {
    const v = vend({ cotizaciones: "escritura" });
    expect(tienePermiso(v, "cotizaciones", "lectura")).toBe(true);
    expect(tienePermiso(v, "cotizaciones", "escritura")).toBe(true);
  });
  it("lectura no da escritura", () => {
    const v = vend({ clientes: "lectura" });
    expect(tienePermiso(v, "clientes", "lectura")).toBe(true);
    expect(tienePermiso(v, "clientes", "escritura")).toBe(false);
  });
  it("módulo ausente = sin acceso", () => {
    expect(tienePermiso(vend({}), "ventas", "lectura")).toBe(false);
  });
});

describe("puedeVerCostos", () => {
  it("admin sí, vendedor según el check", () => {
    expect(puedeVerCostos(admin)).toBe(true);
    expect(puedeVerCostos(vend({}))).toBe(false);
    expect(puedeVerCostos(vend({ ver_costos: true }))).toBe(true);
    expect(puedeVerCostos(null)).toBe(false);
  });
});

describe("primeraRutaPermitida", () => {
  it("primer módulo con lectura en el orden del catálogo", () => {
    expect(primeraRutaPermitida(vend({ clientes: "lectura", cotizaciones: "escritura" }))).toBe(
      "/cotizaciones"
    );
  });
  it("sin módulos → /sin-acceso", () => {
    expect(primeraRutaPermitida(vend({ ver_costos: true }))).toBe("/sin-acceso");
  });
  it("admin → /dashboard", () => {
    expect(primeraRutaPermitida(admin)).toBe("/dashboard");
  });
});

describe("permisosSchema", () => {
  it("acepta el default del vendedor", () => {
    expect(permisosSchema.safeParse(PERMISOS_DEFAULT_VENDEDOR).success).toBe(true);
  });
  it("rechaza claves desconocidas", () => {
    expect(permisosSchema.safeParse({ compras: "lectura" }).success).toBe(false);
  });
  it("rechaza escritura en módulo de solo lectura", () => {
    expect(permisosSchema.safeParse({ ventas: "escritura" }).success).toBe(false);
  });
  it("finanzas exige ver_costos", () => {
    expect(permisosSchema.safeParse({ finanzas: "lectura" }).success).toBe(false);
    expect(
      permisosSchema.safeParse({ finanzas: "lectura", ver_costos: true }).success
    ).toBe(true);
  });
  it("sus claves coinciden con el catálogo", () => {
    const claves = Object.keys(permisosSchema.shape).filter((k) => k !== "ver_costos");
    expect(claves.sort()).toEqual(MODULOS.map((m) => m.clave).sort());
  });
});

describe("normalizarPermisos", () => {
  it("basura → {}", () => {
    expect(normalizarPermisos(null)).toEqual({});
    expect(normalizarPermisos({ compras: "escritura" })).toEqual({});
  });
  it("válido pasa tal cual", () => {
    expect(normalizarPermisos({ clientes: "lectura" })).toEqual({ clientes: "lectura" });
  });
});

describe("contarModulos", () => {
  it("cuenta módulos, no ver_costos", () => {
    expect(contarModulos({ clientes: "lectura", ver_costos: true })).toBe(1);
  });
});

describe("validarCambioRol", () => {
  it("no puedes quitarte el admin a ti mismo", () => {
    expect(
      validarCambioRol({ esMismoUsuario: true, rolActual: "admin", rolNuevo: "vendedor", totalAdmins: 3 })
    ).toMatch(/ti mismo/);
  });
  it("no se puede dejar el sistema sin admins", () => {
    expect(
      validarCambioRol({ esMismoUsuario: false, rolActual: "admin", rolNuevo: "vendedor", totalAdmins: 1 })
    ).toMatch(/último administrador/);
  });
  it("degradar a otro admin con más admins está ok", () => {
    expect(
      validarCambioRol({ esMismoUsuario: false, rolActual: "admin", rolNuevo: "vendedor", totalAdmins: 2 })
    ).toBeNull();
  });
  it("vendedor → admin siempre ok", () => {
    expect(
      validarCambioRol({ esMismoUsuario: false, rolActual: "vendedor", rolNuevo: "admin", totalAdmins: 1 })
    ).toBeNull();
  });
});
