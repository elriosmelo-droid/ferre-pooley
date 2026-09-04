# Ruta del dinero (Finanzas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar cobros parciales contra las notas de venta y mostrar, en una página `/finanzas`, cuánto de lo vendido y de la utilidad ya entró efectivamente a caja.

**Architecture:** Tabla nueva `pagos_nota_venta` con un abono por fila (monto + fecha real del pago). Un trigger en la base mantiene `notas_venta.estado` y `pagada_at` desde esos abonos, de modo que el dashboard, `/estados-cuenta`, `/conciliacion` y el badge del listado siguen leyendo lo mismo que hoy sin tocarse. Toda la aritmética (saldo, atribución proporcional del margen, agregados de las dos lentes) vive en `src/lib/cobros.ts`, puro y con tests; las páginas solo consultan y muestran.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), Supabase (Postgres + RLS), TypeScript, Tailwind v4, Vitest, zod v4.

**Spec:** `docs/superpowers/specs/2026-09-03-ruta-del-dinero-design.md`

## Global Constraints

- **Migración:** el archivo SQL se escribe en Task 1 pero **no se aplica a producción hasta Task 8**. Todas las tasks intermedias deben compilar y pasar tests sin la tabla en prod.
- **Commits:** autor único `Elvis Rios <elriosmelo@gmail.com>`, sin trailer de Claude. Usar `git commit --author="Elvis Rios <elriosmelo@gmail.com>"`.
- **Imports en `src/lib`:** relativos (`./money`), no el alias `@/`. El alias no resuelve en Vitest, que no tiene config.
- **Montos:** enteros en pesos. Nunca decimales. Redondear con `Math.round`.
- **Bases:** `notas_venta.total` es bruto (con IVA y flete). El margen de `calcularMargen` es neto y sin flete. No se mezclan: la proporción de cobro es bruto/bruto y el resultado se aplica sobre el margen neto.
- **Notas anuladas:** quedan fuera de todo `/finanzas` y no aceptan abonos.
- **Verificación antes de declarar algo terminado:** `npx tsc --noEmit && npm run lint && npm test && npm run build`.

---

### Task 1: Migración 023 (archivo SQL, sin aplicar)

**Files:**
- Create: `supabase/migrations/023_pagos_nota_venta.sql`

**Interfaces:**
- Produces: tabla `pagos_nota_venta (id, nota_venta_id, monto, fecha, medio_pago, observacion, created_by, created_at)`, función `public.sync_estado_nota_venta()`, trigger `pagos_nota_venta_sync_estado`.
- La aplicación a prod ocurre en Task 8 (**no aplicar aquí**).

- [ ] **Step 1: Escribir la migración**

```sql
-- 023: Cobros de notas de venta (abonos parciales) y estado derivado.
--
-- Hasta ahora una nota estaba 'pagada' o 'pendiente', sin punto medio, y la
-- fecha que guardaba (pagada_at) era cuándo alguien apretó el botón, no cuándo
-- llegó la plata. Para saber cuánto de lo vendido está efectivamente en caja
-- hacen falta las dos cosas: el monto de cada abono y su fecha real.
--
-- `estado` NO pasa a ser derivado en el código: lo mantiene un trigger. Así el
-- dashboard, /estados-cuenta, /conciliacion y el badge del listado siguen
-- leyendo la misma columna que hoy y no hay que tocarlos.

create table if not exists pagos_nota_venta (
  id uuid primary key default gen_random_uuid(),
  nota_venta_id uuid not null references notas_venta(id) on delete cascade,
  monto integer not null check (monto > 0),
  -- Cuándo entró el dinero. La escribe el usuario; es distinta de created_at,
  -- que es cuándo se registró. Confundirlas es el defecto que tiene pagada_at.
  fecha date not null,
  medio_pago medio_pago,
  observacion text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Se lee siempre agrupado por nota; la lente "por caja" filtra por rango de fechas.
create index if not exists pagos_nota_venta_nota_idx
  on pagos_nota_venta (nota_venta_id);
create index if not exists pagos_nota_venta_fecha_idx
  on pagos_nota_venta (fecha);

alter table pagos_nota_venta enable row level security;
drop policy if exists "members pagos_nota_venta" on pagos_nota_venta;
create policy "members pagos_nota_venta" on pagos_nota_venta
  for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- Backfill ANTES de crear el trigger, a propósito: si el trigger ya existiera,
-- pisaría pagada_at con la fecha a medianoche y se perdería la hora original.
--
-- Ojo con estos registros: pagada_at es la fecha del click, no la del pago, así
-- que la lente "por caja" es exacta de aquí en adelante y aproximada hacia
-- atrás. El dato real nunca se guardó. La observación lo deja dicho.
insert into pagos_nota_venta (nota_venta_id, monto, fecha, observacion)
select nv.id, nv.total, nv.pagada_at::date, 'Migrado del estado anterior'
from notas_venta nv
where nv.estado = 'pagada'
  and nv.pagada_at is not null
  and nv.total > 0
  and not exists (
    select 1 from pagos_nota_venta p where p.nota_venta_id = nv.id
  );

-- Mantiene estado y pagada_at desde los abonos. Vive en la base y no en el
-- server action para que dos personas registrando abonos a la vez no puedan
-- dejar el estado inconsistente: el `for update` serializa por nota.
create or replace function public.sync_estado_nota_venta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nota uuid := coalesce(new.nota_venta_id, old.nota_venta_id);
  v_total integer;
  v_estado nota_venta_estado;
  v_cobrado integer;
  v_ultima date;
begin
  select total, estado into v_total, v_estado
  from notas_venta where id = v_nota for update;
  if not found then
    return null;
  end if;

  -- Una nota anulada no cambia de estado por abonos.
  if v_estado = 'anulada' then
    return null;
  end if;

  select coalesce(sum(monto), 0), max(fecha)
  into v_cobrado, v_ultima
  from pagos_nota_venta where nota_venta_id = v_nota;

  if v_cobrado >= v_total then
    update notas_venta
    set estado = 'pagada', pagada_at = v_ultima::timestamptz
    where id = v_nota;
  else
    update notas_venta
    set estado = 'pendiente', pagada_at = null
    where id = v_nota;
  end if;

  return null;
end $$;

drop trigger if exists pagos_nota_venta_sync_estado on pagos_nota_venta;
create trigger pagos_nota_venta_sync_estado
after insert or update or delete on pagos_nota_venta
for each row execute function public.sync_estado_nota_venta();
```

- [ ] **Step 2: Sanity check del SQL (solo lectura, sin aplicar)**

Run: `grep -c "create trigger" supabase/migrations/023_pagos_nota_venta.sql`
Expected: `1`

