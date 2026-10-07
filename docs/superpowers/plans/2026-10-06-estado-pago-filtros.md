# Estado de pago conectado, saldo al pie y filtros — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar el estado de pago desde la lista y desde la nota (creando/borrando abonos), mostrar cobrado y falta por cobrar al pie de Notas de venta, y sumar filtros a Compras, Ventas y Notas de venta.

**Architecture:** El estado sigue derivado de `pagos_nota_venta` por el trigger de la migración 023. Dos server actions nuevas crean o borran abonos; un componente `EstadoPagoMenu` las usa en lista y detalle. Las reglas de cálculo viven como funciones puras en `src/lib/` con tests; los filtros son client-side como el resto.

**Tech Stack:** Next.js (App Router, server actions), Supabase, Zod, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-06-estado-pago-filtros-design.md`

## Global Constraints

- AGENTS.md: este Next.js tiene cambios incompatibles; ante duda leer `node_modules/next/dist/docs/`. Solo se usan patrones ya presentes en el repo.
- Sin migraciones SQL.
- Total bruto vs margen neto nunca se dividen entre sí.
- Las anuladas no suman a ningún total.
- Fechas: `YYYY-MM-DD`, hoy con `hoyChile()` de `@/lib/fecha`.
- Commits con autoría de Elvis y sin trailer de Co-Author.
- Textos de UI en español.

## Review Focus

- Nota con abonos parciales: "marcar pagada" cubre solo el saldo restante (test en `montoParaSaldar`).
- Nota pagada de más (saldo a favor): "volver a pendiente" borra los abonos necesarios hasta quedar con saldo, no solo el último (test en `abonosParaReabrir`).
- Nota con total 0: no ofrece marcar pagada.
- Notas anuladas: sin menú y sin sumar al pie.
- Compra sin formas de pago cargadas: no cuenta como "pagada" ni como "con deuda", solo "sin cargar".
- Nota de crédito: no entra en filtros de cobro de Ventas.

## Estructura de archivos

- Modify `src/lib/cobros.ts` + `src/lib/cobros.test.ts`: `montoParaSaldar`, `abonosParaReabrir`, `resumenPagoNota`, `estadoCobroFactura`, vencido en `totalesListadoNotas`.
- Modify `src/lib/forma-pago-compra.ts` + `src/lib/forma-pago-compra.test.ts`: `estadoPagoCompra`, `compraVencida`.
- Create `src/components/filtros.tsx`: `AtajosMes` y `RangoMonto` compartidos.
- Modify `src/app/(app)/notas-venta/actions.ts`: `marcarNotaPagada`, `volverNotaAPendiente`.
- Create `src/app/(app)/notas-venta/estado-pago-menu.tsx`.
- Modify `notas-venta/page.tsx`, `notas-venta-tabla.tsx`, `[id]/page.tsx`.
- Modify `cotizaciones/page.tsx`, `cotizaciones-tabla.tsx`.
- Modify `compras/compras-tabla.tsx`, `ventas/page.tsx`, `ventas/ventas-tabla.tsx`.

---

### Task 1: Funciones puras de cobros

**Files:**
- Modify: `src/lib/cobros.ts`
- Test: `src/lib/cobros.test.ts`

**Interfaces:**
- Produces:
  - `montoParaSaldar(total: number, cobros: Cobro[]): number`
  - `abonosParaReabrir(total: number, cobrosRecientesPrimero: Cobro[]): Cobro[]`
  - `resumenPagoNota(n: { estado: string; total: number; cobrado: number }): { texto: string; tono: "ok" | "aviso" | "neutro" }`
  - `estadoCobroFactura(v: { tipo_doc: number; vencimiento: string | null; nota: { estado: string } | null }, hoy: string): "cobrada" | "con_saldo" | "vencida" | "sin_nota" | "no_aplica"`
  - `FilaListado.vencimiento?: string | null`, `TotalesListado.vencido: number`, `totalesListadoNotas(filas, hoy?: string)`

- [ ] **Step 1: Escribir los tests que fallan** (agregar al final de `src/lib/cobros.test.ts`; sumar los nombres al import de `./cobros`)

```ts
describe("montoParaSaldar", () => {
  it("sin abonos es el total", () => {
    expect(montoParaSaldar(100000, [])).toBe(100000);
  });
  it("con abonos parciales es solo lo que falta", () => {
    expect(montoParaSaldar(100000, [cobro("2026-06-10", 30000)])).toBe(70000);
  });
  it("saldo a favor o nota saldada devuelve 0, nunca negativo", () => {
    expect(montoParaSaldar(100000, [cobro("2026-06-10", 120000)])).toBe(0);
    expect(montoParaSaldar(100000, [cobro("2026-06-10", 100000)])).toBe(0);
  });
  it("total 0 devuelve 0", () => {
    expect(montoParaSaldar(0, [])).toBe(0);
  });
});

