# Plazos de pago, vencimiento y aviso a Victor

## Objetivo

Mostrar, por factura, el plazo de pago y el vencimiento (que vienen en el DTE),
tanto en el menú de Ventas como en el estado de cuenta. Avisar por correo a
Victor, una sola vez, cuando una factura vence y sigue impaga. Reparar lo ya
cargado (backfill) y que de ahí en adelante sea automático.

## Origen del dato

El RCV (`ventas_sii`) NO trae vencimiento; vive en el DTE (`IdDoc`): `FmaPago`
(1 contado, 2 crédito, 3 canje), `FchVenc`, `TermPagoDias`. Se obtiene bajando
el DTE (ya se hace para los PDF) y guardándolo en `ventas_sii`.

## Componentes

### 1. `parseDte` (src/lib/sii/dte-xml.ts)
Agregar `idDoc: { fmaPago, fchVenc, termPagoDias }`.

### 2. Migración 014 — `ventas_sii`
`forma_pago int`, `term_pago_dias int`, `fecha_vencimiento date`,
`venc_procesado boolean not null default false`, `venc_notificado_at timestamptz`.

### 3. Precache de vencimientos (src/lib/sii/precache-vencimientos.ts)
`precachearVencimientos(max)`: toma facturas/ND (33/34/56) con
`venc_procesado=false` y `fecha_emision` no nula (más recientes primero, tope
por corrida), baja el DTE, parsea y guarda `forma_pago`, `term_pago_dias`,
`fecha_vencimiento`, `venc_procesado=true`.
- `fecha_vencimiento` = `FchVenc`; si no, `fecha_emision + TermPagoDias`;
  contado o sin plazo → `null`.
- Error transitorio (429/red) → deja `venc_procesado=false` y corta; "sin DTE"
  definitivo → marca procesado para no reintentar en vano.

### 4. Endpoints
- Se llama a `precachearVencimientos(40)` dentro del cron de ventas
  (`/api/sii/sync-ventas`).
- `/api/sii/precache-vencimientos` (secret, maxDuration 300): solo el precache,
  para backfill manual en lotes sin re-correr el RCV.
- `/api/sii/avisos-vencimiento` (secret, cron diario): facturas con
  `fecha_vencimiento < hoy`, impagas (sin nota, o nota `pendiente`) y
  `venc_notificado_at` nulo → email a Victor (vpooleyf@outlook.com, fijo) con
  la lista → marca `venc_notificado_at`. Aviso una sola vez.
- `vercel.json`: cron de `/api/sii/avisos-vencimiento`.

### 5. Lógica estado de cuenta (src/lib/estado-cuenta.ts)
Las filas incluyen `vencimiento`, `plazoLabel` ("30 días"/"Contado"/"—") y
`vencida` (vencimiento < hoy y factura/ND pendiente). `hoy` se pasa como
parámetro (función pura, testeable).

### 6. UI
- Estado de cuenta (página y PDF): columnas **Plazo** y **Vencimiento**; fila
  vencida impaga en rojo.
- Menú Ventas: columna **Vencimiento** (con plazo).

## Backfill
Tras el deploy: bajar `SII_SYNC_SECRET` con `vercel env pull` y llamar en bucle
`/api/sii/precache-vencimientos?secret=…` hasta que no queden facturas sin
procesar (cada corrida ~40, acotado por el rate-limit del SII).

## Seguridad / notas
- Endpoints SII protegidos por `SII_SYNC_SECRET` (patrón existente).
- Solo facturas/ND vencen; NC no.
- Impaga = sin nota vinculada o nota `pendiente` (anulada y pagada se excluyen).
