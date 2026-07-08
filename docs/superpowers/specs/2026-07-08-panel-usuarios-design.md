# Panel de administración de usuarios

## Objetivo

Permitir crear, listar y eliminar usuarios de la app desde un panel propio, sin
entrar a la consola de Supabase. Se introduce el concepto de rol: por ahora
todos los usuarios son `admin`, pero la columna queda lista para roles
no-admin futuros. El panel solo es visible/accesible para administradores.

## Decisiones

- **Alta de usuario:** email + contraseña inicial que fija el admin. El usuario
  queda activo al instante (`email_confirm: true`), sin correos de invitación.
- **Alcance:** listar + crear + eliminar. Sin reseteo de clave por ahora.
- **Roles:** columna `rol` en `perfiles` desde ya, gateando el panel a `admin`.

## Componentes

### 1. Migración `011_roles_usuarios.sql`
- `alter table perfiles add column rol text not null default 'admin'
  check (rol in ('admin','usuario'))`.
- Backfill: insertar una fila `perfiles` con `rol='admin'` para cada
  `auth.users` que no tenga perfil, para que ningún usuario existente quede
  fuera del panel por no haber guardado su perfil todavía.

### 2. Gating admin — `src/lib/auth/rol.ts`
- `getPerfilActual()`: devuelve `{ user, rol }` de la sesión actual (lee
  `perfiles.rol` del usuario logueado; RLS "own perfil" lo permite).
- `requireAdmin()`: usa lo anterior; si no hay sesión o `rol !== 'admin'`,
  hace `redirect`. Se usa en la página `/usuarios`.
- Las server actions re-verifican el rol antes de tocar el service role.

### 3. Página `/usuarios` (server component)
- `requireAdmin()` al entrar.
- Lista usuarios con `createAdminClient().auth.admin.listUsers()` y cruza con
  `perfiles` (nombre, rol) por `user_id`.
- Tabla: email · nombre · rol · creado · botón eliminar.
- Formulario de alta: email, contraseña (mín 6), nombre, rol (default `admin`).

### 4. Server actions — `src/app/(app)/usuarios/actions.ts`
Cada una re-verifica admin antes de usar el service role.
- `crearUsuario`: valida (email, password ≥ 6, nombre, rol) →
  `admin.auth.admin.createUser({ email, password, email_confirm: true })` →
  insertar `perfiles { user_id, nombre, rol }`. Email duplicado → error amable.
- `eliminarUsuario(id)`: rechaza si `id` es el propio usuario (evita
  auto-lockout) → `admin.auth.admin.deleteUser(id)`. El `on delete cascade` del
  FK de `perfiles` limpia el perfil.

### 5. Sidebar
- Nuevo link "Usuarios" visible solo si `esAdmin`. El layout lee el rol y lo
  pasa como prop a `<Sidebar />`.

## Seguridad
- `createAdminClient` (service role) solo en actions del panel, siempre después
  de verificar `rol === 'admin'`.
- La contraseña nunca se registra en logs.
- No se permite auto-eliminación.

## Fuera de alcance (YAGNI)
- Reseteo de contraseña, edición de rol de usuarios existentes, roles
  no-admin funcionales, invitación por correo.
