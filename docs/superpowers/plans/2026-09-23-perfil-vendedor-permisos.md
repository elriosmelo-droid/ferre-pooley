# Perfil vendedor con permisos por menú — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rol `vendedor` con permisos por menú (sin acceso / lectura / escritura) y check `ver_costos`, donde el vendedor solo ve sus propios documentos, aplicado en RLS + app.

**Architecture:** `perfiles.permisos jsonb` + funciones SQL `es_admin()`, `puede()`, `nota_es_propia()` que alimentan policies RLS nuevas; `vendedor_id` en cotizaciones y notas. En la app, un catálogo único `MODULOS` (`src/lib/auth/permisos.ts`) alimenta sidebar, grilla de permisos y guards (`requirePermiso` / `checkPermiso`). Los costos se ocultan en el server; al guardar, una función pura restaura costo/flete ocultos.

**Tech Stack:** Next.js (App Router, versión con breaking changes — ver `node_modules/next/dist/docs/` antes de usar APIs nuevas), Supabase (Postgres + RLS, `@supabase/ssr`), zod 4, vitest 4, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-23-perfil-vendedor-permisos-design.md`

## Global Constraints

- Roles válidos: `admin | vendedor`. El admin ignora `permisos` (tiene todo).
- Claves de módulo (exactas): `dashboard, cotizaciones, notas_venta, ventas, conciliacion, clientes, estados_cuenta, productos, finanzas, correos`, más `ver_costos: boolean`.
- Módulos sin escritura: `dashboard, ventas, conciliacion, estados_cuenta, finanzas`.
- Compras, Órdenes de Compra, Proveedores y Usuarios: siempre solo admin; no están en el catálogo.
- `finanzas` para un vendedor exige `ver_costos: true` (toda la página es utilidad). Ajuste sobre el spec, ver nota al final.
- Default al elegir Vendedor: `{ cotizaciones: "escritura", notas_venta: "escritura", clientes: "lectura", productos: "lectura", ver_costos: false }`.
- Mensaje de acción denegada: `"No tienes permiso para esta acción."`.
- Commits: autor Elvis Rios, **sin** trailer `Co-Authored-By`.
- Tests vitest: imports relativos (no hay alias `@` en vitest). Los módulos testeados no deben importar `@/...` ni `server-only`.
- Migración: `supabase/migrations/024_perfil_vendedor_permisos.sql`; la aplica el usuario en el SQL Editor de Supabase.

## Review Focus

1. Vendedor abre por URL una cotización/nota **ajena** → 404 (RLS devuelve null → `notFound()`), nunca los datos. Verificado en Task 11 paso 4.
2. Vendedor sin `ver_costos` edita su cotización/nota → costo y flete existentes se **conservan** (no quedan en 0). Test en Task 2.
3. Admin intenta quitarse el rol admin o dejar el sistema sin admins → rechazado. Test de `validarCambioRol` en Task 1.
4. Vendedor con solo lectura invoca una server action de escritura directo (sin UI) → `{ error }` / redirect, y la RLS rechaza igual. Verificado en Task 11 paso 4 (script con su JWT).
5. Vendedor sin permiso de `dashboard` entra (login redirige a `/dashboard`) → aterriza en su primer módulo permitido, sin loop de redirects; sin ningún módulo → `/sin-acceso`. Test de `primeraRutaPermitida` en Task 1.

---

### Task 1: Catálogo y lógica pura de permisos

**Files:**
- Create: `src/lib/auth/permisos.ts`
- Test: `src/lib/auth/permisos.test.ts`

**Interfaces:**
- Produces:
  - `MODULOS: readonly { clave: ClaveModulo; label: string; ruta: string; escritura: boolean }[]`
  - `type ClaveModulo`, `type Nivel = "lectura" | "escritura"`, `type Permisos`, `type Rol = "admin" | "vendedor"`, `type SujetoPermisos = { rol: Rol; permisos: Permisos }`
  - `tienePermiso(s: SujetoPermisos | null, clave: ClaveModulo, nivel: Nivel): boolean`
  - `puedeVerCostos(s: SujetoPermisos | null): boolean`
  - `primeraRutaPermitida(s: SujetoPermisos | null): string`
  - `contarModulos(p: Permisos): number`
  - `PERMISOS_DEFAULT_VENDEDOR: Permisos`
  - `permisosSchema` (zod) y `normalizarPermisos(raw: unknown): Permisos`
  - `validarCambioRol(i: { esMismoUsuario: boolean; rolActual: Rol; rolNuevo: Rol; totalAdmins: number }): string | null`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/permisos.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/permisos.test.ts`
Expected: FAIL — `Failed to resolve import "./permisos"`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/auth/permisos.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/permisos.test.ts`
Expected: PASS (todos los tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/permisos.ts src/lib/auth/permisos.test.ts
git commit -m "Permisos: catálogo de módulos y lógica pura de acceso"
```

---

### Task 2: Restaurar costos ocultos (función pura)

**Files:**
- Create: `src/lib/costos-ocultos.ts`
- Test: `src/lib/costos-ocultos.test.ts`

**Interfaces:**
- Produces:
  - `type ItemConCostos = { producto_id: string | null; sku: string; descripcion: string; costo: number; flete: number }`
  - `type ItemPrevio = { producto_id?: string | null; sku: string; descripcion: string; costo: number; flete: number }`
  - `restaurarCostosOcultos<T extends ItemConCostos>(items: T[], previos: ItemPrevio[], costoProducto: Map<string, number>): T[]`
  - `costosDeProductos(supabase: SupabaseClient, items: { producto_id: string | null }[]): Promise<Map<string, number>>`

Regla: el cliente de un vendedor sin `ver_costos` manda `costo`/`flete` en 0 (no los ve). El server ignora lo recibido y, por cada ítem: si calza con un ítem previo del mismo documento (por `producto_id`, o por `sku|descripcion`), toma su costo y flete; si no, costo = costo actual del producto (o 0 si es ítem libre) y flete = 0. Cada previo se consume una sola vez (líneas repetidas calzan en orden).

- [ ] **Step 1: Write the failing test**

`src/lib/costos-ocultos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { restaurarCostosOcultos } from "./costos-ocultos";

const item = (o: Partial<{ producto_id: string | null; sku: string; descripcion: string; costo: number; flete: number; precio: number }>) => ({
  producto_id: null,
  sku: "",
  descripcion: "x",
  costo: 0,
  flete: 0,
  precio: 100,
  ...o,
});

describe("restaurarCostosOcultos", () => {
  it("toma costo y flete del ítem previo con el mismo producto", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p1", sku: "A", precio: 500 })],
      [{ producto_id: "p1", sku: "A", descripcion: "x", costo: 300, flete: 20 }],
      new Map([["p1", 999]])
    );
    expect(r[0]).toMatchObject({ costo: 300, flete: 20, precio: 500 });
  });

  it("calza por sku+descripción cuando el previo no guarda producto_id (notas)", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p1", sku: "A", descripcion: "Tornillo" })],
      [{ sku: "A", descripcion: "Tornillo", costo: 50, flete: 5 }],
      new Map([["p1", 999]])
    );
    expect(r[0]).toMatchObject({ costo: 50, flete: 5 });
  });

  it("ítem nuevo de catálogo usa el costo del producto y flete 0", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p2", sku: "B" })],
      [],
      new Map([["p2", 700]])
    );
    expect(r[0]).toMatchObject({ costo: 700, flete: 0 });
  });

  it("ítem libre nuevo queda con costo 0 y flete 0", () => {
    const r = restaurarCostosOcultos([item({ descripcion: "Servicio" })], [], new Map());
    expect(r[0]).toMatchObject({ costo: 0, flete: 0 });
  });

  it("ignora costo y flete enviados por el cliente", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p2", costo: 1, flete: 9999 })],
      [],
      new Map([["p2", 700]])
    );
    expect(r[0]).toMatchObject({ costo: 700, flete: 0 });
  });

  it("líneas repetidas consumen los previos en orden", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p1" }), item({ producto_id: "p1" })],
      [
        { producto_id: "p1", sku: "", descripcion: "x", costo: 10, flete: 1 },
        { producto_id: "p1", sku: "", descripcion: "x", costo: 20, flete: 2 },
      ],
      new Map([["p1", 999]])
    );
    expect(r.map((i) => i.costo)).toEqual([10, 20]);
    expect(r.map((i) => i.flete)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/costos-ocultos.test.ts`
