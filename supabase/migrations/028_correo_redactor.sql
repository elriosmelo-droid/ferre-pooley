-- 028: Redactor de correos tipo Gmail.
--
-- - perfiles.firma_html: firma propia de cada usuario (null = la de por defecto
--   con el logo, que se arma en la app).
-- - correos.cc / correos.cco: copias del correo saliente. `para` ya era text[].
--
-- Los buckets de Storage (correo-adjuntos, privado; correo-imagenes, público)
-- los crea la app la primera vez que se usan, con el service role.

alter table perfiles add column if not exists firma_html text;

alter table correos add column if not exists cc text[] not null default '{}';
alter table correos add column if not exists cco text[] not null default '{}';
