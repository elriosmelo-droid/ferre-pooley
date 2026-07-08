-- Rol de usuario en perfiles. Por ahora todos son 'admin'; la columna queda
-- lista para roles no-admin en el futuro. El panel de administración de
-- usuarios se gatea a rol='admin'.

alter table perfiles
  add column if not exists rol text not null default 'admin'
  check (rol in ('admin', 'usuario'));

-- Backfill: asegura una fila de perfil (rol admin) para cada usuario existente
-- que todavía no la tenga, para que ninguno quede fuera del panel por no haber
-- guardado su perfil.
insert into perfiles (user_id, rol)
select id, 'admin' from auth.users
on conflict (user_id) do nothing;
