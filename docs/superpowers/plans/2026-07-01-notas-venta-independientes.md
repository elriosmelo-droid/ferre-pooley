# Notas de Venta Independientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear notas de venta directas con detalle (sin cotización), acción "Pasar a nota de venta" desde cualquier cotización, y aceptar una cotización deja de crear la nota automáticamente.

**Architecture:** Migración 009 hace `notas_venta.cotizacion_id` nullable, agrega `notas_venta.vendedor` y redefine el RPC `responder_cotizacion` para que aceptar solo marque la cotización. Server actions nuevas (`crearNotaVenta`, `actualizarNotaVenta`, `pasarANotaVenta`) siguen el patrón de `cotizaciones/actions.ts`. Form nuevo `nota-venta-form.tsx` (adaptación de `cotizacion-form.tsx` sin fecha de validez ni notas). Spec: `docs/superpowers/specs/2026-07-01-notas-venta-independientes-design.md`.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (PostgREST + RPC plpgsql), zod v4, Tailwind, vitest.

## Global Constraints

- Este Next.js NO es el de training data: ante dudas de API leer `node_modules/next/dist/docs/` (AGENTS.md).
- Commits: autor único `Elvis Rios <elriosmelo@gmail.com>`, SIN trailer Co-Authored-By.
- Deploy a prod SIEMPRE manual: `vercel --prod --yes` (auto-deploy de GitHub roto).
- Migraciones se aplican a mano vía Node `pg` con pooler `aws-1-sa-east-1.pooler.supabase.com:5432`, user `postgres.iiqfbedwoogadtrmrqfq` (password en `ferre-pooley-estado` memory / .env conocido por Elvis); correr desde la raíz del proyecto (ahí está `node_modules/pg`).
- Verificación estándar por task: `npx tsc --noEmit` y `npm run lint` sin errores nuevos. `npm test` corre los vitest existentes de `src/lib`.
- Los server actions y páginas de este repo NO tienen tests unitarios (no hay mock de Supabase); la verificación es tsc + lint + revisión manual/live. No inventar infraestructura de test nueva.
- Textos de UI en español de Chile, mismo tono que los existentes.

---

### Task 1: Migración 009 (archivo SQL)

**Files:**
- Create: `supabase/migrations/009_notas_venta_independientes.sql`

**Interfaces:**
- Produces: columna `notas_venta.vendedor text`, `notas_venta.cotizacion_id` nullable (sigue `unique`), RPC `responder_cotizacion` que ya no inserta en `notas_venta` (retorno `(resultado, nota_venta_folio, transicion)` se mantiene, folio siempre null).
- La aplicación a prod ocurre en Task 7 (no aplicar aquí).

- [ ] **Step 1: Escribir la migración**

```sql
-- 009: Notas de venta independientes de la cotización.
-- 1) Una nota puede existir sin cotización (creación manual).
-- 2) La nota lleva su propio vendedor (antes se leía de la cotización).
-- 3) Aceptar una cotización ya NO crea la nota de venta automáticamente;
--    la nota se crea a mano o con la acción "Pasar a nota de venta".

alter table notas_venta alter column cotizacion_id drop not null;

alter table notas_venta add column vendedor text;

-- Backfill: las notas existentes heredan el vendedor de su cotización.
update notas_venta nv
set vendedor = c.vendedor
from cotizaciones c
where nv.cotizacion_id = c.id
  and nv.vendedor is null;

-- Se mantiene la forma del retorno (nota_venta_folio queda siempre null)
-- para no romper a los llamadores existentes.
create or replace function responder_cotizacion(
  p_token uuid,
  p_aceptar boolean,
  p_firma text default null,
  p_firmante text default null,
  p_motivo text default null
)
returns table (resultado text, nota_venta_folio text, transicion boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_cot cotizaciones%rowtype;
begin
  select * into v_cot from cotizaciones where token_aceptacion = p_token for update;
  if not found then
    return query select 'no_existe'::text, null::text, false; return;
  end if;
  if v_cot.estado <> 'enviada' then
    return query select v_cot.estado::text, null::text, false; return;
  end if;
  if v_cot.fecha_validez < current_date then
    update cotizaciones set estado = 'vencida' where id = v_cot.id;
    return query select 'vencida'::text, null::text, true; return;
  end if;
  if p_aceptar then
    update cotizaciones
      set estado = 'aceptada', respondida_at = now(),
          firma = p_firma, firmante = p_firmante
      where id = v_cot.id;
    return query select 'aceptada'::text, null::text, true;
  else
    update cotizaciones set estado = 'rechazada', respondida_at = now(),
      motivo_rechazo = p_motivo where id = v_cot.id;
    return query select 'rechazada'::text, null::text, true;
  end if;
end $$;
```

