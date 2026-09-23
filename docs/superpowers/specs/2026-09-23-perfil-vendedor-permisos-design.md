# Perfil vendedor con permisos por menú

## Objetivo

Incorporar el rol **Vendedor**. Al asignarlo, el admin marca en una grilla a qué
menús puede entrar y con qué nivel (sin acceso / lectura / lectura+escritura),
más un check para ver costos y márgenes. El vendedor solo ve **sus propios**
registros; el admin le va desbloqueando menús. El bloqueo es real: sidebar,
URL directa, server actions y RLS.

## Decisiones

- **Roles:** `admin | vendedor` (el rol `usuario` actual se migra a `vendedor`).
  El admin tiene todo; los permisos de la grilla solo aplican al vendedor.
- **Permisos por usuario**, no por rol: dos vendedores pueden tener accesos
  distintos. Se editan al crear y después (botón Editar).
- **Datos propios:** el vendedor ve solo cotizaciones/notas donde es dueño
  (`vendedor_id`) y lo derivado de ellas (facturas, cobros, estados de cuenta,
  dashboard, finanzas). Clientes y productos son catálogo compartido.
- **Compras, Órdenes de Compra, Proveedores y Usuarios:** siempre solo admin,
  no aparecen en la grilla.
- **Costos:** check `ver_costos` aparte. Se aplica a nivel de app (el server no
  envía costo/margen/flete al cliente). Limitación aceptada: RLS filtra filas,
  no columnas; las columnas de costo siguen siendo legibles vía API directa con
  el JWT del vendedor. Blindaje por columnas queda como fase 2.
- **Enforcement en BD (RLS) + app**, siguiendo el patrón de `is_member()`.

## Componentes

### 1. Migración `024_perfil_vendedor_permisos.sql`

**perfiles**
- `update perfiles set rol = 'vendedor' where rol = 'usuario'`; cambiar el
  check a `rol in ('admin','vendedor')`.
- `add column permisos jsonb not null default '{}'`.
- Extender el trigger `perfiles_no_escalar_rol` para que tampoco permita
  cambiar `permisos` salvo `service_role`.

**Dueño de documentos**
- `cotizaciones.vendedor_id` y `notas_venta.vendedor_id`:
  `uuid references auth.users(id) on delete set null default auth.uid()`,
  con índice.
- Backfill: enlazar por `vendedor` (texto) = `perfiles.nombre` o = email de
  `auth.users`. Los que no calcen quedan `null` (visibles solo para admin).
  Estado actual en prod: todos los registros son de admins
  (`Victor Pooley`, `elriosmelo@gmail.com`, 5 cotizaciones sin vendedor).
- La columna texto `vendedor` se mantiene (snapshot del nombre para PDF).

**Funciones** (`security definer`, `stable`, `search_path = public, pg_temp`,
execute solo a `authenticated`):
- `es_admin() returns boolean`: fila en perfiles con `rol = 'admin'`.
- `puede(modulo text, nivel text) returns boolean`: `es_admin()` o
  (`rol = 'vendedor'` y `permisos->>modulo` cumple el nivel;
  `'escritura'` implica `'lectura'`).
- `ver_costos() returns boolean`: admin o `permisos->>'ver_costos' = 'true'`.

**Policies** (reemplazan las `members <tabla>`; se separa `select` de
`insert/update/delete`):

