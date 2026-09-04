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
    -- v_ultima es un date "en el aire" (sin zona). Convertirlo directo a
    -- timestamptz lo interpreta en UTC y la sesión de Supabase corre en UTC,
    -- así que una fecha '2026-09-03' quedaría en 2026-09-03T00:00:00Z, que la
    -- UI (formateada en America/Santiago, UTC-4/-3) muestra como el día
    -- anterior. `at time zone` sobre un timestamp SIN zona hace lo contrario:
    -- interpreta esa hora de pared como si fuera de Chile y la convierte a
    -- UTC, así que quede el mismo día al mostrarla en Chile. No "simplificar"
    -- de vuelta a `::timestamptz`.
    update notas_venta
    set estado = 'pagada',
      pagada_at = (v_ultima::timestamp at time zone 'America/Santiago')
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

-- `_recalc_estado_nota_venta` solo se dispara desde escrituras en
-- pagos_nota_venta, pero `actualizarNotaVenta` puede cambiar
-- notas_venta.total en una nota 'pendiente' (solo se permite editar
-- pendientes). Si el total baja por debajo de lo ya abonado, la nota debería
-- pasar a 'pagada' y no lo hace: queda 'pendiente' en el listado mientras el
-- bloque de cobros de la nota muestra saldo a favor del cliente.
create or replace function public.sync_estado_nota_venta_desde_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._recalc_estado_nota_venta(new.id);
  return null;
end $$;

-- Dos cuidados verificados con una réplica mínima del esquema antes de
-- aplicar esto (ver reporte de la tarea):
--
-- 1. Recursión: `update of total` dispara según las columnas MENCIONADAS en
--    el SET del UPDATE, no según cuáles cambiaron de valor. El UPDATE que
--    hace _recalc_estado_nota_venta solo menciona `estado` y `pagada_at`, así
--    que no vuelve a mencionar `total` y este trigger no se re-dispara. No
--    hace falta guarda adicional contra recursión.
-- 2. Autobloqueo: _recalc_estado_nota_venta hace `select ... for update`
--    sobre la misma fila de notas_venta que este UPDATE ya modificó. Los
--    locks de fila en Postgres son por transacción, no por sentencia: una
--    transacción puede volver a tomar `for update` sobre una fila que ella
--    misma ya tiene bloqueada sin quedar esperando a sí misma. Confirmado:
--    el UPDATE que dispara este trigger termina sin bloquearse.
drop trigger if exists notas_venta_sync_estado_total on notas_venta;
create trigger notas_venta_sync_estado_total
after update of total on notas_venta
for each row
when (old.total is distinct from new.total)
execute function public.sync_estado_nota_venta_desde_total();
