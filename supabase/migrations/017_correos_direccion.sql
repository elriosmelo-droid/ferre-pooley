-- Dirección del correo: 'entrante' (recibido vía Resend Inbound) o 'saliente'
-- (enviado desde la app por Resend). Permite las bandejas Recibidos/Enviados.
alter table correos
  add column if not exists direccion text not null default 'entrante'
  check (direccion in ('entrante', 'saliente'));

create index if not exists correos_direccion_idx on correos (direccion, recibido_at desc);