Expected: FAIL — `Failed to resolve import "./costos-ocultos"`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/costos-ocultos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

// Un vendedor sin «ver costos» no recibe costo ni flete en el formulario, así
// que manda 0. Al guardar, el server restaura los valores reales para no
// destruir el margen: se conserva lo que ya tenía cada línea del documento y,
// para líneas nuevas, se usa el costo del catálogo.

export type ItemConCostos = {
  producto_id: string | null;
  sku: string;
  descripcion: string;
  costo: number;
  flete: number;
};

export type ItemPrevio = {
  producto_id?: string | null;
  sku: string;
  descripcion: string;
  costo: number;
  flete: number;
};

// Claves con las que una línea puede calzar con otra: primero por producto,
// luego por sku+descripción (nota_venta_items no guarda producto_id).
function claves(i: { producto_id?: string | null; sku: string; descripcion: string }) {
  const k = [`d:${i.sku.trim()}|${i.descripcion.trim()}`];
  if (i.producto_id) k.unshift(`p:${i.producto_id}`);
  return k;
}

export function restaurarCostosOcultos<T extends ItemConCostos>(
  items: T[],
  previos: ItemPrevio[],
  costoProducto: Map<string, number>
): T[] {
  const usados = new Set<number>();
  return items.map((item) => {
    const k = claves(item);
    const idx = previos.findIndex(
      (p, i) => !usados.has(i) && claves(p).some((c) => k.includes(c))
    );
    if (idx >= 0) {
      usados.add(idx);
      return { ...item, costo: previos[idx].costo, flete: previos[idx].flete };
    }
    const costo = item.producto_id ? (costoProducto.get(item.producto_id) ?? 0) : 0;
    return { ...item, costo, flete: 0 };
  });
}

export async function costosDeProductos(
  supabase: SupabaseClient,
  items: { producto_id: string | null }[]
): Promise<Map<string, number>> {
  const ids = [...new Set(items.map((i) => i.producto_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("productos").select("id, costo").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, p.costo as number]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/costos-ocultos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/costos-ocultos.ts src/lib/costos-ocultos.test.ts
git commit -m "Costos ocultos: restaurar costo y flete al guardar sin ver costos"
```

---

### Task 3: Migración 024 (roles, permisos, dueño, RLS)

**Files:**
- Create: `supabase/migrations/024_perfil_vendedor_permisos.sql`

**Interfaces:**
- Produces (SQL): `perfiles.permisos jsonb`, `perfiles.rol in ('admin','vendedor')`, `cotizaciones.vendedor_id`, `notas_venta.vendedor_id` (default `auth.uid()`), funciones `public.es_admin()`, `public.puede(modulo text, nivel text)`, `public.nota_es_propia(nota uuid)`, policies nuevas por tabla.

- [ ] **Step 1: Write the migration**

`supabase/migrations/024_perfil_vendedor_permisos.sql`:

```sql
-- Perfil vendedor con permisos por menú.
--
-- - perfiles.rol pasa a 'admin' | 'vendedor' y suma permisos jsonb
--   ({"cotizaciones":"escritura", ..., "ver_costos": true}).
-- - cotizaciones y notas_venta guardan su dueño (vendedor_id).
-- - RLS: el admin ve todo; el vendedor solo los módulos habilitados y, dentro
--   de ellos, solo sus documentos. Compras/OC/proveedores: solo admin.

-- 1. perfiles ---------------------------------------------------------------

alter table perfiles
  add column if not exists permisos jsonb not null default '{}'::jsonb;

-- Anti-escalada extendido a permisos. Se permite al service role (panel de
-- usuarios) y a los roles de migración (postgres / supabase_admin).
create or replace function public.perfiles_no_escalar_rol()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.rol is distinct from old.rol or new.permisos is distinct from old.permisos)
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'No puedes cambiar tu rol ni tus permisos';
  end if;
  return new;
end;
$$;

alter table perfiles drop constraint if exists perfiles_rol_check;
update perfiles set rol = 'vendedor' where rol = 'usuario';
alter table perfiles
  add constraint perfiles_rol_check check (rol in ('admin', 'vendedor'));

-- 2. Funciones de acceso -----------------------------------------------------
-- security definer: leen perfiles/notas sin quedar atrapadas en su propia RLS.

create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from perfiles where user_id = auth.uid() and rol = 'admin'
  );
$$;

-- ¿Puede el usuario actual entrar al módulo con ese nivel? 'escritura'
-- implica 'lectura'. El admin siempre puede.
create or replace function public.puede(modulo text, nivel text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from perfiles p
    where p.user_id = auth.uid()
      and (
        p.rol = 'admin'
        or (
          p.rol = 'vendedor'
          and (
            p.permisos->>modulo = 'escritura'
            or (nivel = 'lectura' and p.permisos->>modulo = 'lectura')
          )
        )
      )
  );
$$;

-- ¿La nota es del usuario actual? Se usa desde ventas_sii: el vendedor puede
-- tener "Ventas" sin tener "Notas de Venta", así que no se puede depender de
-- la RLS de notas_venta en un subquery.
create or replace function public.nota_es_propia(nota uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from notas_venta where id = nota and vendedor_id = auth.uid()
  );
$$;

revoke all on function public.es_admin() from public;
revoke all on function public.puede(text, text) from public;
revoke all on function public.nota_es_propia(uuid) from public;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede(text, text) to authenticated;
grant execute on function public.nota_es_propia(uuid) to authenticated;

-- 3. Dueño de cotizaciones y notas ------------------------------------------

alter table cotizaciones
  add column if not exists vendedor_id uuid
  references auth.users(id) on delete set null default auth.uid();
alter table notas_venta
  add column if not exists vendedor_id uuid
  references auth.users(id) on delete set null default auth.uid();

create index if not exists cotizaciones_vendedor_id_idx on cotizaciones (vendedor_id);
create index if not exists notas_venta_vendedor_id_idx on notas_venta (vendedor_id);

-- Backfill por el nombre guardado (snapshot) o, si era un correo, por email.
-- Lo que no calce queda null: visible solo para admin.
update cotizaciones c set vendedor_id = p.user_id
from perfiles p
where c.vendedor_id is null and c.vendedor is not null
  and trim(p.nombre) = trim(c.vendedor);
update cotizaciones c set vendedor_id = u.id
from auth.users u
where c.vendedor_id is null and c.vendedor is not null
  and lower(u.email) = lower(trim(c.vendedor));
update notas_venta n set vendedor_id = p.user_id
from perfiles p
where n.vendedor_id is null and n.vendedor is not null
  and trim(p.nombre) = trim(n.vendedor);
update notas_venta n set vendedor_id = u.id
from auth.users u
where n.vendedor_id is null and n.vendedor is not null
  and lower(u.email) = lower(trim(n.vendedor));

-- 4. Policies ----------------------------------------------------------------
-- Se reemplazan las "members <tabla>" de 012/016/019/023.

do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'productos', 'cotizaciones', 'cotizacion_items',
    'notas_venta', 'nota_venta_items', 'pagos_nota_venta', 'compras_sii',
    'ventas_sii', 'proveedores', 'ordenes_compra', 'orden_compra_items',
    'orden_compra_ediciones', 'correos'
  ] loop
    execute format('drop policy if exists "members %1$s" on %1$s', t);
  end loop;
end $$;

```

Paso 4 del archivo (a continuación del bloque anterior):

```sql
-- Documentos con dueño: cabecera + hijos. Lectura y escritura separadas.
create policy "cotizaciones select" on cotizaciones for select to authenticated
  using (public.es_admin() or (public.puede('cotizaciones', 'lectura') and vendedor_id = auth.uid()));
create policy "cotizaciones write" on cotizaciones for all to authenticated
  using (public.es_admin() or (public.puede('cotizaciones', 'escritura') and vendedor_id = auth.uid()))
  with check (public.es_admin() or (public.puede('cotizaciones', 'escritura') and vendedor_id = auth.uid()));