Run: `grep -n "insert into pagos_nota_venta" supabase/migrations/023_pagos_nota_venta.sql`
Expected: una línea, y debe aparecer **antes** del `create or replace function public.sync_estado_nota_venta`. Verificar con:

Run: `awk '/insert into pagos_nota_venta/{i=NR} /create or replace function public.sync_estado_nota_venta/{f=NR} END{print (i<f) ? "orden OK" : "ORDEN MAL"}' supabase/migrations/023_pagos_nota_venta.sql`
Expected: `orden OK`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_pagos_nota_venta.sql
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Migración 023: cobros de notas de venta con estado derivado por trigger"
```

---

### Task 2: `src/lib/cobros.ts` — aritmética de cobros

**Files:**
- Create: `src/lib/cobros.ts`
- Test: `src/lib/cobros.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `type Cobro = { id: string; fecha: string; monto: number; medio_pago: string | null; observacion: string | null }`
  - `type NotaCobrable = { id: string; total: number; margen: number; anulada: boolean; fechaVenta: string; vencimiento: string | null; cobros: Cobro[] }`
  - `cobrado(cobros: Cobro[]): number`
  - `saldo(total: number, cobros: Cobro[]): number`
  - `utilidadDeAbono(margen: number, total: number, monto: number): number`
  - `utilidadPercibida(nota: NotaCobrable): number`
  - `estaVencida(nota: NotaCobrable, hoy: string): boolean`
  - `type ResumenVenta = { notas: number; vendido: number; utilidad: number; cobrado: number; utilidadPercibida: number; porCobrar: number; porCobrarVencido: number }`
  - `resumenPorVenta(notas: NotaCobrable[], hoy: string): ResumenVenta`
  - `type AbonoAtribuido<T extends NotaCobrable = NotaCobrable> = { nota: T; cobro: Cobro; utilidad: number }`
  - `abonosEnRango<T extends NotaCobrable>(notas: T[], desde: string, hasta: string): AbonoAtribuido<T>[]`
    (genérico a propósito: la página de finanzas pasa notas con `folio` y `cliente` encima y los recupera sin castear)
  - `type ResumenCaja = { abonos: number; cobrado: number; utilidadPercibida: number }`
  - `resumenPorCaja(notas: NotaCobrable[], desde: string, hasta: string): ResumenCaja`
  - `hoyChile(): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/cobros.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cobrado,
  saldo,
  utilidadDeAbono,
  utilidadPercibida,
  estaVencida,
  resumenPorVenta,
  abonosEnRango,
  resumenPorCaja,
  type Cobro,
  type NotaCobrable,
} from "./cobros";

function cobro(fecha: string, monto: number, id = `${fecha}-${monto}`): Cobro {
  return { id, fecha, monto, medio_pago: null, observacion: null };
}

// Nota de $100.000 brutos con $20.000 de margen neto, vendida el 1 de junio.
function nota(over: Partial<NotaCobrable> = {}): NotaCobrable {
  return {
    id: "n1",
    total: 100000,
    margen: 20000,
    anulada: false,
    fechaVenta: "2026-06-01",
    vencimiento: "2026-07-01",
    cobros: [],
    ...over,
  };
}

describe("cobrado y saldo", () => {
  it("sin abonos el cobrado es cero y el saldo es el total", () => {
    expect(cobrado([])).toBe(0);
    expect(saldo(100000, [])).toBe(100000);
  });

  it("suma los abonos y descuenta del total", () => {
    const cs = [cobro("2026-06-10", 30000), cobro("2026-07-05", 20000)];
    expect(cobrado(cs)).toBe(50000);
    expect(saldo(100000, cs)).toBe(50000);
  });

  it("un cobro de más deja saldo negativo (a favor del cliente)", () => {
    expect(saldo(100000, [cobro("2026-06-10", 120000)])).toBe(-20000);
  });
});

describe("utilidadDeAbono", () => {
  it("atribuye el margen en proporción a lo cobrado", () => {
    // 60% del documento cobrado => 60% del margen.
    expect(utilidadDeAbono(20000, 100000, 60000)).toBe(12000);
  });

  it("un abono por el total trae el margen completo", () => {
    expect(utilidadDeAbono(20000, 100000, 100000)).toBe(20000);
  });

  it("redondea al peso", () => {
    // 20000 * 33333 / 100000 = 6666.6
    expect(utilidadDeAbono(20000, 100000, 33333)).toBe(6667);
  });

  it("con total cero devuelve cero en vez de dividir por cero", () => {
    expect(utilidadDeAbono(20000, 0, 5000)).toBe(0);
  });

  it("un margen negativo se atribuye igual, proporcional", () => {
    expect(utilidadDeAbono(-10000, 100000, 50000)).toBe(-5000);
  });
});

describe("utilidadPercibida", () => {
  it("suma la utilidad de cada abono", () => {
    const n = nota({
      cobros: [cobro("2026-06-10", 30000), cobro("2026-07-05", 30000)],
    });
    expect(utilidadPercibida(n)).toBe(12000);
  });

  it("sin abonos no hay utilidad percibida", () => {
    expect(utilidadPercibida(nota())).toBe(0);
  });
});

describe("estaVencida", () => {
  it("está vencida si pasó el vencimiento y queda saldo", () => {
    const n = nota({ cobros: [cobro("2026-06-10", 30000)] });
    expect(estaVencida(n, "2026-07-02")).toBe(true);
  });

  it("no está vencida si ya se pagó completa", () => {
    const n = nota({ cobros: [cobro("2026-06-10", 100000)] });
    expect(estaVencida(n, "2026-07-02")).toBe(false);
  });

  it("no está vencida antes del vencimiento", () => {
    expect(estaVencida(nota(), "2026-06-15")).toBe(false);
  });

  it("una nota sin vencimiento nunca cuenta como vencida", () => {
    expect(estaVencida(nota({ vencimiento: null }), "2027-01-01")).toBe(false);
  });
});

describe("resumenPorVenta", () => {
  it("agrega vendido, utilidad, cobrado y por cobrar", () => {
    const r = resumenPorVenta(
      [
        nota({ id: "a", cobros: [cobro("2026-06-10", 60000)] }),
        nota({ id: "b", total: 50000, margen: 5000, cobros: [] }),
      ],
      "2026-06-15"
    );
    expect(r.notas).toBe(2);
    expect(r.vendido).toBe(150000);
    expect(r.utilidad).toBe(25000);
    expect(r.cobrado).toBe(60000);
    expect(r.utilidadPercibida).toBe(12000);
    expect(r.porCobrar).toBe(90000);
  });

  it("descuenta las anuladas de todos los números", () => {
    const r = resumenPorVenta(
      [nota({ id: "a" }), nota({ id: "b", anulada: true })],
      "2026-06-15"
    );
    expect(r.notas).toBe(1);
    expect(r.vendido).toBe(100000);
    expect(r.utilidad).toBe(20000);
  });

  it("separa el por cobrar vencido del que está al día", () => {
    const r = resumenPorVenta(
      [
        nota({ id: "a", vencimiento: "2026-07-01" }), // vencida al 2026-08-01
        nota({ id: "b", vencimiento: "2026-09-01" }), // al día
      ],
      "2026-08-01"
    );
    expect(r.porCobrar).toBe(200000);
    expect(r.porCobrarVencido).toBe(100000);
  });

  it("sin notas devuelve todo en cero", () => {
    expect(resumenPorVenta([], "2026-08-01")).toEqual({
      notas: 0,
      vendido: 0,
      utilidad: 0,
      cobrado: 0,
      utilidadPercibida: 0,
      porCobrar: 0,
      porCobrarVencido: 0,
    });
  });
});

describe("abonosEnRango y resumenPorCaja", () => {
  it("toma solo los abonos con fecha dentro del rango", () => {
    const n = nota({
      cobros: [
        cobro("2026-05-31", 10000),
        cobro("2026-06-10", 30000),
        cobro("2026-06-30", 20000),
        cobro("2026-07-01", 40000),
      ],
    });
    const dentro = abonosEnRango([n], "2026-06-01", "2026-06-30");
    expect(dentro.map((a) => a.cobro.monto)).toEqual([30000, 20000]);
  });

  it("atribuye la utilidad abono por abono, no acumulada", () => {
    // La misma nota abonada en dos meses: cada mes se lleva lo suyo.
    const n = nota({
      cobros: [cobro("2026-06-10", 30000), cobro("2026-07-05", 70000)],
    });
    expect(resumenPorCaja([n], "2026-06-01", "2026-06-30")).toEqual({
      abonos: 1,
      cobrado: 30000,
      utilidadPercibida: 6000,
    });
    expect(resumenPorCaja([n], "2026-07-01", "2026-07-31")).toEqual({
      abonos: 1,
      cobrado: 70000,
      utilidadPercibida: 14000,
    });
  });

  it("ignora los abonos de notas anuladas", () => {
    const n = nota({ anulada: true, cobros: [cobro("2026-06-10", 30000)] });
    expect(resumenPorCaja([n], "2026-06-01", "2026-06-30")).toEqual({
      abonos: 0,
      cobrado: 0,
      utilidadPercibida: 0,
    });
  });

  it("un rango sin abonos devuelve todo en cero", () => {
    const n = nota({ cobros: [cobro("2026-06-10", 30000)] });
    expect(resumenPorCaja([n], "2026-01-01", "2026-01-31")).toEqual({
      abonos: 0,
      cobrado: 0,
      utilidadPercibida: 0,
    });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/cobros.test.ts`
