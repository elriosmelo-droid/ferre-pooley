# Estado de cuenta por cliente

## Objetivo

Ver, por cliente, todos sus documentos del SII (facturas, notas de crédito y
débito) con su estado de pago, y un saldo pendiente. Descargable en PDF para
enviárselo al cliente y que se ponga al día.

## Decisiones

- **Documentos:** todos los del SII del cliente (por RUT, desde `ventas_sii`).
- **Pago:** viene de la nota de venta vinculada (`notas_venta.venta_sii_id` →
  `estado`). Factura/ND sin nota → se asume **Pendiente** y suma al saldo. NC =
  crédito, resta, sin estado de pago.
- **PDF:** membrete de empresa + datos del cliente + tabla + saldo.

## Modelo de datos (existente)

- `ventas_sii`: docs SII por `rut_cliente`, `tipo_doc` (33/34 factura, 56 ND,
  61 NC), `folio`, `fecha_emision`, `monto_total`.
- `notas_venta`: `cliente_id`, `venta_sii_id`, `estado`
  (`pendiente`|`pagada`|`anulada`).
- `clientes`: `nombre`, `rut`.
- Match cliente ↔ SII por `normalizarRut` (formatos distintos).

No requiere migración: toda la data ya existe.

## Componentes

### 1. Lógica compartida — `src/lib/estado-cuenta.ts`
`construirEstadoCuenta(cliente, ventasSii, notas)` → filas + totales. Única
fuente de verdad, la usan la página y el PDF.
- Fila por doc: `{ fecha, tipo, folio, monto, esCredito, estadoPago }`.
  - `estadoPago` de factura/ND: estado de la nota vinculada, o `'pendiente'` si
    no hay nota. NC: `null` (crédito).
- Totales:
  - `facturado` = Σ monto de 33/34/56 que no estén anuladas.
  - `creditos` = Σ monto de 61.
  - `pagado` = Σ monto de 33/34/56 con nota `pagada`.
  - `saldo` = `facturado − creditos − pagado`. Si < 0 → "saldo a favor".
- Anuladas: se listan con badge pero no entran a los totales.

### 2. `/estados-cuenta` (server)
Lista buscable de clientes (nombre + RUT). Link a `/estados-cuenta/[id]`.

### 3. `/estados-cuenta/[id]` (server)
Carga cliente, `ventas_sii` filtradas por RUT normalizado, y `notas_venta` del
cliente. Llama a `construirEstadoCuenta`. Muestra tabla + tarjeta de totales +
botón "Descargar PDF" (link a la ruta PDF). Badge de estado reutiliza estilos
de `NotaEstadoBadge`.

### 4. `/estados-cuenta/[id]/pdf` (GET)
Guard de membresía (`getPerfilActual`, como las rutas PDF de ventas/compras).
Mismo cálculo → `@react-pdf/renderer` con `EMPRESA` + `LOGO_DATA_URI` + datos
del cliente + tabla + saldo. Patrón de `orden-compra-pdf.tsx`.

### 5. Sidebar
Grupo colapsable "Clientes" (como Ventas/Compras): `Clientes`,
`Estados de Cuenta`.

## Seguridad
- Todo bajo `(app)` → middleware exige sesión; RLS por membresía ya vigente.
- La ruta PDF usa el cliente autenticado (no service role); si necesita saltar
  RLS por Storage no aplica (se genera al vuelo, sin caché).

## Fuera de alcance (YAGNI)
- Marcar pagos directo sobre facturas SII sin nota (tabla de pagos).
- Envío del PDF por correo al cliente (por ahora solo descarga).
- Caché del PDF en Storage.
