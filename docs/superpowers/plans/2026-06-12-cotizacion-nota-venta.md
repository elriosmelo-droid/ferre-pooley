# Cotizaciones → Notas de Venta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App completa de ferretería: cotizaciones con catálogo, envío por Resend (HTML + PDF), aceptación pública por token que genera nota de venta con estados de pago.

**Architecture:** Next.js 16 App Router (todo en Vercel) + Supabase (Postgres/Auth/RLS) + Resend. Server Actions para mutaciones; Route Handler para la aceptación pública con cliente service-role; snapshot de ítems en documentos; folios por secuencia Postgres.

**Tech Stack:** Next.js 16.2, React 19, Tailwind 4, @supabase/ssr, @supabase/supabase-js, resend, @react-email/components, @react-pdf/renderer, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-cotizacion-nota-venta-design.md`

---

## Convenciones

- Moneda CLP, enteros (sin decimales). IVA 19% redondeado con `Math.round`.
- Server Actions en `src/app/(app)/<modulo>/actions.ts`, páginas server components, formularios client components.
- Supabase: cliente browser (`createBrowserClient`), servidor (`createServerClient` con cookies), admin (`service_role`, solo en servidor para flujo público).
- Tests: vitest para lógica pura (`src/lib`). UI se valida manualmente + build.

## Estructura de archivos

```
supabase/migrations/001_schema.sql
src/lib/supabase/{client.ts,server.ts,admin.ts}
src/lib/{money.ts,totals.ts,database.types.ts}
src/middleware.ts
src/app/login/page.tsx
src/app/(app)/layout.tsx            ← sidebar con menús separados
src/app/(app)/dashboard/page.tsx
src/app/(app)/clientes/{page.tsx,actions.ts,cliente-form.tsx}
src/app/(app)/productos/{page.tsx,actions.ts,producto-form.tsx}
src/app/(app)/cotizaciones/{page.tsx,actions.ts}
src/app/(app)/cotizaciones/nueva/page.tsx
src/app/(app)/cotizaciones/[id]/{page.tsx,editar/page.tsx}
src/app/(app)/cotizaciones/cotizacion-form.tsx
src/app/(app)/notas-venta/{page.tsx,actions.ts}
src/app/(app)/notas-venta/[id]/page.tsx
src/app/(app)/perfil/{page.tsx,actions.ts}
src/app/cotizacion/[token]/{page.tsx,responder/route.ts}   ← público
src/lib/email/{cotizacion-email.tsx,aviso-respuesta-email.tsx,send.ts}
src/lib/pdf/cotizacion-pdf.tsx
.env.local.example
```

---

### Task 1: Dependencias y clientes Supabase

**Files:** Create `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`, `.env.local.example`. Modify `package.json`.

- [ ] `npm i @supabase/supabase-js @supabase/ssr resend @react-email/components @react-pdf/renderer zod && npm i -D vitest`
- [ ] `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM="Ferre Pooley <onboarding@resend.dev>"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
- [ ] Clientes estándar de `@supabase/ssr` (browser/server con cookies) y admin con `SUPABASE_SERVICE_ROLE_KEY` (import 'server-only').
- [ ] Commit.

### Task 2: Esquema SQL completo

**Files:** Create `supabase/migrations/001_schema.sql`.

- [ ] SQL completo (tablas, secuencias de folio, RLS, trigger de perfil):

