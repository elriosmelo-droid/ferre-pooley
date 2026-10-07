# Estado de pago conectado, saldo al pie y filtros nuevos

Fecha: 2026-10-06

## Contexto

El cliente pidió: más filtros en Compras y Ventas, ver cuánto falta por cobrar
al final de Notas de venta, y poder cambiar el estado de pago (pagada /
pendiente) desde la lista y desde dentro de la venta, con los datos conectados
y sin valores sueltos. Finanzas queda como está.

## Hallazgos

- `notas_venta.estado` lo calcula un trigger (migración 023) desde
  `pagos_nota_venta`. Cambiar el estado equivale a cambiar los abonos.
- El pie de `/notas-venta` ya suma el saldo (`totalesListadoNotas`), pero sin
  etiqueta ni cifra de "cobrado".
- El badge de estado en la lista es de solo lectura.
- Compras filtra por fecha, proveedor, tipo, forma de pago y búsqueda. Ventas
  filtra por fecha, cliente, tipo y búsqueda.

## Decisiones

- El estado sigue siendo consecuencia de los cobros (opción A). No hay estado
  editable a mano: rompería Finanzas y la utilidad percibida.
- "Estado de pago" se refiere solo al pago, no al estado de la cotización.
- Sin migración SQL. Dashboard, estados de cuenta, conciliación y Finanzas no se
  tocan porque leen la misma columna `estado`.

## 1. Estado de pago conectado

Componente de badge con menú, usado en la lista y en el encabezado de la nota.

- **Marcar pagada**: diálogo con medio de pago y fecha (por defecto hoy). Crea un
  abono por el saldo exacto (`total - cobrado`). Si ya hay abonos parciales,
  cubre solo lo que falta. No hace nada si el saldo es <= 0.
- **Volver a pendiente**: confirmación y borrado del último abono. Si la nota
  tiene varios abonos, avisa cuántos hay. Si no hay abonos, no se ofrece.
- Una nota anulada no muestra el menú.
- Server actions `marcarNotaPagada` y `volverNotaAPendiente` en
  `notas-venta/actions.ts`, apoyadas en el registro de abonos existente. Ambas
  validan membresía y revalidan `/notas-venta`, `/notas-venta/[id]`,
  `/cotizaciones` y `/finanzas`.
- Cálculo del monto a abonar como función pura en `src/lib/cobros.ts`
  (`montoParaSaldar`), con tests.

**Herencia a la cotización**: la fila de cotización muestra, solo lectura, el
estado de pago de su nota vinculada ("Pagada", "Saldo $X", "Sin nota").

## 2. Cuánto falta por cobrar

- Pie de Notas de venta con tres cifras etiquetadas: **Total · Cobrado · Falta
  por cobrar**, sobre las filas filtradas. Las anuladas no suman.
- Cifra adicional "de eso, vencido" con el vencimiento calculado
  (`estaVencida`).
- Chip "Falta por cobrar" sobre la lista, con el mismo número.
- `totalesListadoNotas` incorpora el vencido sin cambiar las bases existentes
  (bruto con bruto; margen neto nunca se divide por total bruto).

## 3. Filtros nuevos (client-side)

- **Compras**: estado de pago (pagadas / con deuda / sin cargar), vencidas, rango
  de monto, atajos de mes. (Sin filtro por orden de compra: `compras_sii` no
  tiene vínculo con ellas.)
- **Ventas**: cobrada / con saldo / vencida, con o sin nota vinculada, rango de
  monto, atajos de mes.
- **Notas de venta**: vencidas, rango de monto, vendedor.
- Atajos de mes reutilizan `ultimosMeses` de `src/lib/fecha`.

## Fuera de alcance

Estado de la cotización, edición manual del estado, cambios en Finanzas,
migraciones.

## Pruebas

- Unitarias en `src/lib/cobros.test.ts`: monto para saldar con y sin abonos
  parciales, saldo a favor, total cero, vencido en el pie.
- Verificación en navegador: lista, detalle de nota, pie y cotizaciones.