- [ ] **Step 2: Sanity check del SQL (solo lectura, sin aplicar)**

Revisar a ojo contra `001_schema.sql:123-165` y `002_descuento_medio_pago.sql:20-60`: misma firma de 5 parámetros, mismos estados, sin `v_nv` ni inserts. El `unique` de `cotizacion_id` viene de 001 y se conserva (nullable unique admite muchos NULL en Postgres).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_notas_venta_independientes.sql
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Migración 009: notas de venta independientes (cotizacion_id nullable, vendedor, RPC sin auto-nota)"
```

---

### Task 2: Extraer `resolverVendedor` a `src/lib/vendedor.ts`

**Files:**
- Create: `src/lib/vendedor.ts`
- Modify: `src/app/(app)/cotizaciones/actions.ts:114-129` (borrar función local, importar la nueva)

**Interfaces:**
- Produces: `resolverVendedor(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null>` — la consumen Task 3 y Task 5.

- [ ] **Step 1: Crear `src/lib/vendedor.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";

// Nombre del vendedor que crea el documento: nombre de su perfil, o su correo
// como respaldo si todavía no lo cargó.
export async function resolverVendedor(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("user_id", user.id)
    .maybeSingle();
  return perfil?.nombre?.trim() || user.email || null;
}
```

- [ ] **Step 2: Actualizar `cotizaciones/actions.ts`**

Borrar la función local `resolverVendedor` (líneas 114-129, incluido su comentario) y agregar al bloque de imports:

```ts
import { resolverVendedor } from "@/lib/vendedor";
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/vendedor.ts "src/app/(app)/cotizaciones/actions.ts"
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Extraer resolverVendedor a lib compartida"
```

---

### Task 3: Server actions de nota manual + form + /notas-venta/nueva

**Files:**
- Modify: `src/app/(app)/notas-venta/actions.ts` (agregar al final; conservar todo lo existente)
- Create: `src/app/(app)/notas-venta/nota-venta-form.tsx`
- Create: `src/app/(app)/notas-venta/nueva/page.tsx`
- Modify: `src/app/(app)/notas-venta/page.tsx` (botón "Nueva nota de venta")

**Interfaces:**
- Consumes: `resolverVendedor` (Task 2), `calcularTotales`/`descuentoUnitario` de `@/lib/totals`, `MEDIOS_PAGO`/`MEDIOS_PAGO_VALORES` de `@/lib/medio-pago`, `FieldErrors`/`inputClass`/`labelClass` de `@/components/form-ui`.
- Produces: `NotaVentaFormState` type; `crearNotaVenta(prevState, formData)`; `actualizarNotaVenta(id, prevState, formData)`; componente `NotaVentaForm({ clientes, productos, nota?, action })` con `NotaVentaItemInput`. Los consume Task 4.
- Nota: `nota_venta_items` NO tiene columna `producto_id` (ver 001_schema.sql:77-87). El form lo usa solo en cliente para prefill del catálogo; se descarta al armar las filas.

- [ ] **Step 1: Agregar schema y actions a `notas-venta/actions.ts`**

Agregar imports arriba (mantener los existentes):

```ts
import { z } from "zod";
import { calcularTotales } from "@/lib/totals";
import { MEDIOS_PAGO_VALORES } from "@/lib/medio-pago";
import { resolverVendedor } from "@/lib/vendedor";
```

Agregar al final del archivo:

```ts
export type NotaVentaFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"cliente_id" | "medio_pago" | "items", string[]>>;
};

const notaItemSchema = z.object({
  // Solo para prefill en el cliente; nota_venta_items no guarda producto_id.
  producto_id: z.uuid().nullable(),
  sku: z.string().trim(),
  descripcion: z.string().trim().min(1, "Cada ítem necesita una descripción"),
  cantidad: z
    .number("Ingresa una cantidad válida")
    .int("La cantidad debe ser un número entero")
    .min(1, "La cantidad debe ser al menos 1"),
  costo: z
    .number("Ingresa un costo válido")
    .int("El costo debe ser un número entero")
    .min(0, "El costo debe ser mayor o igual a 0"),
  precio: z
    .number("Ingresa un precio válido")
    .int("El precio debe ser un número entero")
    .min(0, "El precio debe ser mayor o igual a 0"),
  flete: z
    .number("Ingresa un flete válido")
    .int("El flete debe ser un número entero")
    .min(0, "El flete debe ser mayor o igual a 0"),
  descuento: z
    .number("Ingresa un descuento válido")
    .int("El descuento debe ser un número entero")
    .min(0, "El descuento debe ser mayor o igual a 0")
    .max(100, "El descuento no puede superar 100%"),
});

