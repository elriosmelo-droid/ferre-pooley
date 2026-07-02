# Notas de venta independientes de la cotización

**Fecha:** 2026-07-01
**Estado:** aprobado

## Problema

Hoy la nota de venta solo nace cuando el cliente acepta una cotización (RPC
`responder_cotizacion` la inserta automáticamente). No se puede crear una nota
de venta directa con su detalle, y aceptar una cotización obliga a generar la
nota aunque no se quiera.

## Decisiones

- **Aceptar una cotización ya NO crea nota de venta.** Solo marca `aceptada`,
  guarda firma/firmante y envía el aviso por correo.
- **Nota de venta se crea a mano** desde `/notas-venta/nueva`, con detalle
  completo por ítem (sku, descripción, cantidad, costo → margen, precio,
  flete unitario, descuento %), medios de pago y vendedor — mismo modelo que
  la cotización.
- **Acción "Pasar a nota de venta"** en el detalle de cotización, disponible
  en cualquier estado (borrador, enviada, aceptada…): copia cliente, ítems,
  medios de pago, vendedor y totales a una nota nueva y redirige a ella.
  Máximo una nota por cotización (unique existente).
- **Notas editables mientras `pendiente`** (todas, también las nacidas de
  cotización). Al pasar a pagada/anulada se congelan.
- La conciliación con facturas SII (`autoVincularVentas`, `/conciliacion`) no
  cambia: las notas manuales entran al cruce automático igual que las demás.

## Cambios

### Migración `009_notas_venta_independientes.sql`

1. `notas_venta.cotizacion_id`: quitar `not null` (se mantiene `unique`).
2. Nueva columna `notas_venta.vendedor text`; backfill desde la cotización de
   origen para las notas existentes.
3. Redefinir `responder_cotizacion`: rama `p_aceptar` solo actualiza la
   cotización (estado, firma, firmante, respondida_at). Sin insert en
   `notas_venta`. Se mantiene la forma del retorno
   `(resultado, nota_venta_folio, transicion)` con `nota_venta_folio` siempre
   null para no romper llamadas existentes.

### Server actions

- `crearNotaVenta` / `actualizarNotaVenta` en
  `src/app/(app)/notas-venta/actions.ts`, siguiendo el patrón de
  `cotizaciones/actions.ts`: validación de ítems, `calcularTotales`,
  `medio_pago` (array, mínimo 1), vendedor vía `resolverVendedor`.
  `actualizarNotaVenta` exige `estado = 'pendiente'` (check atómico con
  `.eq("estado", "pendiente")`).
- `pasarANotaVenta(cotizacionId)` en cotizaciones: inserta nota + ítems
  copiados en cualquier estado de la cotización; si ya existe nota para esa
  cotización devuelve error claro.

### UI

- `nota-venta-form.tsx` (patrón `cotizacion-form.tsx`): cliente, ítems con
  costo/precio/flete/descuento, checkboxes medios de pago, totales en vivo.
- `/notas-venta/nueva` + botón "Nueva nota de venta" en la lista.
- `/notas-venta/[id]/editar` + botón "Editar" en el detalle, visible solo si
  la nota está `pendiente`.
- Botón "Pasar a nota de venta" en detalle de cotización; si ya tiene nota,
  se muestra link a la nota en su lugar.
- Página pública de aceptación y correo de aviso: eliminar la mención al
  folio de nota creada; solo confirmar la aceptación.

## Fuera de alcance

- Match aproximado por monto en la conciliación (hoy es exacto; se ajustaría
  en `autoVincularVentas` si se pide).
- Cambios a estados de nota, PDFs, órdenes de compra.