describe("abonosParaReabrir", () => {
  it("devuelve el último abono si con eso queda saldo", () => {
    const cs = [cobro("2026-07-05", 20000, "b"), cobro("2026-06-10", 80000, "a")];
    expect(abonosParaReabrir(100000, cs).map((c) => c.id)).toEqual(["b"]);
  });
  it("pagada de más: borra los abonos necesarios hasta dejar saldo", () => {
    const cs = [
      cobro("2026-07-05", 60000, "c"),
      cobro("2026-06-20", 60000, "b"),
      cobro("2026-06-10", 60000, "a"),
    ];
    // 180.000 cobrados sobre 100.000: sacar c deja 120.000 (aún pagada),
    // sacar c y b deja 60.000 (pendiente).
    expect(abonosParaReabrir(100000, cs).map((c) => c.id)).toEqual(["c", "b"]);
  });
  it("sin abonos o ya con saldo no borra nada", () => {
    expect(abonosParaReabrir(100000, [])).toEqual([]);
    expect(abonosParaReabrir(100000, [cobro("2026-06-10", 30000)])).toEqual([]);
  });
});

describe("resumenPagoNota", () => {
  it("anulada, pagada y con saldo", () => {
    expect(resumenPagoNota({ estado: "anulada", total: 1000, cobrado: 0 })).toEqual({ texto: "Anulada", tono: "neutro" });
    expect(resumenPagoNota({ estado: "pagada", total: 1000, cobrado: 1000 })).toEqual({ texto: "Pagada", tono: "ok" });
    expect(resumenPagoNota({ estado: "pendiente", total: 1000, cobrado: 400 })).toEqual({ texto: "Saldo $600", tono: "aviso" });
  });
});

describe("estadoCobroFactura", () => {
  const hoy = "2026-07-10";
  it("nota de crédito no aplica", () => {
    expect(estadoCobroFactura({ tipo_doc: 61, vencimiento: null, nota: { estado: "pendiente" } }, hoy)).toBe("no_aplica");
  });
  it("sin nota vinculada", () => {
    expect(estadoCobroFactura({ tipo_doc: 33, vencimiento: "2026-07-01", nota: null }, hoy)).toBe("sin_nota");
  });
  it("nota pagada = cobrada; pendiente vencida o no", () => {
    expect(estadoCobroFactura({ tipo_doc: 33, vencimiento: "2026-07-01", nota: { estado: "pagada" } }, hoy)).toBe("cobrada");
    expect(estadoCobroFactura({ tipo_doc: 33, vencimiento: "2026-07-01", nota: { estado: "pendiente" } }, hoy)).toBe("vencida");
    expect(estadoCobroFactura({ tipo_doc: 33, vencimiento: "2026-07-20", nota: { estado: "pendiente" } }, hoy)).toBe("con_saldo");
    expect(estadoCobroFactura({ tipo_doc: 33, vencimiento: null, nota: { estado: "pendiente" } }, hoy)).toBe("con_saldo");
  });
  it("nota anulada no aplica", () => {
    expect(estadoCobroFactura({ tipo_doc: 33, vencimiento: null, nota: { estado: "anulada" } }, hoy)).toBe("no_aplica");
  });
});