create policy "cotizacion_items select" on cotizacion_items for select to authenticated
  using (exists (select 1 from cotizaciones c where c.id = cotizacion_id));
create policy "cotizacion_items write" on cotizacion_items for all to authenticated
  using (exists (
    select 1 from cotizaciones c where c.id = cotizacion_id
      and (public.es_admin() or (public.puede('cotizaciones', 'escritura') and c.vendedor_id = auth.uid()))))
  with check (exists (
    select 1 from cotizaciones c where c.id = cotizacion_id
      and (public.es_admin() or (public.puede('cotizaciones', 'escritura') and c.vendedor_id = auth.uid()))));

create policy "notas_venta select" on notas_venta for select to authenticated
  using (public.es_admin() or (public.puede('notas_venta', 'lectura') and vendedor_id = auth.uid()));
create policy "notas_venta write" on notas_venta for all to authenticated
  using (public.es_admin() or (public.puede('notas_venta', 'escritura') and vendedor_id = auth.uid()))
  with check (public.es_admin() or (public.puede('notas_venta', 'escritura') and vendedor_id = auth.uid()));

create policy "nota_venta_items select" on nota_venta_items for select to authenticated
  using (exists (select 1 from notas_venta n where n.id = nota_venta_id));
create policy "nota_venta_items write" on nota_venta_items for all to authenticated
  using (exists (
    select 1 from notas_venta n where n.id = nota_venta_id
      and (public.es_admin() or (public.puede('notas_venta', 'escritura') and n.vendedor_id = auth.uid()))))
  with check (exists (
    select 1 from notas_venta n where n.id = nota_venta_id
      and (public.es_admin() or (public.puede('notas_venta', 'escritura') and n.vendedor_id = auth.uid()))));

-- Cobros: lectura también desde finanzas/estados de cuenta (vía nota propia).
create policy "pagos_nota_venta select" on pagos_nota_venta for select to authenticated
  using (public.es_admin() or (
    (public.puede('notas_venta', 'lectura') or public.puede('finanzas', 'lectura'))
    and public.nota_es_propia(nota_venta_id)));
create policy "pagos_nota_venta write" on pagos_nota_venta for all to authenticated
  using (public.es_admin() or (public.puede('notas_venta', 'escritura') and public.nota_es_propia(nota_venta_id)))
  with check (public.es_admin() or (public.puede('notas_venta', 'escritura') and public.nota_es_propia(nota_venta_id)));

-- Facturas del SII: el vendedor solo lee las ligadas a sus notas. Escribir
-- (sync, vincular, vencimiento manual) es solo admin.
create policy "ventas_sii select" on ventas_sii for select to authenticated
  using (public.es_admin() or (
    (public.puede('ventas', 'lectura') or public.puede('conciliacion', 'lectura')
      or public.puede('estados_cuenta', 'lectura') or public.puede('dashboard', 'lectura')
      or public.puede('finanzas', 'lectura') or public.puede('notas_venta', 'lectura'))
    and public.nota_es_propia(nota_venta_id)));
create policy "ventas_sii admin" on ventas_sii for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Catálogos compartidos: se leen si se cotiza/vende; se escriben con permiso.
create policy "clientes select" on clientes for select to authenticated
  using (public.puede('clientes', 'lectura') or public.puede('cotizaciones', 'lectura')
    or public.puede('notas_venta', 'lectura') or public.puede('estados_cuenta', 'lectura'));
create policy "clientes write" on clientes for all to authenticated
  using (public.puede('clientes', 'escritura')) with check (public.puede('clientes', 'escritura'));

create policy "productos select" on productos for select to authenticated
  using (public.puede('productos', 'lectura') or public.puede('cotizaciones', 'lectura')
    or public.puede('notas_venta', 'lectura'));
create policy "productos write" on productos for all to authenticated
  using (public.puede('productos', 'escritura')) with check (public.puede('productos', 'escritura'));

create policy "correos select" on correos for select to authenticated
  using (public.puede('correos', 'lectura'));
create policy "correos write" on correos for all to authenticated
  using (public.puede('correos', 'escritura')) with check (public.puede('correos', 'escritura'));

