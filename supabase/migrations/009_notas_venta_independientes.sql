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