describe("totalesListadoNotas vencido", () => {
  it("suma el saldo de las vencidas y excluye anuladas y saldadas", () => {
    const filas: FilaListado[] = [
      { total: 100000, venta: 80000, costo: 60000, cobrado: 40000, anulada: false, vencimiento: "2026-07-01" },
      { total: 50000, venta: 40000, costo: 30000, cobrado: 50000, anulada: false, vencimiento: "2026-07-01" },
      { total: 70000, venta: 50000, costo: 40000, cobrado: 0, anulada: true, vencimiento: "2026-07-01" },
      { total: 30000, venta: 20000, costo: 10000, cobrado: 0, anulada: false, vencimiento: "2026-08-01" },
    ];
    const t = totalesListadoNotas(filas, "2026-07-10");
    expect(t.vencido).toBe(60000);
    expect(t.saldo).toBe(90000);
    expect(t.cobrado).toBe(90000);
  });
  it("sin `hoy` el vencido es 0", () => {
    const f: FilaListado = { total: 100, venta: 80, costo: 60, cobrado: 0, anulada: false, vencimiento: "2020-01-01" };
    expect(totalesListadoNotas([f]).vencido).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/cobros.test.ts`
Expected: FAIL (funciones no exportadas).

- [ ] **Step 3: Implementar en `src/lib/cobros.ts`**

Agregar después de `saldo`:

```ts
// Lo que hay que abonar para dejar la nota saldada. Nunca negativo: con saldo
// a favor o nota en cero no hay nada que abonar.
export function montoParaSaldar(total: number, cobros: Cobro[]): number {
  return Math.max(saldo(total, cobros), 0);
}

// Abonos a borrar para que una nota pagada vuelva a tener saldo. Recibe los
// cobros del más reciente al más antiguo y saca desde el último hasta que lo
// cobrado quede bajo el total: si se pagó de más, borrar solo el último puede
// dejarla pagada y el botón "volver a pendiente" no haría nada.
export function abonosParaReabrir(total: number, recientesPrimero: Cobro[]): Cobro[] {
  let restante = cobrado(recientesPrimero);
  const borrar: Cobro[] = [];
  for (const c of recientesPrimero) {
    if (restante < total) break;
    borrar.push(c);
    restante -= c.monto;
  }
  return borrar;
}

// Texto corto del estado de pago de una nota, para mostrarlo en otras pantallas
// (cotizaciones) sin recalcular en cada una.
export function resumenPagoNota(n: {
  estado: string;
  total: number;
  cobrado: number;
}): { texto: string; tono: "ok" | "aviso" | "neutro" } {
  if (n.estado === "anulada") return { texto: "Anulada", tono: "neutro" };
  if (n.estado === "pagada") return { texto: "Pagada", tono: "ok" };
  const pendiente = Math.max(n.total - n.cobrado, 0);
  return { texto: `Saldo ${formatCLP(pendiente)}`, tono: "aviso" };
}

export type EstadoCobroFactura =
  | "cobrada"
  | "con_saldo"
  | "vencida"
  | "sin_nota"
  | "no_aplica";

// Estado de cobro de una factura según la nota de venta vinculada. Las notas
// de crédito y las facturas de notas anuladas no son plata que se espere.
export function estadoCobroFactura(
  v: { tipo_doc: number; vencimiento: string | null; nota: { estado: string } | null },
  hoy: string
): EstadoCobroFactura {
  if (v.tipo_doc === 56 || v.tipo_doc === 61) return "no_aplica";
  if (!v.nota) return "sin_nota";
  if (v.nota.estado === "anulada") return "no_aplica";
  if (v.nota.estado === "pagada") return "cobrada";
  if (v.vencimiento && v.vencimiento < hoy) return "vencida";
  return "con_saldo";
}
```

Agregar `import { formatCLP } from "./money";` al inicio (verificar que `src/lib/money.ts` exporta `formatCLP`; lo usa `notas-venta-tabla.tsx` como `@/lib/money`). Extender los tipos y la función:

```ts
export type FilaListado = {
  total: number;
  venta: number;
  costo: number;
  cobrado: number;
  anulada: boolean;
  // Vencimiento de la nota (de su factura); null si no tiene factura.
  vencimiento?: string | null;
};

export type TotalesListado = {
  // ...campos existentes...
  vencido: number; // saldo pendiente de las notas ya vencidas
};
```

En `totalesListadoNotas(filas: FilaListado[], hoy?: string)`: inicializar `vencido: 0` y, dentro del loop tras `r.saldo += ...`:

```ts
    const pendiente = f.total - f.cobrado;
    if (hoy && f.vencimiento && f.vencimiento < hoy && pendiente > 0) {
      r.vencido += pendiente;
    }
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run src/lib/cobros.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cobros.ts src/lib/cobros.test.ts
git commit -m "Cobros: monto para saldar, reabrir nota, vencido al pie y estado de cobro de factura"
```

---

### Task 2: Helpers de compras

**Files:**
- Modify: `src/lib/forma-pago-compra.ts`
- Test: `src/lib/forma-pago-compra.test.ts`

**Interfaces:**
- Produces:
  - `estadoPagoCompra(items: FormaPagoItem[], montoTotal: number): "sin_cargar" | "con_deuda" | "pagada"`
  - `compraVencida(items: FormaPagoItem[], fechaEmision: string | null, montoTotal: number, hoy: string): boolean`
  - `vencimientoIso(fechaEmision: string | null, plazoDias: number | null): string | null`

- [ ] **Step 1: Tests que fallan** (agregar al final del archivo de test; importar los nombres)

```ts
describe("estadoPagoCompra", () => {
  it("sin formas cargadas es sin_cargar", () => {
    expect(estadoPagoCompra([], 100000)).toBe("sin_cargar");
  });
  it("crédito sin monto absorbe el total: con_deuda", () => {
    expect(estadoPagoCompra([{ forma: "credito", monto: null, plazo_dias: 30 }], 100000)).toBe("con_deuda");
  });
  it("contado es pagada", () => {
    expect(estadoPagoCompra([{ forma: "contado", monto: null, plazo_dias: null }], 100000)).toBe("pagada");
  });
});

describe("compraVencida", () => {
  const credito = [{ forma: "credito" as const, monto: null, plazo_dias: 30 }];
  it("vencida si emisión + plazo ya pasó y hay deuda", () => {
    expect(compraVencida(credito, "2026-05-01", 100000, "2026-07-10")).toBe(true);
  });
  it("no vencida si el plazo sigue corriendo", () => {
    expect(compraVencida(credito, "2026-07-01", 100000, "2026-07-10")).toBe(false);
  });
  it("sin deuda o sin plazo nunca vence", () => {
    expect(compraVencida([{ forma: "contado", monto: null, plazo_dias: null }], "2026-01-01", 100000, "2026-07-10")).toBe(false);
    expect(compraVencida([{ forma: "credito", monto: null, plazo_dias: null }], "2026-01-01", 100000, "2026-07-10")).toBe(false);
    expect(compraVencida([], "2026-01-01", 100000, "2026-07-10")).toBe(false);
  });
});
```

Nota: si `FORMAS_PAGO_COMPRA` no contiene `"contado"` o `"credito"` como valores exactos, ajustar los literales a los reales leyendo las primeras 40 líneas de `forma-pago-compra.ts` (`esFormaDeuda` = `admitePlazo`).

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/forma-pago-compra.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `forma-pago-compra.ts`, refactorizar `vencimientoDesde` sobre una versión ISO y agregar los helpers:

```ts
// Igual que vencimientoDesde pero en 'AAAA-MM-DD', comparable como texto.
export function vencimientoIso(
  fechaEmision: string | null,
  plazoDias: number | null
): string | null {
  if (!fechaEmision || plazoDias === null) return null;
  const [a, m, d] = fechaEmision.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  const fecha = new Date(Date.UTC(a, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + plazoDias);
  return fecha.toISOString().slice(0, 10);
}

export function estadoPagoCompra(
  items: FormaPagoItem[],
  montoTotal: number
): "sin_cargar" | "con_deuda" | "pagada" {
  const deuda = montoDeuda(items, montoTotal);
  if (deuda === null) return "sin_cargar";
  return deuda > 0 ? "con_deuda" : "pagada";
}

// Vencida = hay deuda y la forma a plazo más temprana ya cumplió su plazo.
// Sin plazo cargado no se sabe cuándo vence, así que no cuenta como vencida.
export function compraVencida(
  items: FormaPagoItem[],
  fechaEmision: string | null,
  montoTotal: number,
  hoy: string
): boolean {
  if ((montoDeuda(items, montoTotal) ?? 0) <= 0) return false;
  let temprano: string | null = null;
  for (const i of items) {
    if (!esFormaDeuda(i.forma)) continue;
    const v = vencimientoIso(fechaEmision, i.plazo_dias);
    if (v && (!temprano || v < temprano)) temprano = v;
  }
  return temprano !== null && temprano < hoy;
}
```

Reescribir `vencimientoDesde` para que use `vencimientoIso` y reformatee a `DD/MM/AAAA` (misma salida que hoy):

```ts
export function vencimientoDesde(fechaEmision: string | null, plazoDias: number | null): string | null {
  const iso = vencimientoIso(fechaEmision, plazoDias);
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 4: Correr tests** (incluye los existentes de `vencimientoDesde`)

Run: `npx vitest run src/lib/forma-pago-compra.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forma-pago-compra.ts src/lib/forma-pago-compra.test.ts
git commit -m "Compras: estado de pago y vencimiento como funciones puras"
```

---

### Task 3: Server actions de estado de pago

**Files:**
- Modify: `src/app/(app)/notas-venta/actions.ts` (después de `eliminarCobro`, ~línea 111)

**Interfaces:**
- Consumes: `montoParaSaldar`, `abonosParaReabrir` (Task 1), `cobroSchema` y `registrarCobro` de este archivo.
- Produces: `marcarNotaPagada(input: unknown): Promise<NotaVentaActionResult>` con input `{ nota_venta_id, fecha, medio_pago? }`; `volverNotaAPendiente(notaVentaId: string): Promise<NotaVentaActionResult>`.

- [ ] **Step 1: Agregar el import**

```ts
import { montoParaSaldar, abonosParaReabrir } from "@/lib/cobros";
```

- [ ] **Step 2: Implementar las dos actions**

```ts
const saldarSchema = z.object({
  nota_venta_id: z.uuid(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha del pago es obligatoria"),
  medio_pago: z.enum(MEDIOS_PAGO_VALORES).nullish(),
});

function revalidarNota(id: string) {
  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  revalidatePath("/cotizaciones");
  revalidatePath("/ventas");
  revalidatePath("/finanzas");
}

// Atajo de "Marcar pagada": registra UN abono por lo que falta. El estado lo
// sigue calculando el trigger (023); así Finanzas y la utilidad percibida
// quedan consistentes con lo que se ve en la lista.
export async function marcarNotaPagada(
  input: unknown
): Promise<NotaVentaActionResult> {
  if (!(await checkPermiso("notas_venta", "escritura"))) return { error: SIN_PERMISO };
  const parsed = saldarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const datos = parsed.data;
  const supabase = await createClient();

  const { data: nota } = await supabase
    .from("notas_venta")
    .select("estado, total, pagos_nota_venta(id, monto, fecha, medio_pago, observacion)")
    .eq("id", datos.nota_venta_id)
    .single();

  if (!nota) return { error: "La nota de venta no existe" };
  if (nota.estado === "anulada") {
    return { error: "No se puede cobrar una nota anulada" };
  }
  const monto = montoParaSaldar(nota.total, nota.pagos_nota_venta ?? []);
  if (monto <= 0) return { error: "La nota no tiene saldo por cobrar" };

  const { error } = await supabase.from("pagos_nota_venta").insert({
    nota_venta_id: datos.nota_venta_id,
    monto,
    fecha: datos.fecha,
    medio_pago: datos.medio_pago ?? null,
    observacion: "Marcada como pagada",
  });
  if (error) {
    console.error("Error al marcar pagada:", error.message);
    return { error: "No se pudo marcar como pagada. Intenta nuevamente." };
  }

  revalidarNota(datos.nota_venta_id);
  return { success: true };
}

// Atajo de "Volver a pendiente": borra los abonos más recientes hasta que la
// nota vuelva a tener saldo (ver abonosParaReabrir). Si se pagó de más, borrar
// solo el último la dejaría pagada.
export async function volverNotaAPendiente(
  notaVentaId: string
): Promise<NotaVentaActionResult> {
  if (!(await checkPermiso("notas_venta", "escritura"))) return { error: SIN_PERMISO };
  const id = z.uuid().safeParse(notaVentaId);
  if (!id.success) return { error: "Nota inválida" };
  const supabase = await createClient();

  const { data: nota } = await supabase
    .from("notas_venta")
    .select("estado, total")
    .eq("id", id.data)
    .single();
  if (!nota) return { error: "La nota de venta no existe" };
  if (nota.estado !== "pagada") {
    return { error: "La nota no está pagada" };
  }

  const { data: pagos } = await supabase
    .from("pagos_nota_venta")
    .select("id, monto, fecha, medio_pago, observacion, created_at")
    .eq("nota_venta_id", id.data)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  const borrar = abonosParaReabrir(nota.total, pagos ?? []);
  if (borrar.length === 0) return { error: "No hay abonos que revertir" };

  const { data: borrados, error } = await supabase
    .from("pagos_nota_venta")
    .delete()
    .in("id", borrar.map((c) => c.id))
    .eq("nota_venta_id", id.data)
    .select("id");
  if (error) {
    console.error("Error al volver a pendiente:", error.message);
    return { error: "No se pudo volver a pendiente. Intenta nuevamente." };
  }
  if (!borrados?.length) return { error: "Los abonos ya no existen" };

  revalidarNota(id.data);
  return { success: true };
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/notas-venta/actions.ts"
git commit -m "Notas de venta: acciones marcar pagada y volver a pendiente"
```

---

### Task 4: Componente EstadoPagoMenu y uso en la nota

**Files:**
- Create: `src/app/(app)/notas-venta/estado-pago-menu.tsx`
- Modify: `src/app/(app)/notas-venta/[id]/page.tsx` (encabezado, línea con `<NotaEstadoBadge estado={nota.estado} />`)

**Interfaces:**
- Consumes: `marcarNotaPagada`, `volverNotaAPendiente` (Task 3), `montoParaSaldar`.
- Produces: `<EstadoPagoMenu notaVentaId estado total cobrado nCobros editable />`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import { hoyChile } from "@/lib/fecha";
import { MEDIOS_PAGO } from "@/lib/medio-pago";
import { NotaEstadoBadge, type NotaVentaEstado } from "./nota-estado-badge";
import { marcarNotaPagada, volverNotaAPendiente } from "./actions";

const badgeCls: Record<NotaVentaEstado, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagada: "bg-green-100 text-green-700",
  anulada: "bg-red-100 text-red-700",
};
const badgeLabel: Record<NotaVentaEstado, string> = {
  pendiente: "Pendiente de pago",
  pagada: "Pagada",
  anulada: "Anulada",
};

// Badge de estado de pago que, con permiso, abre un menú para cambiarlo. No
// edita el estado: crea o borra abonos y deja que el trigger lo recalcule.
export function EstadoPagoMenu({
  notaVentaId,
  estado,
  total,
  cobrado,
  nCobros,
  editable,
}: {
  notaVentaId: string;
  estado: NotaVentaEstado;
  total: number;
  cobrado: number;
  nCobros: number;
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [fecha, setFecha] = useState(hoyChile);
  const [medio, setMedio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const boton = useRef<HTMLButtonElement>(null);

  if (!editable || estado === "anulada") {
    return <NotaEstadoBadge estado={estado} />;
  }

  const falta = Math.max(total - cobrado, 0);

  function alternar() {
    if (!abierto && boton.current) {
      // El menú va en `fixed`: la tabla tiene overflow y recortaría uno absoluto.
      const r = boton.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(8, r.left) });
    }
    setError(null);
    setAbierto(!abierto);
  }

  function marcar() {
    setError(null);
    startTransition(async () => {
      const res = await marcarNotaPagada({
        nota_venta_id: notaVentaId,
        fecha,
        medio_pago: medio || null,
      });
      if (res?.error) setError(res.error);
      else setAbierto(false);
    });
  }

  function volver() {
    const aviso =
      nCobros > 1
        ? `Se eliminarán los últimos abonos hasta dejar la nota con saldo pendiente (hoy hay ${nCobros}). ¿Continuar?`
        : "Se eliminará el abono registrado y la nota volverá a pendiente. ¿Continuar?";
    if (!confirm(aviso)) return;
    setError(null);
    startTransition(async () => {
      const res = await volverNotaAPendiente(notaVentaId);
      if (res?.error) setError(res.error);
      else setAbierto(false);
    });
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title="Cambiar estado de pago"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeCls[estado]}`}
      >
        {badgeLabel[estado]}
        <span aria-hidden>▾</span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg"
          >
            {estado === "pendiente" ? (
              falta > 0 ? (
                <div className="flex flex-col gap-3 text-sm text-slate-700">
                  <p>
                    Se registrará un abono de{" "}
                    <strong>{formatCLP(falta)}</strong>
                    {cobrado > 0 && " (lo que falta)"}.
                  </p>
                  <label className="flex flex-col gap-1 text-xs text-slate-500">
                    Fecha del pago
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-500">
                    Medio de pago
                    <select value={medio} onChange={(e) => setMedio(e.target.value)} className={inputCls}>
                      <option value="">Sin indicar</option>
                      {MEDIOS_PAGO.map((m) => (
                        <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={marcar}
                    disabled={isPending || !fecha}
                    className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isPending ? "Guardando…" : "Marcar pagada"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Esta nota no tiene saldo por cobrar.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-3 text-sm text-slate-700">
                <p>Pagada. Volver a pendiente borra sus abonos más recientes.</p>
                <button
                  type="button"
                  onClick={volver}
                  disabled={isPending}
                  className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {isPending ? "Guardando…" : "Volver a pendiente"}
                </button>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Usarlo en el detalle de la nota**

En `[id]/page.tsx` agregar `import { EstadoPagoMenu } from "../estado-pago-menu";` y `import { cobrado as sumaCobrado } from "@/lib/cobros";`, y reemplazar `<NotaEstadoBadge estado={nota.estado} />` del encabezado por:

```tsx
<EstadoPagoMenu
  notaVentaId={nota.id}
  estado={nota.estado}
  total={nota.total}
  cobrado={sumaCobrado(cobros)}
  nCobros={cobros.length}
  editable={puedeEscribir}
/>
```

(`cobros` ya está definido en esa página y cumple el tipo `Cobro`.) Quitar el import de `NotaEstadoBadge` si queda sin uso.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/notas-venta/estado-pago-menu.tsx" "src/app/(app)/notas-venta/[id]/page.tsx"
git commit -m "Notas de venta: menú de estado de pago en el detalle"
```

---

### Task 5: Filtros compartidos

**Files:**
- Create: `src/components/filtros.tsx`

**Interfaces:**
- Produces:
  - `<AtajosMes desde hasta onChange={(desde, hasta) => void} />`
  - `<RangoMonto min max onChange={(min, max) => void} />` (valores en texto; vacío = sin límite) y `dentroDeRango(valor: number, min: string, max: string): boolean`

- [ ] **Step 1: Crear**

```tsx
"use client";

import { useMemo } from "react";
import { hoyChile, ultimosMeses } from "@/lib/fecha";

const inputCls =
  "w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

// Atajos por mes: el mes en curso y los dos anteriores. Setean desde/hasta, así
// que no son un filtro aparte y se pueden ajustar a mano después.
export function AtajosMes({
  desde,
  hasta,
  onChange,
}: {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}) {
  const meses = useMemo(() => ultimosMeses(hoyChile(), 3), []);
  const activo = meses.find((m) => m.desde === desde && m.hasta === hasta);
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-500">
      Mes
      <div className="flex gap-1">
        {meses.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() =>
              activo?.clave === m.clave ? onChange("", "") : onChange(m.desde, m.hasta)
            }
            className={`rounded-lg border px-3 py-2 text-sm ${
              activo?.clave === m.clave
                ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RangoMonto({
  min,
  max,
  onChange,
}: {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-500">
      Monto total
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Mín."
          value={min}
          onChange={(e) => onChange(e.target.value, max)}
          className={inputCls}
        />
        <span>–</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Máx."
          value={max}
          onChange={(e) => onChange(min, e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  );
}

// Valor absoluto: una nota de crédito de -50.000 entra en un rango de 50.000.
export function dentroDeRango(valor: number, min: string, max: string): boolean {
  const v = Math.abs(valor);
  if (min !== "" && v < Number(min)) return false;
  if (max !== "" && v > Number(max)) return false;
  return true;
}

export function hayRango(min: string, max: string): boolean {
  return min !== "" || max !== "";
}
```

- [ ] **Step 2: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

```bash
git add src/components/filtros.tsx
git commit -m "Filtros compartidos: atajos de mes y rango de monto"
```

---

### Task 6: Lista de Notas de venta (menú, pie, filtros)

**Files:**
- Modify: `src/app/(app)/notas-venta/page.tsx`
- Modify: `src/app/(app)/notas-venta/notas-venta-tabla.tsx`

**Interfaces:**
- Consumes: `EstadoPagoMenu` (Task 4), `AtajosMes`/`RangoMonto`/`dentroDeRango` (Task 5), `totalesListadoNotas(filas, hoy)` (Task 1), `vencimientoEfectivo` de `@/lib/estado-cuenta`, `esNotaCredito` de `@/lib/dte-doc`.
- Produces: `NotaVentaRow` con `vencimiento: string | null`, `vendedor: string | null`, `nCobros: number`; prop `puedeEscribir: boolean` en `NotasVentaTabla`.

- [ ] **Step 1: `page.tsx`** — ampliar la consulta, el tipo y el mapeo.

Cambios:
- Select: `ventas_sii(tipo_doc, fecha_emision, forma_pago, term_pago_dias, fecha_vencimiento_manual)` y agregar `vendedor` a la lista de columnas de `notas_venta` y `id, monto` en `pagos_nota_venta(monto)` se mantiene.
- En `NotaConItems`: `Omit<NotaVentaRow, "venta" | "costo" | "cobrado" | "fechaVenta" | "entrega" | "vencimiento" | "nCobros">`, `ventas_sii` pasa a `{ tipo_doc: number; fecha_emision: string | null; forma_pago: number | null; term_pago_dias: number | null; fecha_vencimiento_manual: string | null }[]`.
- En el mapeo, además de lo existente:

```ts
      nCobros: (pagos_nota_venta ?? []).length,
      // Vence la factura más temprana; las notas de crédito no vencen.
      vencimiento: (ventas_sii ?? [])
        .filter((v) => !esNotaCredito(v.tipo_doc))
        .map((v) =>
          vencimientoEfectivo(
            v.fecha_vencimiento_manual,
            v.fecha_emision,
            v.forma_pago,
            v.term_pago_dias
          )
        )
        .filter((v): v is string => !!v)
        .sort()[0] ?? null,
```

- Imports: `esNotaCredito` de `@/lib/dte-doc`, `vencimientoEfectivo` de `@/lib/estado-cuenta`.
- Pasar `puedeEscribir={puedeEscribir}` a `<NotasVentaTabla>`.

- [ ] **Step 2: `notas-venta-tabla.tsx`**

- Imports: `EstadoPagoMenu`, `AtajosMes`, `RangoMonto`, `dentroDeRango`, `hayRango` de `@/components/filtros`; quitar `ultimosMeses`, `useMemo` de meses y la función `alternarMes` si quedan sin uso (los atajos pasan a `AtajosMes`).
- `NotaVentaRow`: agregar `vencimiento: string | null; vendedor: string | null; nCobros: number;`.
- Props: `puedeEscribir = false`.
- Estado nuevo: `cobro` (`""|"saldo"|"vencidas"`), `montoMin`, `montoMax`, `vendedor`.
- `hoy = useMemo(() => hoyChile(), [])`.
- En el `filter`, después del bloque `entrega`:

```ts
      if (cobro) {
        if (n.estado === "anulada") return false;
        const pendiente = n.total - n.cobrado;
        if (pendiente <= 0) return false;
        if (cobro === "vencidas" && !(n.vencimiento && n.vencimiento < hoy)) return false;
      }
      if (!dentroDeRango(n.total, montoMin, montoMax)) return false;
      if (vendedor && n.vendedor !== vendedor) return false;
```

y sumar `cobro, montoMin, montoMax, vendedor, hoy` a las dependencias.
- `tot = totalesListadoNotas(filtradas.map(n => ({ ..., vencimiento: n.vencimiento })), hoy)`.
- `vendedores = Array.from(new Set(notas.map(n => n.vendedor).filter(Boolean)))`.
- UI de filtros: reemplazar los botones de mes por `<AtajosMes desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} />`; agregar select "Cobro" (Todos / Con saldo / Vencidas), `<RangoMonto min={montoMin} max={montoMax} onChange={(a, b) => { setMontoMin(a); setMontoMax(b); }} />` y select "Vendedor" (solo si `vendedores.length > 1`); incluir los nuevos en la condición y en el onClick del botón "Limpiar".
- Badge de la fila: reemplazar `<NotaEstadoBadge estado={nota.estado} />` por:

```tsx
<EstadoPagoMenu
  notaVentaId={nota.id}
  estado={nota.estado}
  total={nota.total}
  cobrado={nota.cobrado}
  nCobros={nota.nCobros}
  editable={puedeEscribir}
/>
```

- Chip sobre la tabla (antes del `<div className="overflow-x-auto ...">`):

```tsx
<div className="mb-3 flex flex-wrap gap-2 text-sm">
  <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-800">
    Falta por cobrar: {formatCLP(tot.saldo)}
  </span>
</div>
```

- Pie: dentro del `<tfoot>`, agregar una segunda `<tr>` con un solo `<td colSpan={9}>`:

```tsx
<tr className="border-t border-slate-200">
  <td colSpan={9} className="px-4 py-3">
    <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
      <span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Total </span>
        {formatCLP(tot.total)}
      </span>
      <span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Cobrado </span>
        {formatCLP(tot.cobrado)}
      </span>
      <span className="text-amber-700">
        <span className="text-xs font-medium uppercase tracking-wide">Falta por cobrar </span>
        {formatCLP(tot.saldo)}
      </span>
      {tot.vencido > 0 && (
        <span className="text-red-600">
          <span className="text-xs font-medium uppercase tracking-wide">de eso, vencido </span>
          {formatCLP(tot.vencido)}
        </span>
      )}
    </div>
  </td>
</tr>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: sin errores, tests en verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/notas-venta/page.tsx" "src/app/(app)/notas-venta/notas-venta-tabla.tsx"
git commit -m "Notas de venta: cambiar estado de pago en la lista, cobrado y falta por cobrar al pie, filtros nuevos"
```

---

### Task 7: Estado de pago visible en Cotizaciones

**Files:**
- Modify: `src/app/(app)/cotizaciones/page.tsx`
- Modify: `src/app/(app)/cotizaciones/cotizaciones-tabla.tsx`

**Interfaces:**
- Consumes: `resumenPagoNota` (Task 1).

- [ ] **Step 1: `page.tsx`** — en el select cambiar `notas_venta(id, folio)` por `notas_venta(id, folio, estado, total, pagos_nota_venta(monto))`.

- [ ] **Step 2: `cotizaciones-tabla.tsx`**
  - `NotaRef` pasa a `{ id: string; folio: string; estado?: string; total?: number; pagos_nota_venta?: { monto: number }[] }`.
  - Importar `resumenPagoNota` de `@/lib/cobros`.
  - Agregar `<th className="px-4 py-3">Pago</th>` después del `<th>` de Estado (verificar el orden real de columnas en el `<thead>`; el `colSpan` de las filas vacías/pie sube en 1).
  - Después de la celda del `EstadoBadge`, agregar:

```tsx
<td className="px-4 py-3 whitespace-nowrap">
  {(() => {
    const nota = notaDe(cotizacion);
    if (!nota || !nota.estado) return <span className="text-slate-400">—</span>;
    const r = resumenPagoNota({
      estado: nota.estado,
      total: nota.total ?? 0,
      cobrado: (nota.pagos_nota_venta ?? []).reduce((s, p) => s + p.monto, 0),
    });
    const cls =
      r.tono === "ok"
        ? "bg-green-100 text-green-700"
        : r.tono === "aviso"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";
    return (
      <Link
        href={`/notas-venta/${nota.id}`}
        title={`Nota de venta ${nota.folio}`}
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
      >
        {r.texto}
      </Link>
    );
  })()}
</td>
```

- [ ] **Step 3: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

```bash
git add "src/app/(app)/cotizaciones/page.tsx" "src/app/(app)/cotizaciones/cotizaciones-tabla.tsx"
git commit -m "Cotizaciones: mostrar el estado de pago de su nota de venta"
```

---

### Task 8: Filtros de Compras

**Files:**
- Modify: `src/app/(app)/compras/compras-tabla.tsx`

**Interfaces:**
- Consumes: `estadoPagoCompra`, `compraVencida` (Task 2); `AtajosMes`, `RangoMonto`, `dentroDeRango`, `hayRango` (Task 5); `hoyChile`.

- [ ] **Step 1: Editar**
  - Quitar las constantes `SIN_ASIGNAR` y `CON_DEUDA` y sus `<option>` del select "Forma de pago" (esos dos casos pasan al nuevo select de estado de pago). En el `filter`, el bloque `if (pago)` queda solo con `coincide = actuales.includes(pago as FormaPagoCompra)`.
  - Estado nuevo: `estadoPago` (`""|"pagada"|"con_deuda"|"sin_cargar"`), `venc` (`""|"vencidas"`), `montoMin`, `montoMax`. `const hoy = useMemo(() => hoyChile(), [])`.
  - En el `filter` agregar:

```ts
      const propias = items[c.id] ?? [];
      if (estadoPago && estadoPagoCompra(propias, c.monto_total) !== estadoPago) return false;
      if (venc === "vencidas" && !compraVencida(propias, c.fecha_emision, c.monto_total, hoy)) return false;
      if (!dentroDeRango(c.monto_total, montoMin, montoMax)) return false;
```

  y sumar `estadoPago, venc, montoMin, montoMax, hoy` a las dependencias del `useMemo`.
  - UI: select "Estado de pago" (Todos / Pagadas / Con deuda / Sin cargar), select "Vencimiento" (Todos / Vencidas), `<RangoMonto>` y `<AtajosMes>` (con `onChange={(d, h) => { setDesde(d); setHasta(h); }}`); ampliar la condición y el onClick de "Limpiar".
  - Imports: `estadoPagoCompra`, `compraVencida` desde `@/lib/forma-pago-compra`; `montoDeuda` se sigue usando en otras partes (no borrar su import si hay otros usos); `useMemo` ya está importado.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores (en particular, sin imports sin usar).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/compras/compras-tabla.tsx"
git commit -m "Compras: filtros por estado de pago, vencidas, monto y mes"
```

---

### Task 9: Filtros de Ventas

**Files:**
- Modify: `src/app/(app)/ventas/page.tsx`
- Modify: `src/app/(app)/ventas/ventas-tabla.tsx`

**Interfaces:**
- Consumes: `estadoCobroFactura` (Task 1), componentes de Task 5, `vencimientoEfectivo`.

- [ ] **Step 1: `page.tsx`** — cambiar `notas_venta(id, folio)` por `notas_venta(id, folio, estado)`.

- [ ] **Step 2: `ventas-tabla.tsx`**
  - `VentaRow.notas_venta` pasa a `{ id: string; folio: string; estado: string } | null`.
  - Estado nuevo: `cobro` (`""|"cobrada"|"con_saldo"|"vencida"`), `nota` (`""|"con"|"sin"`), `montoMin`, `montoMax`; `hoy = useMemo(() => hoyChile(), [])`.
  - En el `filter`:

```ts
      if (!dentroDeRango(v.monto_total, montoMin, montoMax)) return false;
      if (nota === "con" && !v.notas_venta) return false;
      if (nota === "sin" && v.notas_venta) return false;
      if (cobro) {
        const venc = vencimientoEfectivo(
          v.fecha_vencimiento_manual,
          v.fecha_emision,
          v.forma_pago,
          v.term_pago_dias
        );
        const e = estadoCobroFactura(
          { tipo_doc: v.tipo_doc, vencimiento: venc, nota: v.notas_venta },
          hoy
        );
        if (e !== cobro) return false;
      }
```

  con las nuevas dependencias en el `useMemo`.
  - UI: select "Cobro" (Todos / Cobradas / Con saldo / Vencidas), select "Nota de venta" (Todas / Con nota / Sin nota), `<RangoMonto>`, `<AtajosMes>`; ampliar "Limpiar".
  - Imports: `estadoCobroFactura` de `@/lib/cobros`, `hoyChile` de `@/lib/fecha`, componentes de `@/components/filtros`.

- [ ] **Step 3: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: sin errores, tests en verde.

```bash
git add "src/app/(app)/ventas/page.tsx" "src/app/(app)/ventas/ventas-tabla.tsx"
git commit -m "Ventas: filtros por cobro, nota vinculada, monto y mes"
```

---

### Task 10: Verificación final y despliegue

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: compila sin errores de tipos ni de lint.

- [ ] **Step 2: Verificación en navegador** (dev server `npm run dev`, entrar con un usuario con permiso de escritura)
  - Notas de venta: el menú del badge marca pagada una nota pendiente con el saldo exacto y la devuelve a pendiente; la nota cambia en la lista, en el detalle (bloque Cobros) y en `/finanzas`.
  - Pie: Total, Cobrado, Falta por cobrar y vencido cambian al filtrar.
  - Cotizaciones: la columna Pago refleja el cambio.
  - Compras y Ventas: cada filtro nuevo reduce la lista y "Limpiar" los resetea.

- [ ] **Step 3: Subir a producción**

```bash
git push origin main
```

Confirmar el despliegue en Vercel y repetir una pasada corta de Step 2 en el dominio de producción.