-- Solo admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'compras_sii', 'proveedores', 'ordenes_compra', 'orden_compra_items',
    'orden_compra_ediciones'
  ] loop
    execute format(
      'create policy "admin %1$s" on %1$s for all to authenticated '
      'using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;
```


- [ ] **Step 2: Verify the policy names being dropped exist**

Run: `grep -n 'create policy' supabase/migrations/*.sql`
Expected: todas las policies previas de las 14 tablas se llaman `members <tabla>`. Si alguna tiene otro nombre, agrega su `drop policy if exists` en la sección 4.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/024_perfil_vendedor_permisos.sql
git commit -m "Migración 024: rol vendedor, permisos, dueño de documentos y RLS"
```

(La aplicación en Supabase se hace en Task 11, junto con el deploy: la app vieja sigue funcionando con la BD nueva porque todos los usuarios actuales son admin.)

---

### Task 4: Sesión, guards y página sin acceso

**Files:**
- Modify: `src/lib/auth/rol.ts` (reescritura)
- Create: `src/app/(app)/sin-acceso/page.tsx`

**Interfaces:**
- Consumes: Task 1 (`normalizarPermisos`, `tienePermiso`, `primeraRutaPermitida`, `MODULOS`, tipos).
- Produces:
  - `type PerfilActual = { userId: string; email: string | null; rol: Rol; permisos: Permisos }` (compatible con `SujetoPermisos`)
  - `getPerfilActual(): Promise<PerfilActual | null>` (cacheada por request)
  - `esAdmin(): Promise<boolean>`, `requireAdmin(): Promise<PerfilActual>` (igual que hoy)
  - `requirePermiso(clave: ClaveModulo, nivel?: Nivel): Promise<PerfilActual>` — redirige
  - `checkPermiso(clave: ClaveModulo, nivel?: Nivel): Promise<PerfilActual | null>` — para actions
  - `SIN_PERMISO = "No tienes permiso para esta acción."`
  - `export type { Rol }` re-exportado desde permisos

- [ ] **Step 1: Rewrite `src/lib/auth/rol.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/app/(app)/sin-acceso/page.tsx`**

```tsx
export default function SinAccesoPage() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-xl font-bold text-slate-900">Sin módulos habilitados</h1>
      <p className="mt-2 text-sm text-slate-500">
        Aún no tienes módulos habilitados. Contacta al administrador.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. Si `usuarios/actions.ts` o `usuarios/page.tsx` fallan por `"usuario"`, se corrigen en Task 6; si falla algo más, arréglalo aquí.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/rol.ts "src/app/(app)/sin-acceso/page.tsx"
git commit -m "Auth: permisos en la sesión, requirePermiso/checkPermiso y página sin acceso"
```

---

### Task 5: Sidebar y layout filtrados por permisos

**Files:**
- Modify: `src/components/sidebar.tsx` (estructura del menú ~líneas 163–234 y bloque Usuarios ~331)
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: Task 1 (`tienePermiso`, `ClaveModulo`, `SujetoPermisos`), Task 4 (`getPerfilActual`).
- Produces: `Sidebar({ perfil: SujetoPermisos; correosSinLeer?: number })`.

- [ ] **Step 1: Tag menu items and filter**

En `src/components/sidebar.tsx`:

1. Agrega el import: `import { tienePermiso, type ClaveModulo, type SujetoPermisos } from "@/lib/auth/permisos";`
2. Cambia el tipo `Item`:

```ts
// modulo: clave del catálogo de permisos. soloAdmin: fuera del catálogo
// (compras, OC, proveedores), visible solo para admin.
type Item = {
  href: string;
  label: string;
  icon: (p: IconProps) => ReactNode;
  modulo?: ClaveModulo;
  soloAdmin?: boolean;
};
```

3. En `menu`, agrega a cada ítem su `modulo` o `soloAdmin`:
   - `/dashboard` → `modulo: "dashboard"`
   - `/cotizaciones` → `"cotizaciones"`, `/ventas` → `"ventas"`, `/notas-venta` → `"notas_venta"`, `/conciliacion` → `"conciliacion"`
   - `/compras`, `/ordenes-compra`, `/proveedores` → `soloAdmin: true`
   - `/finanzas` → `"finanzas"`, `/productos` → `"productos"`
   - `/clientes` → `"clientes"`, `/estados-cuenta` → `"estados_cuenta"`
   - `/correos`, `/correos/enviados` → `"correos"`
4. Debajo de `const isGroup = ...` agrega:

```ts
function itemVisible(i: Item, perfil: SujetoPermisos) {
  if (i.soloAdmin) return perfil.rol === "admin";
  return i.modulo ? tienePermiso(perfil, i.modulo, "lectura") : true;
}

// Deja solo lo que el perfil puede ver; un grupo sin hijos visibles desaparece.
function filtrarMenu(perfil: SujetoPermisos): Entry[] {
  return menu.flatMap((e): Entry[] => {
    if (!isGroup(e)) return itemVisible(e, perfil) ? [e] : [];
    const items = e.items.filter((i) => itemVisible(i, perfil));
    return items.length ? [{ ...e, items }] : [];
  });
}
```

5. Cambia la firma:

```ts
export function Sidebar({
  perfil,
  correosSinLeer = 0,
}: {
  perfil: SujetoPermisos;
  correosSinLeer?: number;
}) {
  const esAdmin = perfil.rol === "admin";
  const menuVisible = filtrarMenu(perfil);
```

6. Reemplaza el `menu.map(` que renderiza el nav por `menuVisible.map(`. El bloque `{esAdmin && (<Link href="/usuarios" ...` queda igual (ahora `esAdmin` es la constante local).
7. El logo (`<Link href="/dashboard"` en dos lugares) se deja: `/dashboard` redirige al primer módulo permitido.

- [ ] **Step 2: Update layout**

En `src/app/(app)/layout.tsx`, reemplaza desde `const perfil = await getPerfilActual();` hasta el `<Sidebar ... />`:

```tsx
  const perfil = await getPerfilActual();
  const sujeto = perfil
    ? { rol: perfil.rol, permisos: perfil.permisos }
    : { rol: "vendedor" as const, permisos: {} };

  // El contador de no leídos solo se pide si puede ver correos.
  let correosSinLeer = 0;
  if (tienePermiso(sujeto, "correos", "lectura")) {
    const { count } = await supabase
      .from("correos")
      .select("id", { count: "exact", head: true })
      .eq("leido", false);
    correosSinLeer = count ?? 0;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar perfil={sujeto} correosSinLeer={correosSinLeer} />
```

y agrega `import { tienePermiso } from "@/lib/auth/permisos";`.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores en sidebar/layout.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx "src/app/(app)/layout.tsx"
git commit -m "Sidebar: muestra solo los menús permitidos al perfil"
```

---

### Task 6: Panel de usuarios con rol vendedor y grilla de permisos

**Files:**
- Create: `src/app/(app)/usuarios/permisos-grid.tsx`
- Create: `src/app/(app)/usuarios/usuario-form.tsx` (reemplaza a `crear-usuario-form.tsx`)
- Delete: `src/app/(app)/usuarios/crear-usuario-form.tsx`
- Create: `src/app/(app)/usuarios/[id]/editar/page.tsx`
- Modify: `src/app/(app)/usuarios/actions.ts`
- Modify: `src/app/(app)/usuarios/page.tsx`

**Interfaces:**
- Consumes: Task 1 (`MODULOS`, `Permisos`, `PERMISOS_DEFAULT_VENDEDOR`, `permisosSchema`, `normalizarPermisos`, `contarModulos`, `validarCambioRol`), Task 4 (`getPerfilActual`, `requireAdmin`).
- Produces: `crearUsuario(prev, formData)`, `actualizarUsuario(id: string, prev, formData)` con estado `UsuarioFormState = { error?; success?; fieldErrors?: Partial<Record<"email"|"password"|"nombre"|"rol"|"permisos", string[]>> }`.

- [ ] **Step 1: Create `permisos-grid.tsx`**

```tsx
"use client";

import { MODULOS, type Nivel, type Permisos } from "@/lib/auth/permisos";

type Opcion = "" | Nivel;

const OPCIONES: { valor: Opcion; label: string }[] = [
  { valor: "", label: "Sin acceso" },
  { valor: "lectura", label: "Lectura" },
  { valor: "escritura", label: "Lectura y escritura" },
];

// Grilla de permisos por módulo: un radio por fila (no se puede marcar
// escritura sin lectura). Los módulos de solo lectura no ofrecen escritura.
export function PermisosGrid({
  value,
  onChange,
}: {
  value: Permisos;
  onChange: (p: Permisos) => void;
}) {
  function setModulo(clave: (typeof MODULOS)[number]["clave"], v: Opcion) {
    const next = { ...value };
    if (v === "") delete next[clave];
    else next[clave] = v;
    onChange(next);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Módulo</th>
            {OPCIONES.map((o) => (
              <th key={o.valor} className="px-2 py-2 text-center">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {MODULOS.map((m) => {
            const actual: Opcion = value[m.clave] ?? "";
            return (
              <tr key={m.clave}>
                <td className="px-3 py-2 text-slate-700">{m.label}</td>
                {OPCIONES.map((o) => {
                  const deshabilitado = o.valor === "escritura" && !m.escritura;
                  return (
                    <td key={o.valor} className="px-2 py-2 text-center">
                      {deshabilitado ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <input
                          type="radio"
                          name={`perm-${m.clave}`}
                          aria-label={`${m.label}: ${o.label}`}
                          checked={actual === o.valor}
                          onChange={() => setModulo(m.clave, o.valor)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="flex items-center gap-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value.ver_costos === true}
          onChange={(e) => onChange({ ...value, ver_costos: e.target.checked })}
        />
        Ver costos, márgenes y flete
      </label>
      {value.finanzas && !value.ver_costos && (
        <p className="px-3 pb-3 text-xs text-amber-700">
          Finanzas requiere «Ver costos, márgenes y flete».
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `usuario-form.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import {
  PERMISOS_DEFAULT_VENDEDOR,
  type Permisos,
  type Rol,
} from "@/lib/auth/permisos";
import type { UsuarioFormState } from "./actions";
import { PermisosGrid } from "./permisos-grid";

type Props = {
  action: (prev: UsuarioFormState, formData: FormData) => Promise<UsuarioFormState>;
  // Sin usuario = crear (pide correo y contraseña). Con usuario = editar.
  usuario?: { email: string; nombre: string | null; rol: Rol; permisos: Permisos };
  submitLabel: string;
};

export function UsuarioForm({ action, usuario, submitLabel }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "admin");
  const [permisos, setPermisos] = useState<Permisos>(
    usuario?.permisos ?? PERMISOS_DEFAULT_VENDEDOR
  );
  const creando = !usuario;

  // Al crear con éxito, limpia el formulario.
  useEffect(() => {
    if (state.success && creando) {
      formRef.current?.reset();
      setRol("admin");
      setPermisos(PERMISOS_DEFAULT_VENDEDOR);
    }
  }, [state.success, creando]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          Correo *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required={creando}
          readOnly={!creando}
          defaultValue={usuario?.email ?? ""}
          autoComplete="off"
          className={`${inputClass} ${creando ? "" : "bg-slate-50 text-slate-500"}`}
        />
        <FieldErrors errors={state.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="nombre" className={labelClass}>
          Nombre *
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          defaultValue={usuario?.nombre ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.nombre} />
      </div>

      {creando && (
        <div>
          <label htmlFor="password" className={labelClass}>
            Contraseña inicial *
          </label>
          <input
            id="password"
            name="password"
            type="text"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.password} />
          <p className="mt-1 text-xs text-slate-500">
            El usuario la usa para entrar. Puede cambiarla luego.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="rol" className={labelClass}>
          Rol
        </label>
        <select
          id="rol"
          name="rol"
          value={rol}
          onChange={(e) => setRol(e.target.value as Rol)}
          className={inputClass}
        >
          <option value="admin">Admin</option>
          <option value="vendedor">Vendedor</option>
        </select>
        <FieldErrors errors={state.fieldErrors?.rol} />
      </div>

      {rol === "vendedor" && (
        <div>
          <p className={labelClass}>Permisos</p>
          <PermisosGrid value={permisos} onChange={setPermisos} />
          <FieldErrors errors={state.fieldErrors?.permisos} />
        </div>
      )}
      <input type="hidden" name="permisos" value={JSON.stringify(permisos)} />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600">
          {creando ? "Usuario creado." : "Cambios guardados."}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Update `actions.ts`**

1. Renombra `CrearUsuarioState` → `UsuarioFormState` y agrega `"permisos"` a las claves de `fieldErrors`.
2. Agrega imports: `import { normalizarPermisos, permisosSchema, validarCambioRol, type Permisos } from "@/lib/auth/permisos";`
3. En `crearSchema` cambia `rol: z.enum(["admin", "usuario"])` → `rol: z.enum(["admin", "vendedor"])`.
4. Agrega el helper:

```ts
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
```

5. En `crearUsuario`: la firma usa `UsuarioFormState`; el default de rol en `safeParse` pasa a `String(formData.get("rol") ?? "admin")` (igual). Tras validar `parsed`, agrega:

```ts
  const perms = leerPermisos(formData, parsed.data.rol);
  if (!perms.ok) return { fieldErrors: { permisos: [perms.error] } };
```

y en el insert de perfiles agrega `permisos: perms.permisos`.

6. Agrega `actualizarUsuario`:

```ts
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
```

(`normalizarPermisos` se usa en la página de edición; si el import queda sin uso en actions, quítalo.)

- [ ] **Step 4: Update `page.tsx` (listado)**

1. `import { CrearUsuarioForm } from "./crear-usuario-form";` → `import { UsuarioForm } from "./usuario-form";` y `import { crearUsuario } from "./actions";`, `import Link from "next/link";`, `import { contarModulos, normalizarPermisos } from "@/lib/auth/permisos";`.
2. `UsuarioRow` suma `permisos: Permisos` (importa el tipo); el select de perfiles pasa a `"user_id, nombre, rol, permisos"`; en el map: `rol: p?.rol ?? "vendedor"`, `permisos: normalizarPermisos(p?.permisos)`. Ajusta el tipo del `Map` a `{ nombre: string | null; rol: string; permisos: unknown }`.
3. La celda de rol:

```tsx
<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
  {u.rol === "vendedor"
    ? `Vendedor · ${contarModulos(u.permisos)} módulos`
    : u.rol}
</span>
```

4. La última celda:

```tsx
{u.id === perfilActual.userId ? (
  <span className="text-xs text-slate-400">Tú</span>
) : (
  <div className="flex items-center justify-end gap-3">
    <Link
      href={`/usuarios/${u.id}/editar`}
      className="text-sm font-medium text-brand-600 hover:text-brand-800"
    >
      Editar
    </Link>
    <EliminarUsuarioButton id={u.id} email={u.email} />
  </div>
)}
```

5. `<CrearUsuarioForm />` → `<UsuarioForm action={crearUsuario} submitLabel="Crear usuario" />`.
6. Borra `crear-usuario-form.tsx`: `git rm "src/app/(app)/usuarios/crear-usuario-form.tsx"`.

- [ ] **Step 5: Create `[id]/editar/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/rol";
import { normalizarPermisos } from "@/lib/auth/permisos";
import { actualizarUsuario } from "../../actions";
import { UsuarioForm } from "../../usuario-form";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: authData }, { data: perfil }] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("perfiles").select("nombre, rol, permisos").eq("user_id", id).maybeSingle(),
  ]);
  if (!authData?.user || !perfil) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/usuarios" className="text-sm text-brand-600 hover:text-brand-800">
        ← Usuarios
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-slate-900">Editar usuario</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <UsuarioForm
          action={actualizarUsuario.bind(null, id)}
          submitLabel="Guardar cambios"
          usuario={{
            email: authData.user.email ?? "",
            nombre: perfil.nombre,
            rol: perfil.rol === "admin" ? "admin" : "vendedor",
            permisos: normalizarPermisos(perfil.permisos),
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/usuarios"
git commit -m "Usuarios: rol vendedor con grilla de permisos y edición de usuarios"
```

---

### Task 7: Guards en páginas, rutas y actions

**Files (Modify):** todas las `page.tsx`, `route.ts` y `actions.ts` bajo `src/app/(app)/` listadas abajo.

**Interfaces:**
- Consumes: Task 4 (`requirePermiso`, `checkPermiso`, `requireAdmin`, `esAdmin`, `getPerfilActual`, `SIN_PERMISO`), `createAdminClient`.

Patrones (úsalos tal cual):

```ts
// Página server (primera línea del componente):
const perfil = await requirePermiso("cotizaciones");            // lectura
const perfil = await requirePermiso("cotizaciones", "escritura"); // nueva/editar

// Action que devuelve estado/resultado con `error`:
if (!(await checkPermiso("cotizaciones", "escritura"))) return { error: SIN_PERMISO };

// Action que devuelve void (usa redirect):
await requirePermiso("cotizaciones", "escritura");

// Solo admin, action con `error`:
if (!(await esAdmin())) return { error: SIN_PERMISO };
// Solo admin, página o action void:
await requireAdmin();

// Route handler (PDF/adjunto):
const perfil = await getPerfilActual();
if (!tienePermiso(perfil, "cotizaciones", "lectura")) {
  return new Response("No autorizado", { status: 401 });
}
```

- [ ] **Step 1: Pages**

| Archivo (`src/app/(app)/…`) | Guard |
|---|---|
| `dashboard/page.tsx` | `requirePermiso("dashboard")` |
| `cotizaciones/page.tsx`, `cotizaciones/[id]/page.tsx` | `requirePermiso("cotizaciones")` |
| `cotizaciones/nueva/page.tsx`, `cotizaciones/[id]/editar/page.tsx` | `requirePermiso("cotizaciones", "escritura")` |
| `notas-venta/page.tsx`, `notas-venta/[id]/page.tsx` | `requirePermiso("notas_venta")` |
| `notas-venta/nueva/page.tsx`, `notas-venta/[id]/editar/page.tsx` | `requirePermiso("notas_venta", "escritura")` |
| `ventas/page.tsx` | `requirePermiso("ventas")` |
| `conciliacion/page.tsx` | `requirePermiso("conciliacion")` |
| `clientes/page.tsx` | `requirePermiso("clientes")` |
| `clientes/nuevo/page.tsx`, `clientes/[id]/editar/page.tsx` | `requirePermiso("clientes", "escritura")` |
| `estados-cuenta/page.tsx`, `estados-cuenta/[id]/page.tsx` | `requirePermiso("estados_cuenta")` |
| `productos/page.tsx` | `requirePermiso("productos")` |
| `productos/nuevo/page.tsx`, `productos/[id]/editar/page.tsx` | `requirePermiso("productos", "escritura")` |
| `finanzas/page.tsx` | `requirePermiso("finanzas")` y luego `if (!puedeVerCostos(perfil)) redirect(primeraRutaPermitida({ ...perfil, permisos: { ...perfil.permisos, finanzas: undefined } }))` |
| `correos/page.tsx`, `correos/enviados/page.tsx`, `correos/[id]/page.tsx` | `requirePermiso("correos")` |
| `correos/nuevo/page.tsx` | `requirePermiso("correos", "escritura")` |
| `compras/page.tsx`, `ordenes-compra/page.tsx`, `ordenes-compra/nueva/page.tsx`, `ordenes-compra/[id]/page.tsx`, `ordenes-compra/[id]/editar/page.tsx`, `proveedores/page.tsx` | `requireAdmin()` |

Las páginas de detalle ya hacen `notFound()` cuando la consulta vuelve vacía; con la RLS nueva eso cubre documentos ajenos. Verifica con `grep -L "notFound" "src/app/(app)/"*/\[id\]/page.tsx`: toda página de detalle debe llamar `notFound()` si no hay data.

- [ ] **Step 2: Route handlers**

| Archivo | Cambio |
|---|---|
| `cotizaciones/[id]/pdf/route.ts` | guard de route handler con `"cotizaciones"`; si la consulta (cliente RLS) vuelve vacía → `404` (verifica que ya lo haga) |
| `estados-cuenta/[id]/pdf/route.ts` | guard con `"estados_cuenta"` |
| `correos/[id]/adjunto/[attId]/route.ts` | guard con `"correos"` |
| `ventas/[id]/pdf/route.ts` | ver abajo (usa service role) |
| `compras/[id]/pdf/route.ts`, `ordenes-compra/[id]/pdf/route.ts` | `const perfil = await getPerfilActual(); if (perfil?.rol !== "admin") return new Response("No autorizado", { status: 401 });` |

`ventas/[id]/pdf/route.ts` salta RLS con service role; reemplaza el chequeo de membresía por:

```ts
  // Este handler usa el service role (salta RLS): el acceso se valida a mano.
  // Para un vendedor, la propia RLS decide si la factura es suya: si con su
  // sesión no la ve, no existe para él.
  const perfil = await getPerfilActual();
  const puedeVer =
    tienePermiso(perfil, "ventas", "lectura") ||
    tienePermiso(perfil, "conciliacion", "lectura") ||
    tienePermiso(perfil, "estados_cuenta", "lectura") ||
    tienePermiso(perfil, "notas_venta", "lectura");
  if (!perfil || !puedeVer) {
    return new Response("No autorizado", { status: 401 });
  }
  if (perfil.rol !== "admin") {
    const supabase = await createClient();
    const { data: propia } = await supabase
      .from("ventas_sii")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!propia) return new Response("Venta no encontrada", { status: 404 });
  }
