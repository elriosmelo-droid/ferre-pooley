# Ruta del dinero: cobros y utilidad percibida

Fecha: 2026-09-03

## Problema

Hoy el sistema sabe cuánto se vendió y cuánto margen dejó cada nota, pero no
sabe cuánta de esa plata entró efectivamente a caja. Una nota está `pagada` o
`pendiente`, sin punto medio, y la fecha que guarda (`pagada_at`) es cuándo
alguien apretó el botón, no cuándo llegó el dinero.

El requerimiento del cliente (docx "SOLICITUDES SISTEMA ADMINISTRATIVO Y
FINANCIERO TULBLESS SPA") lo plantea con un ejemplo: se vendieron $84.000.000
en junio con 10% de utilidad a 30 días; cuánto de esa utilidad ya está en caja.
Es una conciliación del crédito otorgado a los clientes.

## Decisiones tomadas

- Los clientes **abonan parcial**: hace falta registrar cada pago, no un
  booleano.
- Los pagos se registran **contra la nota de venta**, no contra la factura del
  SII, porque la nota es donde vive el costo y por tanto la utilidad.
- `notas_venta.estado` **se mantiene automáticamente** desde los pagos, en vez
  de pasar a ser un campo derivado en el código. Así el dashboard,
  `/estados-cuenta`, `/conciliacion` y el badge del listado siguen funcionando
  sin tocarse.
- La utilidad percibida se atribuye **proporcional** al cobro.

## Estado de los datos al momento de diseñar

Conteos reales sobre producción (2026-09-03):

- 31 notas de venta: 15 pagadas, 15 pendientes, 1 anulada.
- Las 15 pagadas tienen `pagada_at`, así que el backfill no pierde ninguna.
- 2 notas sin factura del SII vinculada.
- 1 nota con 2 o más facturas.
- 17 de 47 facturas del SII sin nota vinculada.
- 29 facturas a crédito, 2 contado, 16 sin dato de forma de pago.

Los dos números que condicionan el diseño son el de las 2 notas sin factura
(quedan sin vencimiento) y el de las 17 facturas sin nota (quedan fuera del
cálculo entero).

## Modelo de datos

### Tabla `pagos_nota_venta`

| campo | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `nota_venta_id` | uuid not null | FK a `notas_venta`, `on delete cascade` |
| `monto` | integer not null | `check (monto > 0)` |
| `fecha` | date not null | Cuándo llegó la plata. La escribe el usuario |
| `medio_pago` | `medio_pago` | Enum ya existente, opcional |
| `observacion` | text | Nº de transferencia, banco, etc. |
| `created_by` | uuid | `auth.users`, quién lo registró |
| `created_at` | timestamptz not null | `default now()` |

Índice por `nota_venta_id` (se lee siempre agrupado por nota) y por `fecha`
(la lente "por caja" filtra por rango de fechas).

RLS con `is_member()`, igual que el resto de las tablas.

`fecha` y `created_at` son campos distintos a propósito: uno es cuándo entró el
dinero y el otro cuándo se registró. Confundirlos es justamente el defecto que
tiene `pagada_at` hoy.

### Mantención automática de `notas_venta.estado`

Un trigger sobre `pagos_nota_venta` (insert, update, delete) recalcula la nota:

- `sum(monto) >= notas_venta.total` → `estado = 'pagada'`,
  `pagada_at` = la fecha del abono más reciente.
- en otro caso → `estado = 'pendiente'`, `pagada_at = null`.
- `estado = 'anulada'` no se toca nunca.

La transición vive en la base y no en el server action para que dos personas
registrando abonos a la vez no puedan dejar el estado inconsistente.

### Backfill

Cada nota en estado `pagada` genera un abono por su `total` con
`fecha = pagada_at::date` y `observacion = 'Migrado del estado anterior'`.

Esa marca es deliberada: `pagada_at` es la fecha del click, no la del pago, así
que la lente "por caja" es exacta de aquí en adelante y aproximada hacia atrás.
El dato real nunca se guardó y no hay forma de recuperarlo.

## Registrar un cobro

En `/notas-venta/[id]`, donde hoy está el botón "Marcar pagada", va un bloque de
cobros:

- Una línea por abono: fecha, monto, medio, observación, y acción para borrarlo.
- Resumen: **Total · Cobrado · Saldo**.
- Formulario de abono con **monto prellenado con el saldo** y **fecha
  prellenada con hoy**, ambos editables.

El caso normal (el cliente pagó todo) sigue siendo un click. El abono parcial es
escribir otro monto.

El botón "Marcar pagada" **se elimina**. Dejarlo al lado del formulario sería
dejar abierta la puerta que desincroniza los números: alguien marca pagada sin
registrar el abono y `/finanzas` deja de cuadrar con el listado.

Borrar un abono devuelve la nota a `pendiente` si con eso queda saldo. Es la
corrección de un error de tipeo, y es la razón de que `created_by` exista.

### Validaciones

- `monto > 0`.
- No se puede abonar sobre una nota `anulada`.
- **Sí se permite pasarse del total.** El cliente puede pagar de más, o puede
  haber una nota de crédito de por medio. Bloquearlo obliga a inventar cifras
  para poder guardar. El saldo queda negativo y se muestra como "a favor del
  cliente".

### Listado de notas de venta

Se agrega columna **Saldo**. Sin eso habría que entrar nota por nota para saber
quién debe, y el listado es donde se mira.

## Página `/finanzas`

Entrada nueva en la barra lateral, primer nivel, debajo del grupo Compras.

Dos lentes sobre los mismos datos, con selector arriba:

### Lente "Por venta"

Filtra por fecha de la **nota**. Responde el ejemplo del docx: de lo vendido en
junio, cuánto se ha cobrado y cuánta utilidad entró.

- Vendido
- Utilidad generada (monto y %)
- Cobrado a hoy (monto y % del vendido)
- **Utilidad percibida**
- Por cobrar, separado en al día y vencido

### Lente "Por caja"

Filtra por fecha del **abono**. Cuánta plata entró en el período y qué utilidad
traía encima, sin importar cuándo se vendió. Es la ruta del dinero propiamente
tal.

### Atribución de la utilidad

Cada peso cobrado arrastra su parte proporcional del margen de la nota:

```
utilidad de un abono = margen de la nota × (monto del abono ÷ total de la nota)
```

En la lente "por venta" se suman los abonos de cada nota, lo que equivale a
`margen × (cobrado ÷ total)`. En la lente "por caja" se atribuye abono por
abono, porque los abonos de una misma nota pueden caer en meses distintos y
cada mes debe llevarse solo la utilidad que le corresponde. Es la misma regla
aplicada en dos niveles de agregación, no dos reglas.

Proporcional porque no hay forma de saber qué línea del documento pagó el
cliente. Cualquier otra regla sería inventada.

El margen sale de `calcularMargen`, que excluye el flete a propósito (el flete
es un costo traspasado, no parte del margen).

### Bases de comparación

`total` de la nota es bruto (con IVA y con flete): es lo que el cliente debe y
lo que efectivamente se cobra, así que es la base correcta para saldo y
proporción de cobro. El margen, en cambio, es neto y sin flete.

Son bases distintas y no se mezclan: la proporción `abono ÷ total` es
bruto contra bruto, y el resultado se aplica sobre el margen neto. En pantalla,
"Vendido" es bruto y "Utilidad" es neta; se rotulan para que nadie intente
dividir uno por el otro y le salga un porcentaje que no significa nada.

### Notas anuladas

Quedan fuera de `/finanzas` completo: no suman a vendido, ni a utilidad, ni a
por cobrar. Una venta anulada no es plata que se espere. Sus abonos, si
existieran por haberse anulado después de cobrar, tampoco entran en la lente
por caja; ese caso se resuelve con una nota de crédito, no acá.

### Tabla

Una fila por nota: cliente, fecha, total, cobrado, saldo, vencimiento, margen,
margen percibido. Filtros client-side, igual que el resto de las pantallas.

### Vencimiento

Sale de la factura del SII vinculada, reusando `vencimientoEfectivo` de
`src/lib/estado-cuenta.ts` (respeta el override manual y los defaults de 30 días
crédito / 5 días contado). Con varias facturas, la más temprana. Sin factura, la
nota no tiene vencimiento y no cuenta como vencida.

### Declaración de lo que falta

Arriba y visible: "N facturas por $X no tienen nota vinculada y quedan fuera de
este cálculo", con link a `/conciliacion`.

Son 17 de 47 hoy. Sin nota vinculada no hay costo conocido, así que no tienen
margen ni entran en el por cobrar. Es preferible un número que declara lo que le
falta antes que uno que se ve completo y no lo está.

## Testing

Lógica pura en `src/lib/cobros.ts`, con tests unitarios:

- saldo y estado derivado a partir de un conjunto de abonos
- atribución proporcional del margen, abono por abono y acumulada
- agregados de cada lente, incluyendo una nota con abonos en meses distintos
- bordes: nota en total $0 (la proporción no puede dividir por cero), saldo
  negativo, nota anulada, nota sin factura vinculada, nota sin abonos

El trigger se verifica con un SQL que se corre contra la base después de migrar:
abonar parcial deja `pendiente`, completar deja `pagada`, borrar el último
abono vuelve a `pendiente`, y una nota `anulada` no cambia de estado.

## Orden de trabajo

1. Migración: tabla, índices, RLS, trigger, backfill.
2. `src/lib/cobros.ts` con sus tests.
3. Registrar cobros en el detalle de la nota.
4. Columna Saldo en el listado de notas.
5. Página `/finanzas`.
6. Entrada en el menú.

Cada paso deja la aplicación funcionando. El menú entra último para que nadie
llegue a una página a medias.

## Fuera de alcance

`/estados-cuenta` no se toca. Hoy calcula el saldo del cliente desde el estado
binario de la nota; cuando existan los abonos ese saldo va a quedar grueso al
lado del de `/finanzas`. Es una segunda pasada, y meterla acá haría el cambio
más grande de lo que ya es.
