-- Historial de ediciones posteriores al envío de una orden de compra.
--
-- Hasta ahora una OC solo se podía editar en borrador. El negocio necesita
-- corregir órdenes ya enviadas al proveedor (precio mal tipeado, cantidad,
-- ítem que faltaba), pero esa edición cambia un documento que el proveedor ya
-- tiene en su correo: queda registrada con quién la hizo y por qué.
create table orden_compra_ediciones (
  id uuid primary key default gen_random_uuid(),
  orden_compra_id uuid not null
    references ordenes_compra(id) on delete cascade,
  editado_por text,                  -- nombre del perfil, o correo de respaldo
  motivo text not null,              -- obligatorio: qué se cambió y por qué
  estado_al_editar orden_compra_estado not null,
  created_at timestamptz not null default now()
);

create index orden_compra_ediciones_orden_idx
  on orden_compra_ediciones (orden_compra_id, created_at desc);

alter table orden_compra_ediciones enable row level security;

create policy "members orden_compra_ediciones" on orden_compra_ediciones
  for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- Última vez que se le reenvió el PDF corregido al proveedor. El reenvío es
-- manual (botón en el detalle): editar no dispara correo solo.
alter table ordenes_compra
  add column if not exists reenviada_at timestamptz;