```sql
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  correo text not null,
  telefono text,
  direccion text,
  created_at timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  descripcion text not null,
  costo integer not null default 0,
  precio integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence cotizacion_folio_seq;
create sequence nota_venta_folio_seq;

create type cotizacion_estado as enum ('borrador','enviada','aceptada','rechazada','vencida');
create type nota_venta_estado as enum ('pendiente','pagada','anulada');

create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default 'COT-' || lpad(nextval('cotizacion_folio_seq')::text, 4, '0'),
  cliente_id uuid not null references clientes(id),
  estado cotizacion_estado not null default 'borrador',
  fecha_validez date not null default (current_date + 30),
  flete integer not null default 0,
  subtotal_neto integer not null default 0,
  iva integer not null default 0,
  total integer not null default 0,
  token_aceptacion uuid not null unique default gen_random_uuid(),
  notas text,
  enviada_at timestamptz,
  respondida_at timestamptz,
  created_at timestamptz not null default now()
);

create table cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  producto_id uuid references productos(id),
  sku text not null default '',
  descripcion text not null,
  cantidad integer not null check (cantidad > 0),
  costo integer not null default 0,
  precio integer not null default 0,
  posicion integer not null default 0
);

create table notas_venta (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default 'NV-' || lpad(nextval('nota_venta_folio_seq')::text, 4, '0'),
  cotizacion_id uuid not null unique references cotizaciones(id),
  cliente_id uuid not null references clientes(id),
  estado nota_venta_estado not null default 'pendiente',
  flete integer not null default 0,
  subtotal_neto integer not null default 0,
  iva integer not null default 0,
  total integer not null default 0,
  pagada_at timestamptz,
  created_at timestamptz not null default now()
);

create table nota_venta_items (
  id uuid primary key default gen_random_uuid(),
  nota_venta_id uuid not null references notas_venta(id) on delete cascade,
  sku text not null default '',
  descripcion text not null,
  cantidad integer not null,
  costo integer not null default 0,
  precio integer not null default 0,
  posicion integer not null default 0
);

create table perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  razon_social text,
  rut_empresa text,
  direccion_empresa text,
  telefono_empresa text,
  correo_aviso text,
  created_at timestamptz not null default now()
);

-- RLS: todo requiere usuario autenticado; el flujo público usa service role
alter table clientes enable row level security;
alter table productos enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
alter table notas_venta enable row level security;
alter table nota_venta_items enable row level security;
alter table perfiles enable row level security;

create policy "auth all clientes" on clientes for all to authenticated using (true) with check (true);
create policy "auth all productos" on productos for all to authenticated using (true) with check (true);
create policy "auth all cotizaciones" on cotizaciones for all to authenticated using (true) with check (true);
create policy "auth all cotizacion_items" on cotizacion_items for all to authenticated using (true) with check (true);
create policy "auth all notas_venta" on notas_venta for all to authenticated using (true) with check (true);
create policy "auth all nota_venta_items" on nota_venta_items for all to authenticated using (true) with check (true);
create policy "own perfil" on perfiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Aceptación atómica: solo gana la primera transición desde 'enviada'
create or replace function responder_cotizacion(p_token uuid, p_aceptar boolean)
returns table (resultado text, nota_venta_folio text)
language plpgsql security definer set search_path = public as $$
declare
  v_cot cotizaciones%rowtype;
  v_nv notas_venta%rowtype;
begin
  select * into v_cot from cotizaciones where token_aceptacion = p_token for update;
  if not found then return query select 'no_existe'::text, null::text; return; end if;
  if v_cot.estado <> 'enviada' then return query select v_cot.estado::text, null::text; return; end if;
  if v_cot.fecha_validez < current_date then
    update cotizaciones set estado = 'vencida' where id = v_cot.id;
    return query select 'vencida'::text, null::text; return;
  end if;
  if p_aceptar then
    update cotizaciones set estado = 'aceptada', respondida_at = now() where id = v_cot.id;
    insert into notas_venta (cotizacion_id, cliente_id, flete, subtotal_neto, iva, total)
      values (v_cot.id, v_cot.cliente_id, v_cot.flete, v_cot.subtotal_neto, v_cot.iva, v_cot.total)
      returning * into v_nv;
    insert into nota_venta_items (nota_venta_id, sku, descripcion, cantidad, costo, precio, posicion)
      select v_nv.id, sku, descripcion, cantidad, costo, precio, posicion
      from cotizacion_items where cotizacion_id = v_cot.id;
    return query select 'aceptada'::text, v_nv.folio;
  else
    update cotizaciones set estado = 'rechazada', respondida_at = now() where id = v_cot.id;
    return query select 'rechazada'::text, null::text;
  end if;
end $$;
revoke execute on function responder_cotizacion(uuid, boolean) from public, anon, authenticated;
```
- [ ] Aplicar en Supabase (SQL Editor o `supabase db push`). Verificar tablas creadas.
- [ ] Commit.

### Task 3: Lógica de totales con tests (TDD)

**Files:** Create `src/lib/money.ts`, `src/lib/totals.ts`, `src/lib/totals.test.ts`, `vitest.config.ts`. Modify `package.json` (script `test`).