| Tabla | Lectura | Escritura |
|---|---|---|
| `cotizaciones` | `es_admin()` o (`puede('cotizaciones','lectura')` y `vendedor_id = auth.uid()`) | `es_admin()` o (`puede('cotizaciones','escritura')` y `vendedor_id = auth.uid()`) — también en `with check` |
| `cotizacion_items` | vía `exists` sobre la cotización padre con la regla de lectura | ídem con regla de escritura |
| `notas_venta` | ídem con módulo `notas_venta` | ídem |
| `nota_venta_items`, `pagos_nota_venta` | vía nota padre | vía nota padre |
| `ventas_sii` | `es_admin()` o ((`puede('ventas','lectura')` o `puede('conciliacion','lectura')` o `puede('estados_cuenta','lectura')` o `puede('dashboard','lectura')` o `puede('finanzas','lectura')`) y `nota_venta_id` apunta a una nota propia) | solo `es_admin()` |
| `clientes` | `es_admin()` o `puede` en cualquiera de `clientes`, `cotizaciones`, `notas_venta`, `estados_cuenta` | `es_admin()` o `puede('clientes','escritura')` |
| `productos` | `es_admin()` o `puede` en cualquiera de `productos`, `cotizaciones`, `notas_venta` | `es_admin()` o `puede('productos','escritura')` |
| `correos` | `es_admin()` o `puede('correos','lectura')` | `es_admin()` o `puede('correos','escritura')` |
| `compras_sii`, `ordenes_compra`, `orden_compra_items`, `orden_compra_ediciones`, `proveedores` | `es_admin()` | `es_admin()` |
| `perfiles` | sin cambios (solo su fila; admin opera vía service role) | sin cambios + trigger extendido |

Las rutas de sistema (`/api/sii`, `/api/inbound`, aviso de vencidas) usan
service role y no se ven afectadas. La cotización pública `/cotizacion/[token]`
tampoco cambia.

La migración la aplica el usuario en el SQL Editor de Supabase (no hay
`DATABASE_URL` en `.env.local`).

### 2. Catálogo y lógica — `src/lib/auth/permisos.ts`

- `MODULOS`: arreglo único `{ clave, label, ruta, escritura: boolean }`:

  | clave | label | ruta | admite escritura |
  |---|---|---|---|
  | `dashboard` | Dashboard | `/dashboard` | no |
  | `cotizaciones` | Cotizaciones | `/cotizaciones` | sí |
  | `notas_venta` | Notas de Venta | `/notas-venta` | sí |
  | `ventas` | Ventas (facturas) | `/ventas` | no |
  | `conciliacion` | Conciliación | `/conciliacion` | no |
  | `clientes` | Clientes | `/clientes` | sí |
  | `estados_cuenta` | Estados de Cuenta | `/estados-cuenta` | no |
  | `productos` | Productos | `/productos` | sí |
  | `finanzas` | Finanzas | `/finanzas` | no |
  | `correos` | Correos | `/correos` | sí |

- Tipos `Nivel = 'lectura' | 'escritura'`, `Permisos = Partial<Record<Clave,
  Nivel>> & { ver_costos?: boolean }`.
- `permisosSchema` (zod): solo claves del catálogo, nivel válido, `escritura`
  rechazado en módulos que no la admiten.
- `tienePermiso(perfil, clave, nivel)`: pura; admin → `true`.
- `puedeVerCostos(perfil)`: pura.
- `primeraRutaPermitida(perfil)`: ruta del primer módulo con lectura, o
  `/sin-acceso`.
- `PERMISOS_DEFAULT_VENDEDOR`: cotizaciones y notas_venta en escritura,
  clientes y productos en lectura, `ver_costos: false`.

### 3. Sesión y guards — `src/lib/auth/rol.ts`

- `Rol = 'admin' | 'vendedor'`; `PerfilActual` suma `permisos`.
- `getPerfilActual()` lee `rol, permisos` (se envuelve en `cache()` de React
  para no repetir la consulta en layout + página).
- `requirePermiso(clave, nivel)`: sin sesión → `/login`; sin permiso →
  `redirect(primeraRutaPermitida(perfil))`.
- `checkPermiso(clave, nivel)`: para server actions; devuelve el perfil o
  `null`, y la action retorna `{ error: 'No tienes permiso para esta acción.' }`.
- `requireAdmin()` se mantiene para `/usuarios`, `/compras`,
  `/ordenes-compra`, `/proveedores`.

### 4. Aplicación de guards