const notaVentaSchema = z.object({
  cliente_id: z.uuid("Selecciona un cliente"),
  medio_pago: z
    .array(z.enum(MEDIOS_PAGO_VALORES))
    .min(1, "Selecciona al menos un medio de pago"),
  items: z
    .array(notaItemSchema, "Los ítems no son válidos")
    .min(1, "Agrega al menos un ítem"),
});

function parseNotaVentaForm(formData: FormData) {
  let items: unknown = null;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = null;
  }
  return notaVentaSchema.safeParse({
    cliente_id: String(formData.get("cliente_id") ?? ""),
    medio_pago: formData.getAll("medio_pago").map(String),
    items,
  });
}

function toNotaVentaRow(data: z.infer<typeof notaVentaSchema>) {
  const totales = calcularTotales(data.items);
  return {
    cliente_id: data.cliente_id,
    medio_pago: data.medio_pago,
    flete: 0, // el flete vive por ítem; este campo global queda en 0
    subtotal_neto: totales.subtotalNeto,
    iva: totales.iva,
    total: totales.total,
  };
}

function toNotaItemRows(
  notaVentaId: string,
  items: z.infer<typeof notaItemSchema>[]
) {
  return items.map((item, index) => ({
    nota_venta_id: notaVentaId,
    sku: item.sku,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    costo: item.costo,
    precio: item.precio,
    flete: item.flete,
    descuento: item.descuento,
    posicion: index,
  }));
}