Expected: FAIL — no resuelve el import `./cobros` ("Failed to load url ./cobros").

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/cobros.ts`:

```ts
// Cobros de una nota de venta y la utilidad que arrastra cada peso cobrado.
//
// La regla de atribución es proporcional: si se cobró el 60% del documento,
// entró el 60% del margen. Es proporcional porque no hay forma de saber qué
// línea del documento pagó el cliente; cualquier otra regla sería inventada.
//
// Ojo con las bases: `total` es bruto (con IVA y con flete) porque es lo que el
// cliente debe y lo que se cobra, mientras que `margen` es neto y sin flete. La
// proporción se calcula bruto contra bruto y el resultado se aplica sobre el
// margen neto; los dos números no se dividen entre sí en ninguna parte.

export type Cobro = {
  id: string;
  fecha: string; // 'AAAA-MM-DD', cuándo entró el dinero
  monto: number;
  medio_pago: string | null;
  observacion: string | null;
};

export type NotaCobrable = {
  id: string;
  total: number; // bruto, con IVA y flete
  margen: number; // neto, sin flete
  anulada: boolean;
  fechaVenta: string; // 'AAAA-MM-DD'
  // Sale de la factura del SII vinculada. null cuando la nota no tiene
  // factura: sin plazo no hay cómo saber cuándo vence.
  vencimiento: string | null;
  cobros: Cobro[];
};

export function cobrado(cobros: Cobro[]): number {
  return cobros.reduce((s, c) => s + c.monto, 0);
}

// Negativo = el cliente pagó de más y queda saldo a su favor. Se permite a
// propósito: bloquearlo obligaría a inventar cifras para poder guardar.
export function saldo(total: number, cobros: Cobro[]): number {
  return total - cobrado(cobros);
}

// Parte del margen que arrastra un abono. Con total en cero no hay proporción
// que calcular y devuelve cero en vez de dividir por cero.
export function utilidadDeAbono(
  margen: number,
  total: number,
  monto: number
): number {
  if (total <= 0) return 0;
  return Math.round((margen * monto) / total);
}

export function utilidadPercibida(nota: NotaCobrable): number {
  return nota.cobros.reduce(
    (s, c) => s + utilidadDeAbono(nota.margen, nota.total, c.monto),
    0
  );
}

// Vencida = pasó el vencimiento y todavía queda saldo. Una nota sin
// vencimiento (sin factura vinculada) nunca cuenta como vencida: no se sabe.
export function estaVencida(nota: NotaCobrable, hoy: string): boolean {
  if (!nota.vencimiento) return false;
  return nota.vencimiento < hoy && saldo(nota.total, nota.cobros) > 0;
}

export type ResumenVenta = {
  notas: number;
  vendido: number;
  utilidad: number;
  cobrado: number;
  utilidadPercibida: number;
  porCobrar: number;
  porCobrarVencido: number;
};

// Lente "por venta": de lo vendido en el período, cuánto se ha cobrado. Las
// notas llegan ya filtradas por fecha de venta; acá solo se descartan las
// anuladas, que no son plata que se espere.
export function resumenPorVenta(
  notas: NotaCobrable[],
  hoy: string
): ResumenVenta {
  const r: ResumenVenta = {
    notas: 0,
    vendido: 0,
    utilidad: 0,
    cobrado: 0,
    utilidadPercibida: 0,
    porCobrar: 0,
    porCobrarVencido: 0,
  };
  for (const n of notas) {
    if (n.anulada) continue;
    const pagado = cobrado(n.cobros);
    const pendiente = n.total - pagado;
    r.notas += 1;
    r.vendido += n.total;
    r.utilidad += n.margen;
    r.cobrado += pagado;
    r.utilidadPercibida += utilidadPercibida(n);
    // Un saldo negativo no es plata por cobrar: no suma al pendiente.
    if (pendiente > 0) {
      r.porCobrar += pendiente;
      if (estaVencida(n, hoy)) r.porCobrarVencido += pendiente;
    }
  }
  return r;
}

// Genérico para que quien pase notas con campos extra (folio, cliente) los
// recupere tipados en el resultado, sin castear.
export type AbonoAtribuido<T extends NotaCobrable = NotaCobrable> = {
  nota: T;
  cobro: Cobro;
  utilidad: number;
};