- [ ] Test primero:
```ts
import { describe, expect, it } from "vitest";
import { calcularTotales } from "./totals";

describe("calcularTotales", () => {
  it("suma items, flete y aplica IVA 19%", () => {
    const r = calcularTotales(
      [{ cantidad: 50, precio: 5890 }, { cantidad: 30, precio: 4990 }],
      25000
    );
    expect(r).toEqual({ subtotalNeto: 444200, flete: 25000, iva: 89148, total: 558348 });
  });
  it("redondea IVA al peso", () => {
    const r = calcularTotales([{ cantidad: 1, precio: 99 }], 0);
    expect(r.iva).toBe(19); // 18.81 → 19
    expect(r.total).toBe(118);
  });
  it("sin items", () => {
    expect(calcularTotales([], 0)).toEqual({ subtotalNeto: 0, flete: 0, iva: 0, total: 0 });
  });
});
```
- [ ] Verificar que falla; implementar:
```ts
export type ItemCalculable = { cantidad: number; precio: number };
export const IVA_RATE = 0.19;

export function calcularTotales(items: ItemCalculable[], flete: number) {
  const subtotalNeto = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const iva = Math.round((subtotalNeto + flete) * IVA_RATE);
  return { subtotalNeto, flete, iva, total: subtotalNeto + flete + iva };
}
```
- [ ] `src/lib/money.ts`: `formatCLP(n)` con `Intl.NumberFormat("es-CL", {style:"currency", currency:"CLP"})`.
- [ ] `npm test` verde. Commit.

### Task 4: Auth (login + middleware)

**Files:** Create `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`.

- [ ] Middleware con `@supabase/ssr`: refresca sesión; sin sesión → redirect `/login` (excepto `/login`, `/cotizacion/*`, assets).
- [ ] Login: formulario email/password → `supabase.auth.signInWithPassword` (server action), redirect `/dashboard`. Error visible.
- [ ] Usuario se crea manualmente en Supabase Dashboard (un solo usuario por ahora).
- [ ] Commit.

### Task 5: Shell de la app (sidebar)

**Files:** Create `src/app/(app)/layout.tsx`, `src/components/sidebar.tsx`. Modify `src/app/page.tsx` (redirect a `/dashboard`).

- [ ] Sidebar fija: Dashboard, Cotizaciones, Notas de Venta, Productos, Clientes, Mi Perfil + botón cerrar sesión. Item activo resaltado (usePathname).
- [ ] Layout `(app)` verifica sesión servidor-side; sin sesión redirect `/login`.
- [ ] Commit.

### Task 6: Clientes CRUD

**Files:** Create `src/app/(app)/clientes/{page.tsx,actions.ts,cliente-form.tsx}`.

- [ ] Listado con búsqueda por nombre/RUT. Crear/editar en modal o página: nombre*, RUT, correo*, teléfono, dirección (zod). Eliminar con confirmación (bloquear si tiene documentos: FK falla → mensaje claro).
- [ ] Commit.

### Task 7: Productos CRUD

**Files:** Create `src/app/(app)/productos/{page.tsx,actions.ts,producto-form.tsx}`.

- [ ] Listado con búsqueda por SKU/descripción, columnas sku, descripción, costo, precio, margen %. Crear/editar: sku* único, descripción*, costo*, precio* (enteros ≥ 0). Desactivar en vez de eliminar si está referenciado.
- [ ] Commit.

### Task 8: Cotizaciones — listado y formulario

**Files:** Create `src/app/(app)/cotizaciones/{page.tsx,actions.ts,cotizacion-form.tsx}`, `nueva/page.tsx`, `[id]/page.tsx`, `[id]/editar/page.tsx`.

- [ ] Listado: folio, cliente, fecha, total, estado (badge color), filtro por estado. Botón Nueva.
- [ ] Formulario (client component): selector cliente (combobox con búsqueda), fecha validez (default +30d), tabla ítems con autocompletado de productos por sku/descripción (al elegir copia sku/descripcion/costo/precio) o fila libre; cantidad editable; quitar fila; campo flete; totales en vivo con `calcularTotales`; notas.
- [ ] Acciones: `guardarCotizacion` (insert/update cotización + reemplazo de items + totales server-side, solo si estado=borrador), `duplicarCotizacion` (copia como borrador nuevo).
- [ ] Detalle `[id]`: vista completa con costo y margen (interno), acciones según estado: Editar/Enviar (borrador), Duplicar, link público (enviada+).
- [ ] Commit por sub-parte (listado, form, detalle).

