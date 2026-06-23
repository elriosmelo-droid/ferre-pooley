-- Descuento porcentual por línea + medio de pago en la cotización.
-- Aplicar a la DB de producción vía Node `pg` con conexión DIRECTA.

-- Medio de pago (uno por cotización; obligatorio en el formulario).
create type medio_pago as enum (
  'transferencia', 'credito', 'tarjeta', 'cheque', 'contado'
);

alter table cotizaciones add column medio_pago medio_pago;
alter table notas_venta add column medio_pago medio_pago;

-- Descuento porcentual (0–100) aplicado SOLO sobre el precio, no sobre el flete.
alter table cotizacion_items
  add column descuento integer not null default 0
  check (descuento between 0 and 100);
alter table nota_venta_items
  add column descuento integer not null default 0
  check (descuento between 0 and 100);

-- RPC actualizada: copia descuento por ítem y medio_pago a la nota de venta.
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
  v_nv notas_venta%rowtype;
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
    insert into notas_venta (cotizacion_id, cliente_id, flete, medio_pago, subtotal_neto, iva, total)
      values (v_cot.id, v_cot.cliente_id, v_cot.flete, v_cot.medio_pago, v_cot.subtotal_neto, v_cot.iva, v_cot.total)
      returning * into v_nv;
    insert into nota_venta_items (nota_venta_id, sku, descripcion, cantidad, costo, precio, flete, descuento, posicion)
      select v_nv.id, sku, descripcion, cantidad, costo, precio, flete, descuento, posicion
      from cotizacion_items where cotizacion_id = v_cot.id;
    return query select 'aceptada'::text, v_nv.folio, true;
  else
    update cotizaciones set estado = 'rechazada', respondida_at = now(),
      motivo_rechazo = p_motivo where id = v_cot.id;
    return query select 'rechazada'::text, null::text, true;
  end if;
end $$;

revoke execute on function responder_cotizacion(uuid, boolean, text, text, text) from public, anon, authenticated;
