# Ventas: filtros + PDF del DTE desde SII

Fecha: 2026-06-27

## Objetivo

En el menú `/ventas`:
1. Filtrar las facturas emitidas (rango de fechas, cliente, tipo de documento).
2. Columna "Ver" por fila que abre el PDF de la factura.
3. El PDF se arma con el **DTE real emitido**, descargado del portal SII MIPE (incluye el detalle de items que el RCV no guarda).

## Feasibility (confirmada por spike 2026-06-27)

- Auth al SII MIPE con el cert TULBLESS: OK (200, cert aceptado).
- TULBLESS emite vía MIPE gratuito → sus DTE están en MIPE.
- `mipeDownLoad.cgi?ORIGEN=ENV...DOWNLOAD=XML` devuelve el XML completo del DTE: encabezado, emisor, receptor, **líneas de detalle** (`NmbItem`, `QtyItem`, `PrcItem`), montos y TED.
- `DOWNLOAD=PDF` responde 503 → MIPE no entrega PDF directo; se renderiza desde el XML.
- Decisión: PDF **con detalle, sin timbre PDF417** (sin dependencias extra).

## Arquitectura

### 1. Filtros + columna Ver (UI)

- `src/app/(app)/ventas/page.tsx` (server): sigue trayendo las ventas de Supabase como hoy, pero delega el render a un Client Component.
- Nuevo `src/app/(app)/ventas/ventas-tabla.tsx` (client): recibe las ventas por prop, mantiene estado de filtros y renderiza barra de filtros + tabla + totales.
  - Filtros (client-side, sin round-trip):
    - Rango de fechas: dos `<input type="date">` (desde/hasta) sobre `fecha_emision`.
    - Cliente: `<input>` texto, match case-insensitive sobre `razon_social` o `rut_cliente`.
    - Tipo de documento: `<select>` con las opciones de `TIPO_DOC` + "Todos".
  - Totales (cantidad + suma) recalculan sobre las filas filtradas.
  - Columna nueva "Ver" al final: `<a href="/ventas/{id}/pdf" target="_blank">Ver PDF</a>`.
- Constantes compartidas (`TIPO_DOC`, `formatFecha`) se mueven a donde las consuma el client component.

### 2. Cliente SII MIPE (server-only)

- Nuevo `src/lib/sii/mipe.ts`, escrito nativo en este repo (ayekantun solo fue referencia, no se copian sus archivos).
- Reutiliza el patrón de auth/cookies de `rcv.ts` (cert PEM desde env, `https.Agent`, cookie jar).
- Función `descargarDteEmitidoXml({ fecha, folio, tipoDoc }): Promise<string | null>`:
  1. Auth `CAutInicio.cgi` con cert (referencia `mipeAdminDocsEmi.cgi`).
  2. `mipeSelEmpresa.cgi` (GET + POST `RUT_EMP=SII_RUT_EMPRESA`).
  3. `mipeLaunchPage.cgi?OPCION=1&TIPO=4`.
  4. `mipeDownLoad.cgi?ORIGEN=ENV&FEC_DESDE=fecha&FEC_HASTA=fecha&...&DOWNLOAD=XML`.
  5. Parsear el `SetDTE`, devolver el bloque `<DTE>` cuyo `<Folio>` y `<TipoDTE>` calzan; `null` si no aparece.
- Env vars (ya en Vercel): `SII_CERT_PEM_B64`, `SII_KEY_PEM_B64`, `SII_RUT_TITULAR`, `SII_RUT_EMPRESA`. Para correr local hay que ponerlas también en `.env.local`.

### 3. Parse XML + render PDF

- `src/lib/sii/dte-xml.ts`: parser mínimo del DTE (regex, igual estilo que `rcv.ts`) → objeto tipado:
  `{ tipoDte, folio, fchEmis, emisor{rut,rznSoc,giro,dir}, receptor{rut,rznSoc,giro,dir}, items[{nombre,cantidad,precio,monto}], montoNeto, iva, exento, total }`.
- `src/lib/pdf/venta-pdf.tsx`: componente `@react-pdf/renderer` (mismo estilo/logo que `orden-compra-pdf.tsx`): encabezado TULBLESS + recuadro tipo/folio, datos del receptor, tabla de items, totales. Sin PDF417.

### 4. Ruta + caché en Supabase Storage

- `src/app/(app)/ventas/[id]/pdf/route.ts` (GET, `maxDuration = 60`):
  1. Lee la venta por `id` (Supabase): obtiene `folio`, `tipo_doc`, `fecha_emision`.
  2. Caché: intenta bajar `ventas-pdf/{id}.pdf` de Supabase Storage (bucket privado, service role). Si existe → stream `application/pdf` inline.
  3. Miss: `descargarDteEmitidoXml` → si `null`, responde 404 con mensaje ("la factura no está en MIPE"). Si OK → parse XML → render PDF → sube a Storage `{id}.pdf` → stream.
- Bucket `ventas-pdf` privado, creado a mano en Supabase (no expuesto público; solo lo sirve la ruta con service role).
- Sin migración SQL (datos ya existen; el bucket se crea en el dashboard de Storage).

## Manejo de errores

- Auth SII falla / cert rechazado → 502, log; la UI abre pestaña con mensaje de error legible.
- Folio no encontrado en MIPE → 404 "No se encontró el DTE en el SII".
- 429 del SII (rate limit) → 503 "SII ocupado, reintenta en unos minutos". El caché reduce reintentos.

## Fuera de alcance (YAGNI)

- Timbre PDF417 / PDF cedible legal.
- Pre-descarga masiva en el cron (se baja on-demand y se cachea).
- Filtro por estado de vínculo o por monto (no pedidos).

## Testing

- Unit: parser `dte-xml.ts` contra el XML real del spike (`dte21.xml`: folio 21, item TERCIADO ESTRUCTURAL x936, total 17.487.288).
- Manual: levantar `/ventas`, filtrar, click "Ver PDF" de un folio real, confirmar PDF con detalle. Verificar que el 2º click sirve desde caché (rápido).