```

(imports: `createClient` de `@/lib/supabase/server`, `tienePermiso` de `@/lib/auth/permisos`).

- [ ] **Step 3: Server actions**

| Archivo | Funciones | Guard |
|---|---|---|
| `cotizaciones/actions.ts` | `crearCotizacion`, `actualizarCotizacion`, `enviarCotizacion`, `eliminarCotizacion` | `checkPermiso("cotizaciones","escritura")` → `{ error: SIN_PERMISO }` |
| | `duplicarCotizacion` (void) | `requirePermiso("cotizaciones","escritura")` |
| | `pasarANotaVenta` (void) | `requirePermiso("cotizaciones","escritura")` y `requirePermiso("notas_venta","escritura")` |
| `notas-venta/actions.ts` | `registrarCobro`, `eliminarCobro`, `crearNotaVenta`, `actualizarNotaVenta`, `eliminarNotaVenta`, `anularNotaVenta` | `checkPermiso("notas_venta","escritura")` (si alguna es void, usa `requirePermiso`) |
| | `vincularFacturaVenta`, `setObservacionVenta`, `desvincularFacturaVenta` | solo admin (`esAdmin()`) |
| `clientes/actions.ts` | `crearCliente`, `actualizarCliente`, `eliminarCliente` | `checkPermiso("clientes","escritura")` |
| `productos/actions.ts` | `crearProducto`, `actualizarProducto` | `checkPermiso("productos","escritura")` (en Task 10 se reutiliza el perfil devuelto) |
| `correos/actions.ts` | `enviarCorreoNuevo` | `checkPermiso("correos","escritura")` |
| `estados-cuenta/actions.ts` | `setVencimientoManual` | solo admin |
| `ventas/actions.ts` | `actualizarVentas` | solo admin |
| `compras/actions.ts` | `actualizarCompras`, `setFormasPagoCompra`, `generarPdfsCompras` | solo admin |
| `ordenes-compra/actions.ts` | `crearOrdenCompra`, `actualizarOrdenCompra`, `enviarOrdenCompra`, `reenviarOrdenCompra`, `marcarRecibida`, `cerrarOrden` | solo admin |
| `proveedores/actions.ts` | `setTipoProveedor`, `crearProveedor`, `setCorreoProveedor` | solo admin |

Para cada función, mira su tipo de retorno: si su resultado tiene `error?: string`, usa la variante `{ error: SIN_PERMISO }`; si es `Promise<void>`, la variante con redirect. El guard va **antes** de cualquier parseo o consulta.

- [ ] **Step 4: Auto-vínculo nota↔factura con service role**

`autoVincularNota` busca facturas **sin nota**, que la RLS nueva le oculta a un vendedor. Como la nota recién se creó/actualizó con su sesión (la RLS ya validó que es suya), el calce se hace con service role:

- `src/app/(app)/cotizaciones/actions.ts` (~línea 512): `await autoVincularNota(supabase, nota.id);` → `await autoVincularNota(createAdminClient(), nota.id);`
- `src/app/(app)/notas-venta/actions.ts` (~líneas 225 y 283): igual, con `nota.id` e `id`.
- Agrega `import { createAdminClient } from "@/lib/supabase/admin";` en ambos.

- [ ] **Step 5: Verify coverage**

Run:
```bash
cd "src/app/(app)" && for f in $(find . -name page.tsx -o -name route.ts | grep -v -e usuarios -e perfil -e sin-acceso); do grep -qE "requirePermiso|requireAdmin|getPerfilActual" "$f" || echo "SIN GUARD: $f"; done
grep -c "export async function" */actions.ts; grep -cE "checkPermiso|requirePermiso|esAdmin|requireAdmin|getPerfilActual" */actions.ts
```
Expected: ningún `SIN GUARD`; en cada `actions.ts` (salvo `perfil/`) el conteo de guards ≥ el de funciones exportadas.

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)"
git commit -m "Guards de permisos en páginas, PDFs y server actions"
```

