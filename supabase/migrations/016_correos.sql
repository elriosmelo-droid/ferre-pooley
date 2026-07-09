-- Bandeja de correos entrantes recibidos vía Resend Inbound (webhook
-- email.received). El cuerpo/adjuntos se bajan de la API de Resend por su id.
create table if not exists correos (
  id uuid primary key default gen_random_uuid(),
  resend_id text not null unique,       -- id del correo recibido en Resend
  de text,                              -- remitente
  para text[] not null default '{}',    -- destinatarios
  asunto text,
  texto text,                           -- cuerpo plano
  html text,                            -- cuerpo HTML
  adjuntos jsonb not null default '[]', -- [{id, filename, content_type, size}]
  recibido_at timestamptz not null default now(),
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists correos_recibido_at_idx on correos (recibido_at desc);

alter table correos enable row level security;
-- Solo miembros (is_member) leen/gestionan. La inserción la hace el webhook con
-- el service role (salta RLS).
create policy "members correos" on correos
  for all to authenticated
  using (public.is_member()) with check (public.is_member());