export async function crearNotaVenta(
  _prevState: NotaVentaFormState,
  formData: FormData
): Promise<NotaVentaFormState> {
  const parsed = parseNotaVentaForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const vendedor = await resolverVendedor(supabase);
  const { data: nota, error } = await supabase
    .from("notas_venta")
    .insert({ ...toNotaVentaRow(parsed.data), vendedor })
    .select("id")
    .single();

  if (error || !nota) {
    console.error("Error al crear nota de venta:", error?.message);
    return { error: "No se pudo guardar la nota de venta. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("nota_venta_items")
    .insert(toNotaItemRows(nota.id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    await supabase.from("notas_venta").delete().eq("id", nota.id);
    return { error: "No se pudo guardar la nota de venta. Intenta nuevamente." };
  }

  revalidatePath("/notas-venta");
  redirect(`/notas-venta/${nota.id}`);
}

export async function actualizarNotaVenta(
  id: string,
  _prevState: NotaVentaFormState,
  formData: FormData
): Promise<NotaVentaFormState> {
  const parsed = parseNotaVentaForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();

  // .eq("estado") hace la transición atómica: si otra pestaña la pagó o
  // anuló, el update no afecta filas y se rechaza.
  const { data: updated, error: updateError } = await supabase
    .from("notas_venta")
    .update(toNotaVentaRow(parsed.data))
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (updateError) {
    console.error("Error al actualizar nota de venta:", updateError.message);
    return {
      error: "No se pudo actualizar la nota de venta. Intenta nuevamente.",
    };
  }
  if (!updated?.length) {
    return { error: "Solo se pueden editar notas pendientes" };
  }

  const { error: deleteError } = await supabase
    .from("nota_venta_items")
    .delete()
    .eq("nota_venta_id", id);

  if (deleteError) {
    console.error("Error al reemplazar ítems:", deleteError.message);
    return { error: "No se pudieron actualizar los ítems. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("nota_venta_items")
    .insert(toNotaItemRows(id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    return { error: "No se pudieron actualizar los ítems. Intenta nuevamente." };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  redirect(`/notas-venta/${id}`);
}
```

- [ ] **Step 2: Crear `nota-venta-form.tsx`**

Adaptación de `cotizacion-form.tsx` (misma tabla de ítems, mismos helpers): SIN campo fecha de validez, SIN textarea de notas, tipos/action de nota. Contenido completo:

```tsx
"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import { formatCLP } from "@/lib/money";
import { calcularTotales, descuentoUnitario } from "@/lib/totals";
import { MEDIOS_PAGO } from "@/lib/medio-pago";
import type { NotaVentaFormState } from "./actions";

type ClienteOption = { id: string; nombre: string; rut: string | null };

type ProductoOption = {
  id: string;
  sku: string;
  descripcion: string;
  costo: number;
  precio: number;
};

export type NotaVentaItemInput = {
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precio: number;
  // Flete unitario: interno, se suma al precio para el cliente.
  flete: number;
  // Descuento porcentual (0–100) sobre el precio.
  descuento: number;
};

type NotaVentaFormProps = {
  clientes: ClienteOption[];
  productos: ProductoOption[];
  nota?: {
    cliente_id: string;
    medio_pago: string[] | null;
    items: NotaVentaItemInput[];
  };
  action: (
    prevState: NotaVentaFormState,
    formData: FormData
  ) => Promise<NotaVentaFormState>;
};

const itemInputClass =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// uid: clave estable de React por fila; se descarta al serializar al servidor.
// Los campos numéricos admiten "" para poder dejarse vacíos mientras se editan
// (si no, el 0 quedaría "pegado" e imposible de borrar). Se interpretan como 0
// al calcular totales y al serializar.
type CampoNumerico = number | "";
type ItemRow = {
  uid: string;
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: CampoNumerico;
  costo: CampoNumerico;
  precio: CampoNumerico;
  flete: CampoNumerico;
  descuento: CampoNumerico;
};

const aNumero = (v: CampoNumerico) => (v === "" ? 0 : v);

// Parsea lo que el usuario escribe: vacío se mantiene vacío; texto inválido
// también; números se truncan a entero ≥ 0.
function parseEntero(valor: string): CampoNumerico {
  if (valor === "") return "";
  const n = Math.trunc(Number(valor));
  return Number.isNaN(n) ? "" : Math.max(0, n);
}

// Porcentaje de descuento: entero entre 0 y 100.
function parsePorcentaje(valor: string): CampoNumerico {
  if (valor === "") return "";
  const n = Math.trunc(Number(valor));
  return Number.isNaN(n) ? "" : Math.min(100, Math.max(0, n));
}

export function NotaVentaForm({
  clientes,
  productos,
  nota,
  action,
}: NotaVentaFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [items, setItems] = useState<ItemRow[]>(() =>
    (nota?.items ?? []).map((item, i) => ({ ...item, uid: `init-${i}` }))
  );
  const totales = calcularTotales(
    items.map((i) => ({
      cantidad: aNumero(i.cantidad),
      precio: aNumero(i.precio),
      flete: aNumero(i.flete),
      descuento: aNumero(i.descuento),
    }))
  );

  function agregarProducto(producto: ProductoOption) {
    setItems((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        producto_id: producto.id,
        sku: producto.sku,
        descripcion: producto.descripcion,
        cantidad: 1,
        costo: producto.costo,
        precio: producto.precio,
        flete: 0,
        descuento: 0,
      },
    ]);
  }

  function agregarItemLibre() {
    setItems((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        producto_id: null,
        sku: "",
        descripcion: "",
        cantidad: 1,
        costo: "",
        precio: "",
        flete: "",
        descuento: "",
      },
    ]);
  }

  function actualizarItem(
    index: number,
    cambios: Partial<Omit<ItemRow, "uid">>
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...cambios } : item))
    );
  }

  function eliminarItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.map((item) => ({
            producto_id: item.producto_id,
            sku: item.sku,
            descripcion: item.descripcion,
            cantidad: aNumero(item.cantidad),
            costo: aNumero(item.costo),
            precio: aNumero(item.precio),
            flete: aNumero(item.flete),
            descuento: aNumero(item.descuento),
          }))
        )}
      />

      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cliente_id" className={labelClass}>
            Cliente *
          </label>
          <select
            id="cliente_id"
            name="cliente_id"
            required
            defaultValue={nota?.cliente_id ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Selecciona un cliente…
            </option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
                {cliente.rut ? ` (${cliente.rut})` : ""}
              </option>
            ))}
          </select>
          <FieldErrors errors={state.fieldErrors?.cliente_id} />
        </div>

        <div className="sm:col-span-2">
          <span className={labelClass}>Medios de pago *</span>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
            {MEDIOS_PAGO.map((m) => (
              <label
                key={m.valor}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="medio_pago"
                  value={m.valor}
                  defaultChecked={nota?.medio_pago?.includes(m.valor) ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {m.etiqueta}
              </label>
            ))}
          </div>
          <FieldErrors errors={state.fieldErrors?.medio_pago} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Ítems</h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              const producto = productos.find((p) => p.id === e.target.value);
              if (producto) agregarProducto(producto);
            }}
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Agregar producto del catálogo…</option>
            {productos.map((producto) => (
              <option key={producto.id} value={producto.id}>
                {producto.sku} — {producto.descripcion}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={agregarItemLibre}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Agregar ítem libre
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-32 px-3 py-3">SKU</th>
                <th className="min-w-56 px-3 py-3">Descripción</th>
                <th className="w-24 px-3 py-3">Cantidad</th>
                <th className="w-28 px-3 py-3">Costo</th>
                <th className="w-28 px-3 py-3">Precio</th>
                <th className="w-28 px-3 py-3">Flete unit.</th>
                <th className="w-24 px-3 py-3">Desc. %</th>
                <th className="w-32 px-3 py-3 text-right">Total línea</th>
                <th className="w-12 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Agrega productos del catálogo o ítems libres.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const esLibre = item.producto_id === null;
                  return (
                    <tr key={item.uid} className="text-slate-700">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.sku}
                          readOnly={!esLibre}
                          aria-label="SKU"
                          onChange={(e) =>
                            actualizarItem(index, { sku: e.target.value })
                          }
                          className={`${itemInputClass} ${esLibre ? "" : "bg-slate-50 text-slate-500"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.descripcion}
                          readOnly={!esLibre}
                          aria-label="Descripción"
                          onChange={(e) =>
                            actualizarItem(index, {
                              descripcion: e.target.value,
                            })
                          }
                          className={`${itemInputClass} ${esLibre ? "" : "bg-slate-50 text-slate-500"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.cantidad}
                          aria-label="Cantidad"
                          onChange={(e) =>
                            actualizarItem(index, {
                              cantidad: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.costo}
                          aria-label="Costo"
                          onChange={(e) =>
                            actualizarItem(index, {
                              costo: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.precio}
                          aria-label="Precio"
                          onChange={(e) =>
                            actualizarItem(index, {
                              precio: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.flete}
                          aria-label="Flete unitario"
                          onChange={(e) =>
                            actualizarItem(index, {
                              flete: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={item.descuento}
                          aria-label="Descuento porcentual"
                          onChange={(e) =>
                            actualizarItem(index, {
                              descuento: parsePorcentaje(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {formatCLP(
                          aNumero(item.cantidad) *
                            (aNumero(item.precio) -
                              descuentoUnitario(
                                aNumero(item.precio),
                                aNumero(item.descuento)
                              ) +
                              aNumero(item.flete))
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarItem(index)}
                          aria-label="Eliminar ítem"
                          title="Eliminar ítem"
                          className="text-sm font-medium text-red-600 hover:text-red-800"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <FieldErrors errors={state.fieldErrors?.items} />
      </div>

      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <p className="text-xs text-slate-500">
          El flete unitario se suma al precio de cada ítem. El cliente ve el
          precio final sin una línea de flete separada.
        </p>
      </div>

      <div className="max-w-xs rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dl className="flex flex-col gap-2">
          {totales.descuento > 0 && (
            <>
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal bruto</dt>
                <dd>{formatCLP(totales.subtotalBruto)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Descuento</dt>
                <dd>-{formatCLP(totales.descuento)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal neto</dt>
            <dd>{formatCLP(totales.subtotalNeto)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>IVA (19%)</dt>
            <dd>{formatCLP(totales.iva)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <dt>Total</dt>
            <dd>{formatCLP(totales.total)}</dd>
          </div>
        </dl>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar nota de venta"}
        </button>
        <Link
          href="/notas-venta"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Crear `nueva/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { crearNotaVenta } from "../actions";
import { NotaVentaForm } from "../nota-venta-form";

export default async function NuevaNotaVentaPage() {
  const supabase = await createClient();

  const [{ data: clientes }, { data: productos }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, rut").order("nombre"),
    supabase
      .from("productos")
      .select("id, sku, descripcion, costo, precio")
      .eq("activo", true)
      .order("sku"),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Nueva nota de venta
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <NotaVentaForm
          clientes={clientes ?? []}
          productos={productos ?? []}
          action={crearNotaVenta}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Botón en la lista (`notas-venta/page.tsx`)**

En el `<div className="mb-6 flex items-center justify-between">`, después del `<h1>`, agregar (e importar `Link` de `next/link` arriba):

```tsx
<Link
  href="/notas-venta/nueva"
  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
>
  Nueva nota de venta
</Link>
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sin errores; vitest existentes pasan.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/notas-venta"
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Notas de venta: creación manual con detalle (form + acción crear)"
```

---

### Task 4: Editar nota pendiente + vendedor en detalle

**Files:**
- Create: `src/app/(app)/notas-venta/[id]/editar/page.tsx`
- Modify: `src/app/(app)/notas-venta/[id]/page.tsx` (botón Editar, mostrar vendedor, select con vendedor)

**Interfaces:**
- Consumes: `actualizarNotaVenta` y `NotaVentaForm`/`NotaVentaItemInput` (Task 3).

- [ ] **Step 1: Crear `[id]/editar/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarNotaVenta } from "../../actions";
import { NotaVentaForm, type NotaVentaItemInput } from "../../nota-venta-form";

type NotaEditable = {
  id: string;
  folio: string;
  estado: string;
  cliente_id: string;
  medio_pago: string[] | null;
  nota_venta_items: (Omit<NotaVentaItemInput, "producto_id"> & {
    posicion: number;
  })[];
};

export default async function EditarNotaVentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { data: clientes }, { data: productos }] =
    await Promise.all([
      supabase
        .from("notas_venta")
        .select(
          `id, folio, estado, cliente_id, medio_pago,
           nota_venta_items(sku, descripcion, cantidad, costo, precio, flete, descuento, posicion)`
        )
        .eq("id", id)
        .single(),
      supabase.from("clientes").select("id, nombre, rut").order("nombre"),
      supabase
        .from("productos")
        .select("id, sku, descripcion, costo, precio")
        .eq("activo", true)
        .order("sku"),
    ]);

  if (!data) {
    notFound();
  }

  const nota = data as unknown as NotaEditable;

  if (nota.estado !== "pendiente") {
    redirect(`/notas-venta/${id}`);
  }

  // nota_venta_items no guarda producto_id: todas las filas se editan libres.
  const items: NotaVentaItemInput[] = [...nota.nota_venta_items]
    .sort((a, b) => a.posicion - b.posicion)
    .map(({ sku, descripcion, cantidad, costo, precio, flete, descuento }) => ({
      producto_id: null,
      sku,
      descripcion,
      cantidad,
      costo,
      precio,
      flete,
      descuento,
    }));

  const action = actualizarNotaVenta.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Editar nota de venta {nota.folio}
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <NotaVentaForm
          clientes={clientes ?? []}
          productos={productos ?? []}
          nota={{
            cliente_id: nota.cliente_id,
            medio_pago: nota.medio_pago,
            items,
          }}
          action={action}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Botón Editar + vendedor en `[id]/page.tsx`**

1. Agregar `vendedor` al type `NotaVentaDetalle` (`vendedor: string | null;` junto a `medio_pago`) y al select del query (línea 66): `...folio, estado, flete, medio_pago, vendedor, subtotal_neto...`.
2. En el header, junto a `<AccionesNota …>`, envolver en un contenedor y agregar el link Editar cuando está pendiente. Reemplazar la línea `<AccionesNota notaVentaId={nota.id} estado={nota.estado} />` por:

```tsx
<div className="flex flex-wrap items-center gap-3">
  {nota.estado === "pendiente" && (
    <Link
      href={`/notas-venta/${nota.id}/editar`}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
    >
      Editar
    </Link>
  )}
  <AccionesNota notaVentaId={nota.id} estado={nota.estado} />
</div>
```

3. En la tarjeta "Origen", antes de la fila "Creada", agregar:

```tsx
{nota.vendedor && (
  <div className="flex justify-between">
    <dt>Vendedor</dt>
    <dd className="font-medium text-slate-900">{nota.vendedor}</dd>
  </div>
)}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/notas-venta"
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Notas de venta: editar mientras pendiente + vendedor en detalle"
```

---

### Task 5: Acción "Pasar a nota de venta" desde la cotización

**Files:**
- Modify: `src/app/(app)/cotizaciones/actions.ts` (nueva action al final)
- Modify: `src/app/(app)/cotizaciones/[id]/page.tsx` (botón/link en header)

**Interfaces:**
- Consumes: `resolverVendedor` (Task 2).
- Produces: `pasarANotaVenta(id: string): Promise<void>` — patrón de `duplicarCotizacion` (form action; en error hace console.error y retorna; en éxito redirect).

- [ ] **Step 1: Agregar `pasarANotaVenta` a `cotizaciones/actions.ts`**

```ts
// Crea una nota de venta a partir de la cotización (cualquier estado), con
// cliente, ítems, medios de pago y vendedor copiados. Máximo una nota por
// cotización (unique en notas_venta.cotizacion_id).
export async function pasarANotaVenta(id: string): Promise<void> {
  const supabase = await createClient();

  const { data: cotizacion, error: readError } = await supabase
    .from("cotizaciones")
    .select("cliente_id, flete, medio_pago, vendedor, subtotal_neto, iva, total")
    .eq("id", id)
    .single();

  if (readError || !cotizacion) {
    console.error("Error al leer cotización a pasar:", readError?.message);
    return;
  }

  const { data: items, error: itemsReadError } = await supabase
    .from("cotizacion_items")
    .select("sku, descripcion, cantidad, costo, precio, flete, descuento")
    .eq("cotizacion_id", id)
    .order("posicion");

  if (itemsReadError || !items?.length) {
    console.error(
      "Error al leer ítems a pasar (o cotización sin ítems):",
      itemsReadError?.message
    );
    return;
  }

  const vendedor = cotizacion.vendedor ?? (await resolverVendedor(supabase));
  const { data: nota, error: insertError } = await supabase
    .from("notas_venta")
    .insert({
      cotizacion_id: id,
      cliente_id: cotizacion.cliente_id,
      flete: cotizacion.flete,
      medio_pago: cotizacion.medio_pago,
      vendedor,
      subtotal_neto: cotizacion.subtotal_neto,
      iva: cotizacion.iva,
      total: cotizacion.total,
    })
    .select("id")
    .single();

  if (insertError || !nota) {
    // 23505 = ya existe nota para esta cotización (carrera con otra pestaña).
    console.error("Error al crear nota desde cotización:", insertError?.message);
    return;
  }

  const { error: itemsError } = await supabase.from("nota_venta_items").insert(
    items.map((item, index) => ({
      nota_venta_id: nota.id,
      sku: item.sku,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      costo: item.costo,
      precio: item.precio,
      flete: item.flete,
      descuento: item.descuento,
      posicion: index,
    }))
  );

  if (itemsError) {
    console.error("Error al copiar ítems a la nota:", itemsError.message);
    await supabase.from("notas_venta").delete().eq("id", nota.id);
    return;
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/cotizaciones/${id}`);
  redirect(`/notas-venta/${nota.id}`);
}
```

- [ ] **Step 2: Botón en `cotizaciones/[id]/page.tsx`**

1. Importar la action: `import { duplicarCotizacion, pasarANotaVenta } from "../actions";`
2. Agregar el embed al select del query (la FK `notas_venta.cotizacion_id` es unique → PostgREST lo devuelve como objeto, pero normalizar por si llega array): agregar `notas_venta(id, folio)` al final del select string.
3. Al type `CotizacionDetalle` agregar:

```ts
notas_venta: { id: string; folio: string } | { id: string; folio: string }[] | null;
```

4. Después de `const duplicar = duplicarCotizacion.bind(null, cotizacion.id);` agregar:

```ts
const pasar = pasarANotaVenta.bind(null, cotizacion.id);
const notaExistente = Array.isArray(cotizacion.notas_venta)
  ? (cotizacion.notas_venta[0] ?? null)
  : cotizacion.notas_venta;
```

5. En el header de acciones, después del `<form action={duplicar}>…</form>`, agregar:

```tsx
{notaExistente ? (
  <Link
    href={`/notas-venta/${notaExistente.id}`}
    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-slate-50"
  >
    Nota {notaExistente.folio}
  </Link>
) : (
  <form action={pasar}>
    <button
      type="submit"
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
    >
      Pasar a nota de venta
    </button>
  </form>
)}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/cotizaciones"
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Cotizaciones: acción 'Pasar a nota de venta' (cualquier estado, una nota por cotización)"
```

---

### Task 6: Quitar la nota auto-creada del correo de aviso y la respuesta pública

**Files:**
- Modify: `src/app/cotizacion/[token]/responder/route.ts`
- Modify: `src/lib/email/aviso-respuesta-email.tsx`

**Interfaces:**
- Consumes: RPC `responder_cotizacion` (post-009 devuelve `nota_venta_folio` null; el route deja de usarlo).
- La página pública (`Aceptada` en `page.tsx`) ya no menciona la nota — no tocar.

- [ ] **Step 1: `responder/route.ts`**

1. En `enviarAvisoInterno`: quitar el parámetro `notaVentaFolio: string | null` (firma queda `(supabase, token, aceptada, motivo)`), quitar `notaVentaFolio` del llamado a `AvisoRespuestaEmail`, y el asunto pasa a:

```ts
const asunto = aceptada
  ? `Cotización ${cot.folio} ACEPTADA`
  : `Cotización ${cot.folio} RECHAZADA`;
```

2. En `POST`: actualizar el llamado `enviarAvisoInterno(supabase, token, fila.resultado === "aceptada", fila.resultado === "rechazada" ? (parsed.data.motivo ?? null) : null)` y quitar `nota_venta_folio` del JSON de respuesta final:

```ts
return NextResponse.json({ resultado: fila.resultado });
```

(El type inline de `fila` puede conservar `nota_venta_folio` — el RPC sigue devolviendo la columna.)

3. Verificar que `responder-botones.tsx` no lee `nota_venta_folio` de la respuesta: `grep -n "nota_venta_folio" src/app/cotizacion/[token]/responder-botones.tsx` debe no arrojar nada. Si arroja, quitar ese uso también.

- [ ] **Step 2: `aviso-respuesta-email.tsx`**

Quitar la prop `notaVentaFolio` (del type de props, del destructuring y del bloque de las líneas ~79-85 que dice "Se creó automáticamente la nota de venta"). El link a `/notas-venta` (`linkNotasVenta`) se conserva como acceso directo.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores (si `linkNotasVenta` quedara sin uso, quitarlo también de props y route).

- [ ] **Step 4: Commit**

```bash
git add "src/app/cotizacion/[token]/responder/route.ts" src/lib/email/aviso-respuesta-email.tsx
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Aceptar cotización ya no anuncia nota de venta (no se crea automáticamente)"
```

---

### Task 7: Aplicar migración, deploy y verificación live

**Files:**
- No code changes. Ejecución contra Supabase prod y Vercel.

**Interfaces:**
- Consumes: `supabase/migrations/009_notas_venta_independientes.sql` (Task 1); todo el código de Tasks 2-6 commiteado.

- [ ] **Step 1: Aplicar migración 009 a Supabase prod**

Desde la raíz del proyecto (el password está en `.env.local` / memoria del proyecto — NO commitearlo):

```bash
node -e "
const fs = require('fs');
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-sa-east-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.iiqfbedwoogadtrmrqfq',
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
c.connect()
  .then(() => c.query(fs.readFileSync('supabase/migrations/009_notas_venta_independientes.sql', 'utf8')))
  .then(() => { console.log('009 aplicada OK'); return c.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
"
```

(exportar `DB_PASSWORD` antes, o inyectar con `--env-file` si se agrega a `.env.local`).
Expected: `009 aplicada OK`.

- [ ] **Step 2: Verificar esquema y RPC en prod**

```bash
node -e "
const { Client } = require('pg');
const c = new Client({ host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432, user: 'postgres.iiqfbedwoogadtrmrqfq', password: process.env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query(\`
    select
      (select is_nullable from information_schema.columns where table_name='notas_venta' and column_name='cotizacion_id') as cot_nullable,
      (select count(*) from information_schema.columns where table_name='notas_venta' and column_name='vendedor') as tiene_vendedor,
      (select prosrc not like '%insert into notas_venta%' from pg_proc where proname='responder_cotizacion') as rpc_sin_insert
  \`))
  .then((r) => { console.log(r.rows[0]); return c.end(); });
"
```

Expected: `{ cot_nullable: 'YES', tiene_vendedor: '1', rpc_sin_insert: true }`.

- [ ] **Step 3: Suite completa local**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: todo verde (el build valida las rutas nuevas).

- [ ] **Step 4: Push y deploy manual**

```bash
git push origin main
vercel --prod --yes
```

Expected: deploy Ready.

- [ ] **Step 5: Verificación live (www.tulbless.cl)**

Con sesión (o vía screenshot `chromium-browser --headless=new --screenshot`):
1. `/notas-venta` muestra botón "Nueva nota de venta"; crear una nota de prueba con 1 ítem libre (cantidad 2, precio 1000, flete 100, descuento 10%) → detalle muestra totales correctos (subtotal neto 2180) y vendedor.
2. Editarla (cambiar cantidad) → guarda; marcar pagada → botón Editar desaparece.
3. En una cotización sin nota: botón "Pasar a nota de venta" → crea nota con los ítems; el botón pasa a "Nota NV-xxxx".
4. Eliminar la nota de prueba manual.
5. Aceptar una cotización de prueba vía link público → queda aceptada, NO aparece nota nueva en `/notas-venta`.

- [ ] **Step 6: Actualizar memoria de proyecto**

Actualizar `ferre-pooley-estado.md` (memoria): notas de venta independientes en prod, migración 009 aplicada, RPC ya no crea notas.

---

## Self-Review

- **Spec coverage:** migración/nullable/vendedor/RPC → Task 1+7; crear manual → Task 3; editar pendiente (todas) → Task 4 (+`actualizarNotaVenta` en Task 3); pasar a nota desde cualquier estado → Task 5; limpiar correo/página pública → Task 6; conciliación sin cambios → no requiere task. ✓
- **Placeholders:** ninguno; todo el código está inline. ✓
- **Type consistency:** `NotaVentaFormState`/`NotaVentaForm`/`NotaVentaItemInput`/`crearNotaVenta`/`actualizarNotaVenta`/`pasarANotaVenta` usados con los mismos nombres en Tasks 3-5; `resolverVendedor` definido en Task 2 y consumido en 3 y 5. ✓