---

### Task 8: Ocultar botones de escritura con solo lectura

**Files (Modify):** listados/detalles de cotizaciones, notas de venta, clientes, productos y correos.

**Interfaces:**
- Consumes: `perfil` devuelto por `requirePermiso` (Task 7), `tienePermiso` (Task 1).

Cosmético (el server ya bloquea), pero evita botones que fallan. En cada página server calcula:

```ts
const puedeEscribir = tienePermiso(perfil, "<clave>", "escritura");
```

y envuelve cada control de escritura con `{puedeEscribir && (...)}`. Si el control vive en un componente cliente (tabla, botones de acción), pásale `puedeEscribir` como prop y condiciona dentro.

- [ ] **Step 1: Locate write controls**

Run:
```bash
grep -rnE 'href=\{?[`"]/(cotizaciones|notas-venta|clientes|productos|correos)/(nueva|nuevo)|/editar|Eliminar|Duplicar|Enviar|Anular|Pasar a nota|Registrar cobro|DeleteCliente|acciones-nota|cobros-nota|factura-vinculo' "src/app/(app)/"{cotizaciones,notas-venta,clientes,productos,correos}
```
Expected: lista de los controles a condicionar.

- [ ] **Step 2: Apply**

- `cotizaciones/page.tsx`: link "Nueva cotización". `cotizaciones/[id]/page.tsx`: editar, duplicar, enviar, eliminar, "pasar a nota" (este último además requiere `tienePermiso(perfil, "notas_venta", "escritura")`).
- `notas-venta/page.tsx`: "Nueva nota de venta". `notas-venta/[id]/page.tsx`: `acciones-nota` (editar/anular/eliminar) y el formulario de `cobros-nota` con `puedeEscribir`; `factura-vinculo` (vincular/desvincular/observación) con `esAdmin = perfil.rol === "admin"`.
- `clientes/page.tsx` + `clientes-tabla.tsx`: "Nuevo cliente", editar y `delete-cliente-button`.
- `productos/page.tsx` + `productos-tabla.tsx`: "Nuevo producto" y editar.
- `correos/*`: botón "Redactar"/link a `/correos/nuevo` y responder, con `tienePermiso(perfil, "correos", "escritura")`.
- `ventas/page.tsx`: `ActualizarVentasButton` solo si `perfil.rol === "admin"`. `estados-cuenta/*`: `vencimiento-editable` editable solo para admin (si no, muestra la fecha en texto).

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)"
git commit -m "UI: oculta acciones de escritura a quien tiene solo lectura"
```

---

### Task 9: Costos ocultos en cotizaciones y notas de venta

**Files (Modify):**
- `src/app/(app)/cotizaciones/cotizacion-form.tsx`, `cotizaciones/nueva/page.tsx`, `cotizaciones/[id]/editar/page.tsx`, `cotizaciones/[id]/page.tsx`, `cotizaciones/actions.ts`
- `src/app/(app)/notas-venta/nota-venta-form.tsx`, `notas-venta/nueva/page.tsx`, `notas-venta/[id]/editar/page.tsx`, `notas-venta/[id]/page.tsx`, `notas-venta/actions.ts`, `notas-venta/page.tsx`, `notas-venta/notas-venta-tabla.tsx`

**Interfaces:**
- Consumes: Task 1 (`puedeVerCostos`), Task 2 (`restaurarCostosOcultos`, `costosDeProductos`), Task 4/7 (`perfil` de `requirePermiso` / `checkPermiso`).
- Produces: prop `verCostos: boolean` en `CotizacionForm`, `NotaVentaForm`, `NotasVentaTabla`.

- [ ] **Step 1: Pages new/edit strip costs**

En `cotizaciones/nueva/page.tsx`, `cotizaciones/[id]/editar/page.tsx`, `notas-venta/nueva/page.tsx`, `notas-venta/[id]/editar/page.tsx`:

```ts
const verCostos = puedeVerCostos(perfil);
// Sin «ver costos» el costo no viaja al navegador. El flete sí (el total de
// la línea lo incluye) pero no se muestra.
const productosForm = (productos ?? []).map((p) => (verCostos ? p : { ...p, costo: 0 }));
```

En las de edición, además mapea los ítems: `costo: verCostos ? costo : 0`. Pasa `productos={productosForm}` y `verCostos={verCostos}` al form.

- [ ] **Step 2: Forms hide columns**

En `CotizacionForm` agrega `verCostos?: boolean` a `CotizacionFormProps` (default `true` en la desestructuración). Envuelve con `{verCostos && (...)}`:
- los `<th>` "Costo", "Margen %", "Flete unit." (líneas ~373–378);
- los `<td>` del input `aria-label="Costo"`, del input `aria-label="Margen porcentual sobre el costo"` y del input `aria-label="Flete unitario"`;
- los dos `<p className="text-xs text-slate-500">` explicativos de flete y Margen % (~líneas 539–551).
- `colSpan={10}` → `colSpan={verCostos ? 10 : 7}`.

En `NotaVentaForm` igual: prop `verCostos?: boolean`, oculta `<th>` Costo y Flete unit. (~253, 255), sus `<td>` (`aria-label="Costo"` ~320, `aria-label="Flete unitario"` ~350), el `<p>` de flete (~409), y `colSpan={9}` → `colSpan={verCostos ? 9 : 7}`.

- [ ] **Step 3: Actions restore costs**

En `cotizaciones/actions.ts`:

1. Imports: `import { checkPermiso, SIN_PERMISO } from "@/lib/auth/rol";`, `import { puedeVerCostos } from "@/lib/auth/permisos";`, `import { restaurarCostosOcultos, costosDeProductos } from "@/lib/costos-ocultos";`.
2. En `crearCotizacion`, el guard de Task 7 queda como `const perfil = await checkPermiso("cotizaciones", "escritura"); if (!perfil) return { error: SIN_PERMISO };`. Tras crear `supabase`:

```ts
  let items = parsed.data.items;
  if (!puedeVerCostos(perfil)) {
    items = restaurarCostosOcultos(items, [], await costosDeProductos(supabase, items));
  }
  const datos = { ...parsed.data, items };
```

   y usa `datos` en lugar de `parsed.data` en `toCotizacionRow(...)` y `toItemRows(...)`.
3. En `actualizarCotizacion`, igual, pero los previos se leen **antes** del delete de ítems:

```ts
  let items = parsed.data.items;
  if (!puedeVerCostos(perfil)) {
    const { data: previos } = await supabase
      .from("cotizacion_items")
      .select("producto_id, sku, descripcion, costo, flete, posicion")
      .eq("cotizacion_id", id)
      .order("posicion");
    items = restaurarCostosOcultos(items, previos ?? [], await costosDeProductos(supabase, items));
  }
  const datos = { ...parsed.data, items };
```

   (ubícalo después de validar `estado === "borrador"` y antes del `update`), y usa `datos` en `toCotizacionRow` y `toItemRows`.

En `notas-venta/actions.ts`, lo mismo en `crearNotaVenta` (previos `[]`) y `actualizarNotaVenta` (previos de `nota_venta_items` con `select("sku, descripcion, costo, flete, posicion").eq("nota_venta_id", id).order("posicion")`, antes del delete), con `checkPermiso("notas_venta", "escritura")`.

- [ ] **Step 4: Detail pages hide internal columns**

En `cotizaciones/[id]/page.tsx` y `notas-venta/[id]/page.tsx`: toma `const perfil = await requirePermiso(...)` (de Task 7) y `const verCostos = puedeVerCostos(perfil);`. Envuelve con `{verCostos && (...)}`:
- `<th>` "Costo (interno)", "Precio" (el base: sin flete a la vista, precio base + precio final delatarían el flete), "Flete unit. (interno)", "Margen (interno)";
- los `<td>` correspondientes (`formatCLP(item.costo)`, `formatCLP(item.precio)`, `formatCLP(item.flete)` y la celda de margen con `markupPctLinea`);
- en el recuadro de totales, los dos `<div>` de "Margen (interno)" y "sobre venta".
- `colSpan={10}` → `colSpan={verCostos ? 10 : 6}`.

- [ ] **Step 5: Notes list hides margin**

En `notas-venta/page.tsx`: `const perfil = await requirePermiso("notas_venta"); const verCostos = puedeVerCostos(perfil);` y en el map devuelve `costo: verCostos ? costo : 0`. Pasa `<NotasVentaTabla notas={notas} verCostos={verCostos} />`.

En `notas-venta-tabla.tsx`: `export function NotasVentaTabla({ notas, verCostos = true }: { notas: NotaVentaRow[]; verCostos?: boolean })` y, en el `<tfoot>`, reemplaza el contenido del `<td ... colSpan={2}>` "Margen interno" por `{verCostos && (<>…contenido actual…</>)}` (el `<td>` se mantiene para no descuadrar columnas). Revisa con `grep -n "margen\|costo" notas-venta-tabla.tsx` que no haya otra columna de margen en el `<tbody>`; si la hay, condiciónala igual.

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/cotizaciones" "src/app/(app)/notas-venta"
git commit -m "Cotizaciones y notas: costos, flete y margen ocultos sin permiso"
```

---

### Task 10: Costos ocultos en productos, dashboard, finanzas y estados de cuenta

**Files (Modify):**
- `src/app/(app)/productos/page.tsx`, `productos/productos-tabla.tsx`, `productos/producto-form.tsx`, `productos/nuevo/page.tsx`, `productos/[id]/editar/page.tsx`, `productos/actions.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/finanzas/page.tsx`, `finanzas/finanzas-vista.tsx`
- `src/app/(app)/estados-cuenta/page.tsx`

**Interfaces:**
- Consumes: Task 1 (`puedeVerCostos`), Task 4/7 (`perfil`).
- Produces: props `verCostos` en `ProductosTabla` y `ProductoForm`; prop `mostrarPorPagar` en `FinanzasVista`.

- [ ] **Step 1: Productos**

- `productos/page.tsx`: `const verCostos = puedeVerCostos(perfil);` El select pasa a `verCostos ? "id, sku, descripcion, costo, precio, activo" : "id, sku, descripcion, precio, activo"` y mapea `costo: 0` cuando no hay permiso. `<ProductosTabla productos={productos} verCostos={verCostos} />`.
- `productos-tabla.tsx`: prop `verCostos = true`; envuelve `<th>` "Costo" y "Margen" (~79, 81) y sus `<td>` (~108, ~114) en `{verCostos && (...)}`; ajusta cualquier `colSpan` de fila vacía con `verCostos ? N : N - 2`.
- `producto-form.tsx`: prop `verCostos?: boolean` (default `true`); envuelve el bloque `<div>` del campo costo (label `Costo (CLP) *` ~64–78) en `{verCostos && (...)}`.
- `productos/nuevo/page.tsx` y `productos/[id]/editar/page.tsx`: pasan `verCostos={puedeVerCostos(perfil)}`; en editar, si no hay permiso, selecciona el producto sin `costo`.
- `productos/actions.ts`: con `const perfil = await checkPermiso("productos", "escritura")`:
  - `crearProducto`: `insert(puedeVerCostos(perfil) ? parsed.data : { ...parsed.data, costo: 0 })`.
  - `actualizarProducto`: `const { costo, ...sinCosto } = parsed.data; update(puedeVerCostos(perfil) ? parsed.data : sinCosto)` (el costo no enviado viene como 0 por `z.coerce` y se descarta).

- [ ] **Step 2: Dashboard**

En `dashboard/page.tsx` (`const perfil = await requirePermiso("dashboard"); const esAdmin = perfil.rol === "admin";`):
- La consulta de `compras_sii` del `Promise.all` pasa a
  `esAdmin ? supabase.from("compras_sii").select("tipo_doc, monto_neto, monto_exento").gte("fecha_emision", inicioMesFecha) : Promise.resolve({ data: [], error: null })`.
- `stats`: la tarjeta "Por pagar del mes" solo si `esAdmin` (`...(esAdmin ? [{ label: "Por pagar del mes", ... }] : [])`).
- `<Margenes />` y `<PanelesSii />` solo si `esAdmin` (ambos cruzan con compras de la empresa).
- Para un vendedor, las tarjetas de venta y las últimas cotizaciones/notas ya salen filtradas a lo suyo por la RLS.

- [ ] **Step 3: Finanzas**

- `finanzas/page.tsx`: con `perfil` (Task 7) y `const esAdmin = perfil.rol === "admin";`, la consulta de `compras_sii` pasa a `esAdmin ? supabase.from("compras_sii").select(...) : Promise.resolve({ data: [] })`. Pasa `mostrarPorPagar={esAdmin}` a `FinanzasVista`.
- `finanzas-vista.tsx`: agrega `mostrarPorPagar = true` a props (tipo `mostrarPorPagar?: boolean`) y envuelve el `<CardMonto label="Cuentas por pagar" … />` en `{mostrarPorPagar && (...)}`.

- [ ] **Step 4: Estados de cuenta — solo sus clientes**

En `estados-cuenta/page.tsx` (`const perfil = await requirePermiso("estados_cuenta");`), después de cargar `clientes`:

```ts
  // Un vendedor ve la lista de clientes completa (catálogo), pero su estado de
  // cuenta solo tiene sentido con los clientes a los que les ha facturado.
  let visibles = clientes;
  if (perfil.rol !== "admin") {
    const { data: ventas } = await supabase.from("ventas_sii").select("rut_cliente");
    const ruts = new Set((ventas ?? []).map((v) => normalizarRut(v.rut_cliente)));
    visibles = clientes.filter((c) => ruts.has(normalizarRut(c.rut)));
  }
```

y pasa `clientes={visibles}` (import `normalizarRut` de `@/lib/rut`).

- [ ] **Step 5: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/productos" "src/app/(app)/dashboard" "src/app/(app)/finanzas" "src/app/(app)/estados-cuenta"
git commit -m "Productos, dashboard, finanzas y estados de cuenta según permisos"
```

---

### Task 11: Aplicar migración, verificar con un vendedor real y desplegar

**Files:**
- Create (scratchpad, no se commitea): `verificar-rls-vendedor.mjs`

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 2: Apply migration (usuario)**

Pedir al usuario que pegue `supabase/migrations/024_perfil_vendedor_permisos.sql` en el SQL Editor de Supabase y lo ejecute. Luego verificar con service role (solo lectura):

```bash
node --env-file=.env.local -e '
const {createClient}=require("@supabase/supabase-js");
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  console.log((await s.from("perfiles").select("nombre,rol,permisos")).data);
  for (const t of ["cotizaciones","notas_venta"]) {
    const r=await s.from(t).select("vendedor,vendedor_id");
    console.log(t, r.error?.message ?? r.data.filter(x=>!x.vendedor_id).length + " sin dueño de " + r.data.length);
  }
})()'
```
Expected: 3 perfiles admin con `permisos {}`; notas con 0 sin dueño; cotizaciones con 5 sin dueño (las de vendedor null).

- [ ] **Step 3: Create a test vendor**

Con `npm run dev`, como admin en `/usuarios` crear `vendedor.prueba@tulbless.cl` (contraseña de prueba), rol Vendedor, permisos: cotizaciones escritura, clientes lectura, productos lectura, sin ver costos. Crear con él una cotización.

- [ ] **Step 4: Verify RLS with the vendor JWT**

Script en el scratchpad (`verificar-rls-vendedor.mjs`):

```js
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { error: e } = await s.auth.signInWithPassword({
  email: process.env.VEND_EMAIL,
  password: process.env.VEND_PASS,
});
if (e) throw e;

const cuenta = async (t) => {
  const r = await s.from(t).select("*", { count: "exact", head: true });
  return r.error ? `error ${r.error.message}` : r.count;
};
for (const t of ["cotizaciones", "notas_venta", "ventas_sii", "compras_sii", "proveedores", "ordenes_compra", "correos", "clientes", "productos"]) {
  console.log(t, await cuenta(t));
}
const ins = await s.from("notas_venta").insert({ cliente_id: "00000000-0000-0000-0000-000000000000" }).select("id");
console.log("insert nota (sin permiso):", ins.error ? "RECHAZADO ok" : "PERMITIDO — FALLA");
const esc = await s.from("perfiles").update({ rol: "admin" }).eq("user_id", (await s.auth.getUser()).data.user.id).select("rol");
console.log("autoescalar rol:", esc.error ? "RECHAZADO ok" : "PERMITIDO — FALLA");
```

Run: `VEND_EMAIL=... VEND_PASS=... node --env-file=.env.local <scratchpad>/verificar-rls-vendedor.mjs`
Expected: `cotizaciones` = 1 (solo la suya), `notas_venta` 0, `ventas_sii` 0, `compras_sii` 0, `proveedores` 0, `ordenes_compra` 0, `correos` 0, `clientes` y `productos` = totales; insert nota y autoescalar → `RECHAZADO ok`.

- [ ] **Step 5: Manual UI check (vendor session)**

- Sidebar muestra solo Cotizaciones, Clientes, Productos.
- Login aterriza en `/cotizaciones` (sin dashboard).
- `/compras`, `/finanzas`, `/notas-venta` por URL → redirige.
- `/cotizaciones/<id de una cotización de Victor>` → 404.
- Formulario de cotización sin columnas Costo/Margen/Flete; detalle sin columnas internas ni margen.
- `/clientes`: sin botón "Nuevo cliente".
- Como admin: editar la cotización del vendedor y ver que el costo quedó con el costo del producto.
- Como admin: todo igual que antes (dashboard, finanzas, compras).

- [ ] **Step 6: Push and deploy**

Confirmar con el usuario antes de hacer push (sale a producción vía Vercel):

```bash
git push origin main
```

- [ ] **Step 7: Clean up**

Pregunta al usuario si se elimina el vendedor de prueba desde `/usuarios`.

---

## Notas de ajuste sobre el spec

- **Finanzas exige `ver_costos`** (validado en la grilla y en `permisosSchema`): la página es utilidad de punta a punta; ocultarla por partes la dejaba vacía.
- **Dashboard para vendedor**: se ocultan "Por pagar del mes", el panel de márgenes y los paneles SII (cruzan con compras de la empresa), no solo según `ver_costos`.
- **Vincular/desvincular facturas y observación de factura**: solo admin (escriben `ventas_sii`). El auto-vínculo al crear una nota sí corre para el vendedor (service role, acotado a su nota).
- **Flete en el formulario**: sin `ver_costos` el flete no se muestra, pero sigue en el estado del formulario de edición para que el total cuadre. En el detalle se ocultan precio base y flete (queda solo el precio final).
- **Costo de ítems libres** creados por un vendedor sin `ver_costos` queda en 0; el admin lo completa al revisar.
