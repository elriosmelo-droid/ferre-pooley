-- Perfil vendedor con permisos por menú.
--
-- - perfiles.rol pasa a 'admin' | 'vendedor' y suma permisos jsonb
--   ({"cotizaciones":"escritura", ..., "ver_costos": true}).
-- - cotizaciones y notas_venta guardan su dueño (vendedor_id).
-- - RLS: el admin ve todo; el vendedor solo los módulos habilitados y, dentro
--   de ellos, solo sus documentos. Compras/OC/proveedores: solo admin.

-- Todo en una transacción: si algo falla, no queda la RLS a medias.
begin;

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

revoke all on function public.es_admin() from public;
revoke all on function public.puede(text, text) from public;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede(text, text) to authenticated;

-- 3. Dueño de cotizaciones y notas ------------------------------------------

alter table cotizaciones
  add column if not exists vendedor_id uuid
  references auth.users(id) on delete set null default auth.uid();
alter table notas_venta
  add column if not exists vendedor_id uuid
  references auth.users(id) on delete set null default auth.uid();

create index if not exists cotizaciones_vendedor_id_idx on cotizaciones (vendedor_id);
create index if not exists notas_venta_vendedor_id_idx on notas_venta (vendedor_id);

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

revoke all on function public.nota_es_propia(uuid) from public;
grant execute on function public.nota_es_propia(uuid) to authenticated;

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
-- Se borran TODAS las policies existentes de estas tablas (las "members" de
-- 012/016/019/023 y cualquier "auth all" que haya sobrevivido): las policies
-- permisivas se suman con OR, así que una vieja olvidada abriría todo. Esto
-- además deja la migración re-ejecutable.

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename = any (array[
      'clientes', 'productos', 'cotizaciones', 'cotizacion_items',
      'notas_venta', 'nota_venta_items', 'pagos_nota_venta', 'compras_sii',
      'ventas_sii', 'proveedores', 'ordenes_compra', 'orden_compra_items',
      'orden_compra_ediciones', 'correos'
    ])
  loop
    execute format('drop policy %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

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

commit;