// Los abonos que cayeron en el rango, cada uno con la utilidad que le toca.
// La atribución es abono por abono, no acumulada: si una nota se abona en dos
// meses, cada mes se lleva solo su parte.
export function abonosEnRango<T extends NotaCobrable>(
  notas: T[],
  desde: string,
  hasta: string
): AbonoAtribuido<T>[] {
  const salida: AbonoAtribuido<T>[] = [];
  for (const nota of notas) {
    if (nota.anulada) continue;
    for (const cobro of nota.cobros) {
      if (desde && cobro.fecha < desde) continue;
      if (hasta && cobro.fecha > hasta) continue;
      salida.push({
        nota,
        cobro,
        utilidad: utilidadDeAbono(nota.margen, nota.total, cobro.monto),
      });
    }
  }
  return salida;
}

export type ResumenCaja = {
  abonos: number;
  cobrado: number;
  utilidadPercibida: number;
};

// Lente "por caja": cuánta plata entró en el período y qué utilidad traía,
// sin importar cuándo se vendió.
export function resumenPorCaja(
  notas: NotaCobrable[],
  desde: string,
  hasta: string
): ResumenCaja {
  const dentro = abonosEnRango(notas, desde, hasta);
  return {
    abonos: dentro.length,
    cobrado: dentro.reduce((s, a) => s + a.cobro.monto, 0),
    utilidadPercibida: dentro.reduce((s, a) => s + a.utilidad, 0),
  };
}

// Hoy en Chile como 'AAAA-MM-DD'. El servidor corre en UTC, así que usar
// `new Date()` directo corre el día durante la noche chilena.
export function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/cobros.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Verificación completa**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cobros.ts src/lib/cobros.test.ts
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Cobros: aritmética de abonos, saldo y utilidad percibida"
```

---

### Task 3: Server actions de cobros

**Files:**
- Modify: `src/app/(app)/notas-venta/actions.ts` (agregar `registrarCobro` y `eliminarCobro`; eliminar `marcarPagada`)

**Interfaces:**
- Consumes: `NotaVentaActionResult` (ya existe en ese archivo), `MEDIOS_PAGO_VALORES` de `@/lib/medio-pago` (ya importado).
- Produces:
  - `registrarCobro(input: { nota_venta_id: string; monto: number; fecha: string; medio_pago?: string | null; observacion?: string | null }): Promise<NotaVentaActionResult>`
  - `eliminarCobro(id: string, notaVentaId: string): Promise<NotaVentaActionResult>`
- `marcarPagada` deja de existir: Task 4 borra su único llamador.

- [ ] **Step 1: Eliminar `marcarPagada`**

En `src/app/(app)/notas-venta/actions.ts`, borrar la función `marcarPagada` completa (desde `export async function marcarPagada(` hasta su `}` de cierre, incluyendo el comentario sobre la transición atómica que la precede).

Se elimina y no se deja al lado del formulario nuevo porque sería exactamente la puerta que desincroniza los números: alguien marca pagada sin registrar el abono y `/finanzas` deja de cuadrar con el listado. Un solo camino para decir "entró plata".

- [ ] **Step 2: Agregar las actions de cobro**

En el mismo archivo, después del bloque de `NotaVentaActionResult`:

```ts
const cobroSchema = z.object({
  nota_venta_id: z.uuid(),
  monto: z.coerce.number().int().positive("El monto debe ser mayor que cero"),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha del pago es obligatoria"),
  medio_pago: z.enum(MEDIOS_PAGO_VALORES).nullish(),
  observacion: z.string().trim().max(200).nullish(),
});

// Registra un abono. El estado de la nota lo actualiza el trigger de la base
// (023), no este action: así dos personas abonando a la vez no pueden dejarlo
// inconsistente.
export async function registrarCobro(
  input: unknown
): Promise<NotaVentaActionResult> {
  const parsed = cobroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const datos = parsed.data;

  const supabase = await createClient();

  // Una nota anulada no acepta abonos: no es plata que se espere.
  const { data: nota } = await supabase
    .from("notas_venta")
    .select("estado")
    .eq("id", datos.nota_venta_id)
    .single();

  if (!nota) return { error: "La nota de venta no existe" };
  if (nota.estado === "anulada") {
    return { error: "No se puede registrar un cobro en una nota anulada" };
  }

  const { error } = await supabase.from("pagos_nota_venta").insert({
    nota_venta_id: datos.nota_venta_id,
    monto: datos.monto,
    fecha: datos.fecha,
    medio_pago: datos.medio_pago ?? null,
    observacion: datos.observacion || null,
  });

  if (error) {
    console.error("Error al registrar cobro:", error.message);
    return { error: "No se pudo registrar el cobro. Intenta nuevamente." };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${datos.nota_venta_id}`);
  revalidatePath("/finanzas");
  return { success: true };
}

// Borrar un abono devuelve la nota a pendiente si con eso queda saldo; también
// lo hace el trigger. Es la corrección de un error de tipeo.
export async function eliminarCobro(
  id: string,
  notaVentaId: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("pagos_nota_venta")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error al eliminar cobro:", error.message);
    return { error: "No se pudo eliminar el cobro. Intenta nuevamente." };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${notaVentaId}`);
  revalidatePath("/finanzas");
  return { success: true };
}
```

- [ ] **Step 3: Verificar que compila (va a fallar por el llamador de `marcarPagada`)**

Run: `npx tsc --noEmit`
Expected: FAIL con un error en `src/app/(app)/notas-venta/[id]/acciones-nota.tsx`: `Module '"../actions"' has no exported member 'marcarPagada'`.

Ese error es el esperado: lo arregla Task 4. **No commitear todavía**; Task 3 y Task 4 se commitean juntas en Task 4, porque por separado el repo no compila.

---

### Task 4: Bloque de cobros en el detalle de la nota

**Files:**
- Create: `src/app/(app)/notas-venta/[id]/cobros-nota.tsx`
- Modify: `src/app/(app)/notas-venta/[id]/acciones-nota.tsx` (quitar el botón "Marcar pagada")
- Modify: `src/app/(app)/notas-venta/[id]/page.tsx` (traer los cobros y montar el bloque)

**Interfaces:**
- Consumes: `registrarCobro`, `eliminarCobro` (Task 3); `cobrado`, `saldo`, `type Cobro` (Task 2); `hoyChile` (Task 2).
- Produces: componente `<CobrosNota notaVentaId total cobros anulada />`.

- [ ] **Step 1: Quitar el botón "Marcar pagada"**

En `src/app/(app)/notas-venta/[id]/acciones-nota.tsx`:

1. Cambiar el import: `import { anularNotaVenta, eliminarNotaVenta } from "../actions";`
2. Borrar la función `pagar()` completa.
3. Borrar el `<button>` de "Marcar pagada" (el de `bg-green-600`), dejando solo el de Anular dentro del fragmento `estado === "pendiente"`.

El fragmento queda:

```tsx
        {estado === "pendiente" && (
          <button
            type="button"
            onClick={anular}
            disabled={isPending}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {isPending ? "Procesando…" : "Anular"}
          </button>
        )}