### Task 9: PDF + correo + enviar cotización

**Files:** Create `src/lib/pdf/cotizacion-pdf.tsx`, `src/lib/email/{cotizacion-email.tsx,send.ts}`. Modify `src/app/(app)/cotizaciones/actions.ts`.

- [ ] PDF con @react-pdf/renderer: encabezado empresa (desde perfil), datos cliente, folio/fechas, tabla SKU/descripción/cantidad/precio/total (SIN costo), subtotal neto + flete + IVA + total, validez. `renderToBuffer`.
- [ ] Email React Email: resumen + botón "Aceptar cotización" → `${NEXT_PUBLIC_APP_URL}/cotizacion/${token}` + texto "también puedes rechazarla desde el mismo enlace".
- [ ] `enviarCotizacion(id)`: valida borrador con ≥1 ítem y cliente con correo → genera PDF → `resend.emails.send` con adjunto → si OK: estado='enviada', enviada_at=now(). Si Resend falla: queda borrador, error visible.
- [ ] Commit.

### Task 10: Página pública de aceptación

**Files:** Create `src/app/cotizacion/[token]/page.tsx`, `src/app/cotizacion/[token]/responder/route.ts`, `src/lib/email/aviso-respuesta-email.tsx`.

- [ ] Page (server, cliente admin): busca por token. Muestra cotización SIN costos, con estado: enviada y vigente → botones Aceptar/Rechazar (POST a route); aceptada → "Cotización aceptada ✓"; rechazada/vencida/no existe → mensaje correspondiente sin filtrar datos. Si vigencia pasó, mostrar vencida.
- [ ] Route handler POST: valida body `{accion: 'aceptar'|'rechazar'}` → `rpc('responder_cotizacion')` con cliente admin → si aceptada, correo de aviso interno (perfil.correo_aviso o email del usuario) con folio NV → redirect a la misma página (estado actualizado). Rate-limit básico por token (la función ya es idempotente).
- [ ] Commit.

### Task 11: Notas de venta

**Files:** Create `src/app/(app)/notas-venta/{page.tsx,actions.ts}`, `[id]/page.tsx`.

- [ ] Listado: folio, cliente, cotización origen (link), fecha, total, estado pago (badge), filtro estado.
- [ ] Detalle: ítems snapshot (con costo/margen interno), totales, link a cotización. Acciones: Marcar pagada (pagada_at=now()), Anular (confirmación). Pagada/anulada son finales.
- [ ] Commit.

### Task 12: Dashboard + Perfil

**Files:** Create `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/perfil/{page.tsx,actions.ts}`.

- [ ] Dashboard: tarjetas — cotizaciones enviadas (esperando respuesta), aceptadas del mes, notas pendientes de pago (monto por cobrar), ventas del mes (pagadas). Listado últimas 5 cotizaciones y 5 notas.
- [ ] Perfil: upsert en `perfiles` — nombre, razón social, RUT, dirección, teléfono, correo_aviso. Estos datos alimentan PDF y correos.
- [ ] Commit.

### Task 13: Deploy y smoke test

- [ ] `npm run build` y `npm test` verdes localmente.
- [ ] Variables en Vercel (Settings → Environment Variables): las 6 de `.env.local.example` con valores reales; `NEXT_PUBLIC_APP_URL` = dominio Vercel.
- [ ] Push → deploy. Smoke test producción: login → crear cliente/producto → cotización → enviar correo real → abrir link → aceptar → verificar NV creada + correo aviso → marcar pagada.
- [ ] Commit final.

## Self-review

- Spec cubierta: flujo estados (T2 enum + T9/T10 transiciones), token público (T2/T10), snapshot ítems (T2 fn + T8 copia), IVA desglosado (T3), costo interno oculto (T9 PDF / T10 página), folios secuencia (T2), correo HTML+PDF (T9), aviso interno (T10), estados pago NV (T11), menús separados (T5), perfil (T12), errores Resend/carrera/token (T9/T2/T10).
- Sin TBD. Tipos consistentes: `calcularTotales(items, flete)` usada en T8/T9; campos SQL = columnas usadas en actions.
