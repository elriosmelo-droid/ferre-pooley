-- Blindaje de RLS: dejar de confiar en "cualquier usuario autenticado".
--
-- Riesgo cubierto: el anon key es público (va al navegador). Si el signup de
-- Supabase está habilitado, un extraño puede registrarse, obtener el rol
-- `authenticated` y —con las policies antiguas `using (true)`— leer/escribir
-- TODA la data. Aquí gateamos el acceso a ser MIEMBRO (tener fila en perfiles),
-- y solo el service role (panel de usuarios) puede crear perfiles. Así un
-- registro pirata queda sin acceso a nada, aunque el signup siga abierto.

-- ¿El usuario actual es miembro provisionado? security definer para poder leer
-- perfiles sin quedar atrapado en su propia RLS.
create or replace function public.is_member()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (select 1 from perfiles where user_id = auth.uid());
$$;

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

-- Tablas de negocio: acceso solo a miembros.
do $$
declare
  t text;
  tablas text[] := array[
    'clientes', 'productos', 'cotizaciones', 'cotizacion_items',
    'notas_venta', 'nota_venta_items', 'compras_sii', 'ventas_sii',
    'proveedores', 'ordenes_compra', 'orden_compra_items'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists "auth all %1$s" on %1$s', t);
    execute format('drop policy if exists "members %1$s" on %1$s', t);
    execute format(
      'create policy "members %1$s" on %1$s for all to authenticated '
      'using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

-- perfiles: el usuario solo ve/edita su propia fila. NO puede crearla (solo el
-- service role provisiona usuarios), evitando la auto-provisión de un registro
-- pirata que lo convertiría en miembro.
drop policy if exists "own perfil" on perfiles;
drop policy if exists "perfil select own" on perfiles;
drop policy if exists "perfil update own" on perfiles;

create policy "perfil select own" on perfiles
  for select to authenticated using (auth.uid() = user_id);
create policy "perfil update own" on perfiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anti-escalada: un usuario no puede cambiarse el rol a sí mismo. Solo el
-- service role (o el owner en migraciones) puede tocar `rol`.
create or replace function public.perfiles_no_escalar_rol()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.rol is distinct from old.rol and current_user <> 'service_role' then
    raise exception 'No puedes cambiar tu rol';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_no_escalar_rol on perfiles;
create trigger perfiles_no_escalar_rol
  before update on perfiles
  for each row execute function public.perfiles_no_escalar_rol();