- `page.tsx` de cada módulo del catálogo: `requirePermiso(clave, 'lectura')`.
- Páginas `nueva`/`nuevo`/`editar` y todas las server actions de escritura
  de esos módulos: `'escritura'`.
- Actions de sistema dentro de módulos de lectura (sincronizar SII en
  `/ventas`, editar vencimiento en `/estados-cuenta`): `requireAdmin` /
  chequeo admin.
- Rutas PDF (`cotizaciones/[id]/pdf`, `ventas/[id]/pdf`,
  `estados-cuenta/[id]/pdf`): `lectura`; si la consulta vuelve vacía por RLS →
  404.
- `/compras`, `/ordenes-compra`, `/proveedores` (páginas, PDFs y actions):
  admin.
- Crear cotización/nota: `vendedor_id` lo pone el default de la BD; el form
  nunca lo envía. El texto `vendedor` sigue siendo el nombre del perfil.
- Nueva página `/sin-acceso`: "Aún no tienes módulos habilitados. Contacta al
  administrador."

### 5. Costos (`ver_costos`)

Sin el permiso, el server omite costo, margen, utilidad y flete de lo que envía
al cliente en: formulario y detalle de cotización y nota de venta, tabla y
formulario de productos, dashboard (paneles de márgenes / resumen financiero) y
finanzas (utilidad percibida/por percibir). Al editar un ítem, el costo
existente se preserva en el server (el vendedor no lo sobrescribe con vacío).

### 6. UI de usuarios

- Form compartido `usuario-form.tsx` (crear y editar):
  - Select rol `Admin | Vendedor`.
  - Con Vendedor aparece la grilla: una fila por módulo del catálogo con radios
    *Sin acceso / Lectura / Lectura+escritura* (la última deshabilitada si el
    módulo no admite escritura) y el check "Ver costos, márgenes y flete".
    Al elegir Vendedor se precarga `PERMISOS_DEFAULT_VENDEDOR`.
  - Con Admin la grilla se oculta.
  - Los permisos viajan como un campo oculto JSON; la action los valida con
    `permisosSchema`.
- Tabla: columna Rol muestra `Vendedor · N módulos`; botón **Editar** por fila
  (no en la propia) que abre el form precargado.
- Action `actualizarUsuario(id, …)`: solo admin; usa service role; impide
  quitarse el rol admin a uno mismo y dejar el sistema sin admins.

### 7. Sidebar

- `Sidebar` recibe `permisos` + `esAdmin` en lugar de solo `esAdmin`.
- Cada ítem se asocia a su clave del catálogo; grupo Compras, Proveedores y
  Usuarios solo para admin. Un grupo sin ítems visibles se oculta entero.
- El contador de correos sin leer solo se consulta si puede ver correos.

## Casos borde

- Vendedor sin permisos → `/sin-acceso` al entrar.
- Cambio de permisos aplica en la siguiente navegación (se leen por request).
- Cambiar admin ↔ vendedor conserva el jsonb; con admin se ignora.
- Registros históricos con `vendedor_id null` → solo admin.
- Un vendedor con acceso de lectura a cotizaciones no ve botones de
  crear/editar/eliminar ni puede ejecutar las actions.

## Pruebas

- Vitest (`src/lib/auth/permisos.test.ts`): `tienePermiso` (admin, vendedor,
  escritura implica lectura, módulo ausente), `permisosSchema` (clave
  desconocida, escritura en módulo solo-lectura), `primeraRutaPermitida`,
  `puedeVerCostos`.
- Manual con usuario vendedor de prueba: sidebar filtrado, URL directa a
  módulo no habilitado y a `/compras` redirige, PDF ajeno → 404, costos
  ocultos sin `ver_costos`, y consulta directa con el JWT del vendedor
  (supabase-js en script) sin acceso a `compras_sii` ni a notas ajenas.

## Fuera de alcance

- Blindaje de columnas de costo a nivel BD (fase 2).
- Roles adicionales o plantillas de permisos reutilizables.
- Reasignar documentos de un vendedor a otro.
