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

-- Recalcula el estado y pagada_at de una nota específica en base a sus abonos.
-- Vive en la base y no en el server action para que dos personas registrando
-- abonos a la vez no puedan dejar el estado inconsistente: el `for update`
-- serializa por nota.
create or replace function public._recalc_estado_nota_venta(p_nota uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_estado nota_venta_estado;
  v_cobrado integer;
  v_ultima date;
begin
  select total, estado into v_total, v_estado
  from notas_venta where id = p_nota for update;
  if not found then
    return;
  end if;

  -- Una nota anulada no cambia de estado por abonos.
  if v_estado = 'anulada' then
    return;
  end if;

  select coalesce(sum(monto), 0), max(fecha)
  into v_cobrado, v_ultima
  from pagos_nota_venta where nota_venta_id = p_nota;

  if v_cobrado >= v_total then
    update notas_venta
    set estado = 'pagada', pagada_at = v_ultima::timestamptz
    where id = p_nota;
  else
    update notas_venta
    set estado = 'pendiente', pagada_at = null
    where id = p_nota;
  end if;
end $$;

-- Orquesta el recálculo de notas afectadas por cambios en pagos_nota_venta.
-- Si un UPDATE cambia nota_venta_id (mover un abono de una nota a otra),
-- ambas quedan obsoletas: la origen sin abonos (pero still 'pagada') y la
-- destino con abonos nuevos. El trigger recalcula ambas.
create or replace function public.sync_estado_nota_venta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Recalcular nota origen (old)
  if old.nota_venta_id is not null then
    perform public._recalc_estado_nota_venta(old.nota_venta_id);
  end if;

  -- Recalcular nota destino (new), solo si es distinta de la origen
  if new.nota_venta_id is not null
    and new.nota_venta_id is distinct from old.nota_venta_id then
    perform public._recalc_estado_nota_venta(new.nota_venta_id);
  end if;

  return null;
end $$;

drop trigger if exists pagos_nota_venta_sync_estado on pagos_nota_venta;
create trigger pagos_nota_venta_sync_estado
after insert or update or delete on pagos_nota_venta
for each row execute function public.sync_estado_nota_venta();
