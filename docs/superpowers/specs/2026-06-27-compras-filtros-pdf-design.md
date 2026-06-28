# Compras: filtros + PDF del DTE recibido desde SII

Fecha: 2026-06-27

## Objetivo

En `/compras`:
1. Filtros (fecha, proveedor, tipo de documento) — igual que ventas.
2. Columna "Ver" que abre el PDF de la factura **recibida**, con su detalle de items, rotulado "Copia de factura recibida".
3. Si no se puede obtener el DTE del SII → error "no se puede obtener el detalle".

## Feasibility (confirmada 2026-06-27)

El flujo de descarga de DTE **recibidos** del SII (cert puro, sin clave tributaria) está validado en el script de producción `~/Proyectos/almacenguru/proceso_semanal/descargar_facturas_pfx.py`:

- `ORIGEN=RCP`, referencia/admin = `mipeAdminDocsRcp.cgi`.
- Secuencia: auth cert → GET `mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION=1&TIPO=4` → POST `mipeSelEmpresa.cgi` (DESDE_DONDE_URL url-encoded + RUT_EMP) → GET `mipeLaunchPage.cgi?OPCION=1&TIPO=4` → **POST `mipeAdminDocsRcp.cgi`** body `RUT_EMI=&ORIGEN=RCP&...&NUM_PAG=1&TPO_ARCHIVO=dte` (inicializa el módulo / token) → GET `mipeDownLoad.cgi?ORIGEN=RCP&...&DOWNLOAD=XML`.
- El XML compilado trae `<Detalle>` con `NmbItem/QtyItem/PrcItem` (items reales), mismo formato `SetDTE/Documento` que ventas.
- El parser `parseDte` de ventas funciona sin cambios (verificado contra XML recibido real en `proceso_semanal/xml_cial/`).
- Nota: el SII rate-limitea por IP ante muchas requests; el fetch on-demand + caché en Storage mantiene el volumen bajo.

Corrección a una hipótesis previa: NO requiere clave tributaria; el error anterior fue por usar `ORIGEN=RECV` y omitir el POST de init.

## Arquitectura (mirror de ventas)

### 1. Cliente SII — recibidos
- `src/lib/sii/mipe.ts`: nueva `descargarDteRecibidoXml({ fecha, folio, tipoDoc }): Promise<string | null>` con el flujo RCP de arriba; filtra el `<DTE>` por folio+tipo; `null` si no aparece.

### 2. PDF
- Generalizar el render de ventas: `src/lib/pdf/venta-pdf.tsx` expone `generarPdfDte(dte, { titulo, copia })`. `generarPdfVenta` queda como wrapper. Nueva `generarPdfFacturaRecibida(dte)` con banner "COPIA DE FACTURA RECIBIDA" y leyenda "Documento recibido — copia generada desde el SII, sin valor tributario".
- `parseDte` se reutiliza tal cual.

### 3. Route + caché
- `src/app/(app)/compras/[id]/pdf/route.ts` (GET, maxDuration 60): lee la compra (`compras_sii`: folio, tipo_doc, fecha_emision) con admin client → busca `compras-pdf/{id}.pdf` en Storage → miss: `descargarDteRecibidoXml` → `parseDte` → `generarPdfFacturaRecibida` → sube a Storage → stream. Errores: 404 "No se encontró el DTE en el SII", 502/503 SII.
- Bucket privado `compras-pdf`.

### 4. UI
- `src/app/(app)/compras/page.tsx` (server, ya trae datos) → nuevo Client Component `compras-tabla.tsx`: filtros client-side (fecha desde/hasta, proveedor texto → razon_social o rut_proveedor, tipo doc select) + tabla + totales (neto/iva/total) + columna "Ver" → `/compras/[id]/pdf`.

Sin migración SQL (datos ya existen; el bucket se crea en Storage).

## Errores
- DTE no encontrado en SII → 404 "No se encontró el DTE en el SII".
- SII rate limit (sesión sin cookies / 429) → 503 "SII ocupado, reintenta en unos minutos".

## Fuera de alcance
- Timbre PDF417. Pre-descarga en cron (on-demand + caché).

## Testing
- `parseDte` ya cubierto (sirve para recibidos, mismo formato).
- Manual: `/compras`, filtrar, "Ver" en un folio real → PDF con items, rótulo copia recibida; 2º click desde caché.
- Live del fetch RCP: verificar cuando el SII libere el rate-limit.