```

- [ ] **Step 2: Crear el componente de cobros**

Crear `src/app/(app)/notas-venta/[id]/cobros-nota.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import { cobrado, saldo, hoyChile, type Cobro } from "@/lib/cobros";
import { MEDIOS_PAGO, etiquetaMedioPago } from "@/lib/medio-pago";
import { registrarCobro, eliminarCobro } from "../actions";

function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function CobrosNota({
  notaVentaId,
  total,
  cobros,
  anulada,
}: {
  notaVentaId: string;
  total: number;
  cobros: Cobro[];
  anulada: boolean;
}) {
  const pagado = cobrado(cobros);
  const pendiente = saldo(total, cobros);

  // El caso normal es que el cliente pagó todo: el monto viene con el saldo y
  // la fecha con hoy, así que registrar es un click. El abono parcial es
  // escribir otro monto.
  const [monto, setMonto] = useState(() =>
    pendiente > 0 ? String(pendiente) : ""
  );
  const [fecha, setFecha] = useState(hoyChile);
  const [medio, setMedio] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function registrar() {
    setError(null);
    startTransition(async () => {
      const res = await registrarCobro({
        nota_venta_id: notaVentaId,
        monto: Number(monto),
        fecha,
        medio_pago: medio || null,
        observacion: observacion || null,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setObservacion("");
      setMonto("");
    });
  }

  function borrar(id: string) {
    if (!confirm("¿Eliminar este cobro?")) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarCobro(id, notaVentaId);
      if (res?.error) setError(res.error);
    });
  }

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-bold text-slate-900">Cobros</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cada abono con la fecha en que entró el dinero, no la de registro.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 border-b border-slate-100 px-6 py-4 text-sm">
        <div>
          <p className="text-slate-500">Total</p>
          <p className="text-lg font-bold text-slate-900">{formatCLP(total)}</p>
        </div>
        <div>
          <p className="text-slate-500">Cobrado</p>
          <p className="text-lg font-bold text-slate-900">
            {formatCLP(pagado)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">
            {pendiente < 0 ? "A favor del cliente" : "Saldo"}
          </p>
          <p
            className={`text-lg font-bold ${
              pendiente > 0
                ? "text-amber-700"
                : pendiente < 0
                  ? "text-red-600"
                  : "text-green-700"
            }`}
          >
            {formatCLP(Math.abs(pendiente))}
          </p>
        </div>
      </div>

      {cobros.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {cobros.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
            >
              <div>
                <span className="font-medium text-slate-900">
                  {formatCLP(c.monto)}
                </span>{" "}
                <span className="text-slate-500">
                  · {formatFecha(c.fecha)}
                  {c.medio_pago
                    ? ` · ${etiquetaMedioPago(c.medio_pago)}`
                    : ""}
                </span>
                {c.observacion && (
                  <p className="text-xs text-slate-500">{c.observacion}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => borrar(c.id)}
                disabled={isPending}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}

      {anulada ? (
        <p className="px-6 py-4 text-sm text-slate-500">
          La nota está anulada: no acepta cobros.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-6 py-4">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Monto
            <input
              type="text"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Fecha del pago
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Medio
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              {MEDIOS_PAGO.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Observación
            <input
              type="text"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Nº transferencia, banco…"
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={registrar}
            disabled={isPending || !monto}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Registrar cobro"}
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Montar el bloque en el detalle**

En `src/app/(app)/notas-venta/[id]/page.tsx`:

1. Agregar el import: `import { CobrosNota } from "./cobros-nota";`
2. En el `.select(...)` de `notas_venta`, agregar al final de la lista de relaciones:
   `nota_venta_items(...)` queda igual y se suma
   `pagos_nota_venta(id, monto, fecha, medio_pago, observacion)`.
3. En el tipo `NotaVentaDetalle`, agregar:

```ts
  pagos_nota_venta: {
    id: string;
    monto: number;
    fecha: string;
    medio_pago: string | null;
    observacion: string | null;
  }[];
```

4. Después de `const margen = calcularMargen(items);`, agregar:

```ts
  // Más recientes primero: el último abono es el que se mira.
  const cobros = [...(nota.pagos_nota_venta ?? [])].sort((a, b) =>
    b.fecha.localeCompare(a.fecha)
  );
```

5. Insertar el componente en el JSX, justo antes del bloque de facturas vinculadas (`<FacturaVinculo ... />`):

```tsx
      <CobrosNota
        notaVentaId={nota.id}
        total={nota.total}
        cobros={cobros}
        anulada={nota.estado === "anulada"}
      />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: todo verde. El error de `marcarPagada` de Task 3 ya no aparece.

- [ ] **Step 5: Commit (incluye Task 3)**

```bash
git add src/app/\(app\)/notas-venta/actions.ts src/app/\(app\)/notas-venta/\[id\]/cobros-nota.tsx src/app/\(app\)/notas-venta/\[id\]/acciones-nota.tsx src/app/\(app\)/notas-venta/\[id\]/page.tsx
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Notas de venta: registrar cobros parciales en vez de marcar pagada"
```

---

### Task 5: Columna Saldo en el listado de notas

**Files:**
- Modify: `src/app/(app)/notas-venta/page.tsx`
- Modify: `src/app/(app)/notas-venta/notas-venta-tabla.tsx`

**Interfaces:**
- Consumes: nada de `@/lib/cobros`; la suma de montos es directa. `NotaVentaRow` ya tiene `venta` y `costo` de un cambio anterior.
- Produces: `NotaVentaRow` gana `cobrado: number`.

- [ ] **Step 1: Traer los cobros y reducirlos en el server**

En `src/app/(app)/notas-venta/page.tsx`:

1. En el tipo `NotaConItems`, cambiar el `Omit` a:
   `Omit<NotaVentaRow, "venta" | "costo" | "cobrado">` y agregar el campo
   `pagos_nota_venta: { monto: number }[];`
3. En el `.select(...)`, agregar `pagos_nota_venta(monto)` a la lista.
4. En el `.map(...)`, cambiar la destructuración y el retorno:

```ts
  ).map(({ nota_venta_items, pagos_nota_venta, ...nota }) => {
    const { venta, costo } = calcularMargen(nota_venta_items ?? []);
    // Suma directa: acá solo interesa el monto, así que no vale la pena armar
    // objetos Cobro completos para poder llamar a `cobrado()`.
    return {
      ...nota,
      venta,
      costo,
      cobrado: (pagos_nota_venta ?? []).reduce((s, p) => s + p.monto, 0),
    };
  });
```

- [ ] **Step 2: Agregar la columna**

En `src/app/(app)/notas-venta/notas-venta-tabla.tsx`:

1. En `NotaVentaRow`, agregar después de `costo: number;`:

```ts
  // Suma de los abonos registrados. El saldo es total − cobrado.
  cobrado: number;
```

2. En el `<thead>`, agregar una `<th>` después de la de Total:

```tsx
              <th className="px-4 py-3 text-right">Saldo</th>
```

3. En el `<tbody>`, agregar una `<td>` después de la de Total:

```tsx
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const pendiente = nota.total - nota.cobrado;
                      if (pendiente === 0)
                        return <span className="text-slate-400">—</span>;
                      return (
                        <span
                          className={
                            pendiente > 0
                              ? "font-medium text-amber-700"
                              : "font-medium text-red-600"
                          }
                        >
                          {formatCLP(pendiente)}
                        </span>
                      );
                    })()}
                  </td>
```

4. Cambiar el `colSpan` del estado vacío de `7` a `8`.
5. En el `<tfoot>`, agregar una `<td>` con el saldo total después de la de Total:

```tsx
                <td className="px-4 py-3 text-right">
                  {formatCLP(
                    filtradas.reduce((s, n) => s + (n.total - n.cobrado), 0)
                  )}
                </td>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/notas-venta/page.tsx src/app/\(app\)/notas-venta/notas-venta-tabla.tsx
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Notas de venta: columna Saldo en el listado"
```

---

### Task 6: Página `/finanzas`

**Files:**
- Create: `src/app/(app)/finanzas/page.tsx`
- Create: `src/app/(app)/finanzas/finanzas-vista.tsx`

**Interfaces:**
- Consumes: todo lo de `@/lib/cobros` (Task 2); `calcularMargen` de `@/lib/totals`; `vencimientoEfectivo` de `@/lib/estado-cuenta`; `esNotaCredito` de `@/lib/dte-doc`.
- Produces: ruta `/finanzas`, que Task 7 enlaza desde el menú.

- [ ] **Step 1: Crear la página (server component)**

Crear `src/app/(app)/finanzas/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { calcularMargen } from "@/lib/totals";
import { vencimientoEfectivo } from "@/lib/estado-cuenta";
import { esNotaCredito } from "@/lib/dte-doc";
import type { NotaCobrable } from "@/lib/cobros";
import { FinanzasVista } from "./finanzas-vista";

type NotaQuery = {
  id: string;
  folio: string;
  total: number;
  estado: string;
  created_at: string;
  clientes: { nombre: string } | null;
  nota_venta_items: {
    cantidad: number;
    costo: number;
    precio: number;
    descuento: number;
  }[];
  pagos_nota_venta: {
    id: string;
    monto: number;
    fecha: string;
    medio_pago: string | null;
    observacion: string | null;
  }[];
};

type VentaQuery = {
  nota_venta_id: string | null;
  tipo_doc: number;
  monto_total: number;
  fecha_emision: string | null;
  forma_pago: number | null;
  term_pago_dias: number | null;
  fecha_vencimiento_manual: string | null;
};

// Fecha de la venta en hora de Chile: created_at es timestamptz y el servidor
// corre en UTC, así que cortar el ISO directo corre el día durante la noche.
function fechaChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}

export default async function FinanzasPage() {
  const supabase = await createClient();

  const [{ data: notasData, error }, { data: ventasData }] = await Promise.all([
    supabase
      .from("notas_venta")
      .select(
        `id, folio, total, estado, created_at, clientes(nombre),
         nota_venta_items(cantidad, costo, precio, descuento),
         pagos_nota_venta(id, monto, fecha, medio_pago, observacion)`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("ventas_sii")
      .select(
        "nota_venta_id, tipo_doc, monto_total, fecha_emision, forma_pago, term_pago_dias, fecha_vencimiento_manual"
      ),
  ]);

  const ventas = (ventasData ?? []) as VentaQuery[];

  // Vencimiento de cada nota = el más temprano de sus facturas. Las notas de
  // crédito no vencen, así que no entran.
  const vencePorNota = new Map<string, string>();
  for (const v of ventas) {
    if (!v.nota_venta_id || esNotaCredito(v.tipo_doc)) continue;
    const venc = vencimientoEfectivo(
      v.fecha_vencimiento_manual,
      v.fecha_emision,
      v.forma_pago,
      v.term_pago_dias
    );
    if (!venc) continue;
    const actual = vencePorNota.get(v.nota_venta_id);
    if (!actual || venc < actual) vencePorNota.set(v.nota_venta_id, venc);
  }

  const notas: (NotaCobrable & { folio: string; cliente: string })[] = (
    (notasData ?? []) as unknown as NotaQuery[]
  ).map((n) => {
    const { margen } = calcularMargen(n.nota_venta_items ?? []);
    return {
      id: n.id,
      folio: n.folio,
      cliente: n.clientes?.nombre ?? "—",
      total: n.total,
      margen,
      anulada: n.estado === "anulada",
      fechaVenta: fechaChile(n.created_at),
      vencimiento: vencePorNota.get(n.id) ?? null,
      cobros: n.pagos_nota_venta ?? [],
    };
  });

  // Facturas del SII sin nota vinculada: no tienen costo conocido, así que
  // quedan fuera del cálculo. Se declara en pantalla en vez de esconderlo.
  const sueltas = ventas.filter(
    (v) => !v.nota_venta_id && !esNotaCredito(v.tipo_doc)
  );
  const sinNota = {
    cantidad: sueltas.length,
    monto: sueltas.reduce((s, v) => s + (v.monto_total ?? 0), 0),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Finanzas</h1>
        <p className="mt-1 text-sm text-slate-500">
          La ruta del dinero: cuánto de lo vendido y de la utilidad entró
          efectivamente a caja.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los datos. Intenta nuevamente.
        </p>
      ) : (
        <FinanzasVista notas={notas} sinNota={sinNota} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear la vista (client component)**

Crear `src/app/(app)/finanzas/finanzas-vista.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { formatPct } from "@/lib/totals";
import {
  cobrado,
  hoyChile,
  resumenPorVenta,
  resumenPorCaja,
  abonosEnRango,
  utilidadPercibida,
  estaVencida,
  type NotaCobrable,
} from "@/lib/cobros";

export type NotaFinanzas = NotaCobrable & { folio: string; cliente: string };

const LENTES = [
  {
    id: "venta",
    label: "Por venta",
    ayuda: "De lo vendido en el período, cuánto se ha cobrado hasta hoy.",
  },
  {
    id: "caja",
    label: "Por caja",
    ayuda:
      "Cuánta plata entró en el período y qué utilidad traía, sin importar cuándo se vendió.",
  },
] as const;

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function Kpi({
  label,
  value,
  detail,
  alerta,
}: {
  label: string;
  value: string;
  detail: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${
          alerta ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function FinanzasVista({
  notas,
  sinNota,
}: {
  notas: NotaFinanzas[];
  sinNota: { cantidad: number; monto: number };
}) {
  const hoy = hoyChile();
  const [lente, setLente] = useState<string>("venta");
  const [desde, setDesde] = useState(() => `${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [busqueda, setBusqueda] = useState("");

  const porVenta = lente === "venta";

  const datos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = (n: NotaFinanzas) =>
      !q || `${n.folio} ${n.cliente}`.toLowerCase().includes(q);

    // La lente por venta filtra por fecha de la nota; la de caja no filtra las
    // notas, filtra los abonos (una nota de mayo puede cobrarse en junio).
    const visibles = notas.filter(
      (n) =>
        coincide(n) &&
        (!porVenta ||
          ((!desde || n.fechaVenta >= desde) &&
            (!hasta || n.fechaVenta <= hasta)))
    );

    return {
      visibles,
      venta: resumenPorVenta(visibles, hoy),
      caja: resumenPorCaja(visibles, desde, hasta),
      abonos: abonosEnRango(visibles, desde, hasta).sort((a, b) =>
        b.cobro.fecha.localeCompare(a.cobro.fecha)
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notas, desde, hasta, busqueda, porVenta]);

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  const r = datos.venta;
  const kpis = porVenta
    ? [
        {
          label: "Vendido",
          value: formatCLP(r.vendido),
          detail: `${r.notas} nota${r.notas === 1 ? "" : "s"} · bruto, con IVA`,
        },
        {
          label: "Utilidad generada",
          value: `${formatCLP(r.utilidad)} (${formatPct(
            r.vendido > 0 ? (r.utilidad / r.vendido) * 100 : 0
          )})`,
          detail: "Neta, sin flete",
        },
        {
          label: "Cobrado a hoy",
          value: `${formatCLP(r.cobrado)} (${formatPct(
            r.vendido > 0 ? (r.cobrado / r.vendido) * 100 : 0
          )})`,
          detail: "Abonos recibidos, en cualquier fecha",
        },
        {
          label: "Utilidad percibida",
          value: formatCLP(r.utilidadPercibida),
          detail: "Proporcional a lo cobrado de cada nota",
        },
        {
          label: "Por cobrar",
          value: formatCLP(r.porCobrar),
          detail: `${formatCLP(r.porCobrarVencido)} vencido`,
          alerta: r.porCobrarVencido > 0,
        },
      ]
    : [
        {
          label: "Entró a caja",
          value: formatCLP(datos.caja.cobrado),
          detail: `${datos.caja.abonos} abono${
            datos.caja.abonos === 1 ? "" : "s"
          } en el período`,
        },
        {
          label: "Utilidad percibida",
          value: formatCLP(datos.caja.utilidadPercibida),
          detail: "La parte del margen que traía cada abono",
        },
        {
          label: "Por cobrar (total)",
          value: formatCLP(r.porCobrar),
          detail: `${formatCLP(r.porCobrarVencido)} vencido · todas las notas`,
          alerta: r.porCobrarVencido > 0,
        },
      ];

  return (
    <div className="flex flex-col gap-6">
      {sinNota.cantidad > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <strong>{sinNota.cantidad} facturas</strong> por{" "}
          {formatCLP(sinNota.monto)} no tienen nota de venta vinculada, así que
          no tienen costo conocido y quedan fuera de estos números.{" "}
          <Link href="/conciliacion" className="font-semibold underline">
            Vincularlas en Conciliación
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {LENTES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLente(l.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  lente === l.id
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Buscar
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Folio o cliente…"
              className={inputCls}
            />
          </label>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          {LENTES.find((l) => l.id === lente)?.ayuda}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {porVenta ? (
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Cobrado</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-right">Margen</th>
                <th className="px-4 py-3 text-right">Percibido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.visibles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No hay notas de venta en el período.
                  </td>
                </tr>
              ) : (
                datos.visibles.map((n) => {
                  const pagado = cobrado(n.cobros);
                  const pendiente = n.total - pagado;
                  const vencida = estaVencida(n, hoy);
                  return (
                    <tr
                      key={n.id}
                      className={`text-slate-700 ${n.anulada ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {n.folio}
                      </td>
                      <td className="px-4 py-3">{n.cliente}</td>
                      <td className="px-4 py-3">{formatFecha(n.fechaVenta)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(n.total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(pagado)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          pendiente > 0 ? "text-amber-700" : "text-slate-400"
                        }`}
                      >
                        {pendiente === 0 ? "—" : formatCLP(pendiente)}
                      </td>
                      <td
                        className={`px-4 py-3 ${
                          vencida ? "font-medium text-red-600" : ""
                        }`}
                      >
                        {formatFecha(n.vencimiento)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(n.margen)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCLP(utilidadPercibida(n))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha del pago</th>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Utilidad</th>
                <th className="px-4 py-3">Observación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.abonos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No entró dinero en el período.
                  </td>
                </tr>
              ) : (
                datos.abonos.map((a) => (
                  <tr key={a.cobro.id} className="text-slate-700">
                    <td className="px-4 py-3">{formatFecha(a.cobro.fecha)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {a.nota.folio}
                    </td>
                    <td className="px-4 py-3">{a.nota.cliente}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCLP(a.cobro.monto)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(a.utilidad)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {a.cobro.observacion ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: todo verde, y `/finanzas` aparece en el listado de rutas del build.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/finanzas
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Finanzas: ruta del dinero con lentes por venta y por caja"
```

---

### Task 7: Entrada "Finanzas" en el menú

**Files:**
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: la ruta `/finanzas` de Task 6.

Entra último a propósito: hasta acá `/finanzas` existe pero nadie llega a ella, así que ningún paso intermedio deja al usuario frente a una página a medias.

- [ ] **Step 1: Agregar el ícono**

En `src/components/sidebar.tsx`, después de `IconOrden` y antes de `IconProveedores`:

```tsx
const IconFinanzas = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M3 3v18h18" />
    <path d="m7 14 3-4 3 3 5-7" />
    <circle cx="10" cy="10" r="1" />
  </svg>
);
```

- [ ] **Step 2: Agregar la entrada al menú**

En el array `menu`, entre el grupo `Compras` y la entrada `Proveedores`:

```tsx
  { href: "/finanzas", label: "Finanzas", icon: IconFinanzas },
```

Queda de primer nivel, al mismo nivel que Compras y Proveedores, y aparece justo debajo del grupo Compras.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit --author="Elvis Rios <elriosmelo@gmail.com>" -m "Menú: entrada Finanzas debajo de Compras"
```

---

### Task 8: Aplicar migración a producción, verificar y deployar

**Files:**
- Sin cambios de código. Ejecución contra Supabase prod y Vercel.

**Interfaces:**
- Consumes: `supabase/migrations/023_pagos_nota_venta.sql` (Task 1) y todo el código de Tasks 2-7 commiteado.

- [ ] **Step 1: Aplicar la migración a Supabase prod**

Exportar `DB_PASSWORD` antes (está en la memoria del proyecto; **no commitearlo**).

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
  .then(() => c.query(fs.readFileSync('supabase/migrations/023_pagos_nota_venta.sql', 'utf8')))
  .then(() => { console.log('023 aplicada OK'); return c.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
"
```

Expected: `023 aplicada OK`

- [ ] **Step 2: Verificar el backfill**

```bash
node -e "
const { Client } = require('pg');
const c = new Client({ host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432, user: 'postgres.iiqfbedwoogadtrmrqfq', password: process.env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query(\`
    select
      (select count(*) from pagos_nota_venta) as abonos,
      (select count(*) from notas_venta where estado='pagada') as pagadas,
      (select count(*) from notas_venta nv where nv.estado='pagada'
         and not exists (select 1 from pagos_nota_venta p where p.nota_venta_id=nv.id)) as pagadas_sin_abono,
      (select count(*) from pg_trigger where tgname='pagos_nota_venta_sync_estado') as trigger_ok
  \`))
  .then((r) => { console.log(r.rows[0]); return c.end(); });
"
```

Expected: `abonos` = 15, `pagadas` = 15, `pagadas_sin_abono` = 0, `trigger_ok` = 1.

Si `pagadas_sin_abono` no es 0, revisar si esas notas tienen `total = 0` (el backfill las excluye a propósito, porque el `check (monto > 0)` las rechazaría).

- [ ] **Step 3: Verificar el trigger contra la base**

Prueba de ida y vuelta sobre una nota pendiente real, dentro de una transacción que se revierte para no ensuciar los datos:

```bash
node -e "
const { Client } = require('pg');
const c = new Client({ host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432, user: 'postgres.iiqfbedwoogadtrmrqfq', password: process.env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  await c.query('begin');
  const { rows: [n] } = await c.query(\"select id, total from notas_venta where estado='pendiente' and total > 1000 limit 1\");
  const est = async () => (await c.query('select estado from notas_venta where id=\$1', [n.id])).rows[0].estado;
  const { rows: [p1] } = await c.query('insert into pagos_nota_venta (nota_venta_id, monto, fecha) values (\$1, \$2, current_date) returning id', [n.id, Math.floor(n.total/2)]);
  console.log('parcial =>', await est());
  const { rows: [p2] } = await c.query('insert into pagos_nota_venta (nota_venta_id, monto, fecha) values (\$1, \$2, current_date) returning id', [n.id, n.total]);
  console.log('completo =>', await est());
  await c.query('delete from pagos_nota_venta where id=\$1', [p2.id]);
  console.log('borrado =>', await est());
  await c.query('rollback');
  await c.end();
})();
"
```

Expected exactamente:
```
parcial => pendiente
completo => pagada
borrado => pendiente
```

Si alguno no calza, **no deployar**: el trigger está mal y el estado de las notas quedaría inconsistente en producción.

- [ ] **Step 4: Suite completa local**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: todo verde.

- [ ] **Step 5: Push y deploy**

```bash
git push origin main
```

Vercel deploya solo desde `main`. Esperar a que el deployment quede en `● Ready`:

```bash
URL=$(vercel ls --yes 2>/dev/null | grep -oE "https://ferre-pooley-[a-z0-9]+-elvis-projects3.vercel.app" | head -1)
until vercel inspect "$URL" 2>&1 | grep -qE "● (Ready|Error|Canceled)"; do sleep 15; done
vercel inspect "$URL" 2>&1 | grep status
```

Expected: `● Ready`

- [ ] **Step 6: Re-correr el backfill (cierra la ventana entre migración y deploy)**

Entre aplicar la migración y que el deploy quede arriba, el código VIEJO sigue
vivo en Vercel, y su botón "Marcar pagada" sigue funcionando: hace un `update
notas_venta` y no sabe nada de la tabla nueva. Una nota marcada pagada en esa
ventana queda con `estado = 'pagada'` y cero abonos, y el backfill del Step 1 ya
pasó. Esa nota quedaría invisible como cobrada en `/finanzas` para siempre,
mostrando a la vez el badge "Pagada" y su total completo en la columna Saldo.

El bloque del backfill es idempotente (está guardado con `not exists`), así que
volver a correrlo después del deploy solo recoge lo que haya caído en la ventana:

```bash
node -e "
const { Client } = require('pg');
const c = new Client({ host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432, user: 'postgres.iiqfbedwoogadtrmrqfq', password: process.env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query(\`
    insert into pagos_nota_venta (nota_venta_id, monto, fecha, observacion)
    select nv.id, nv.total, nv.pagada_at::date, 'Migrado del estado anterior'
    from notas_venta nv
    where nv.estado = 'pagada' and nv.pagada_at is not null and nv.total > 0
      and not exists (select 1 from pagos_nota_venta p where p.nota_venta_id = nv.id)
    returning id
  \`))
  .then((r) => { console.log('recogidas en la ventana:', r.rowCount); return c.end(); });
"
```

Expected: `recogidas en la ventana: 0` si nadie alcanzó a marcar una nota pagada.
Cualquier número mayor también está bien: son las que se rescataron.

- [ ] **Step 7: Verificación en producción**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -L https://www.tulbless.cl/finanzas
```

Expected: `200`

Después, a mano en el navegador:
1. `/finanzas` muestra las dos lentes y los KPIs, y el aviso de facturas sin nota.
2. Entrar a una nota pendiente, registrar un cobro parcial: el saldo baja y el estado sigue "Pendiente de pago".
3. Registrar el saldo restante: la nota pasa a "Pagada".
4. Eliminar ese último cobro: vuelve a "Pendiente de pago".
5. `/notas-venta` muestra la columna Saldo con esos cambios reflejados.

---

## Notas de cierre

**Fuera de alcance, a propósito:** `/estados-cuenta` no se toca. Hoy calcula el saldo del cliente desde el estado binario de la nota; cuando existan los abonos ese saldo va a quedar grueso al lado del de `/finanzas`. Es una segunda pasada.

**Deuda conocida:** los 15 abonos del backfill llevan la fecha en que alguien apretó "Marcar pagada", no la fecha real del pago. La lente por caja es exacta de aquí en adelante y aproximada hacia atrás. Están marcados con `observacion = 'Migrado del estado anterior'` para poder distinguirlos.
