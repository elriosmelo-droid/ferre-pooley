# Gastos operacionales y resultado

Fecha: 2026-09-04

## Problema

`/finanzas` muestra la utilidad de cada venta, pero esa utilidad es **margen de
mercadería**: precio de venta menos costo de lo que se vendió. No descuenta
sueldos, arriendo, luz, combustible ni comisiones bancarias, así que no responde
la pregunta que importa al final del mes: *¿ganamos o perdimos?*

Los gastos operacionales no existen en el sistema. Algunos llegan como factura
del SII y quedan mezclados con la mercadería en `compras_sii`; los más grandes
—sueldos y arriendo— no llegan por ninguna parte.

## Estado de los datos al momento de diseñar

Los 31 proveedores en `compras_sii` (2026-09-04) se parten en dos:

- **Mercadería:** SONAMU TRADING $103M, AUSIN HNOS $67M, COLLICURA $21M,
  DISTRIBUIDORA DE MATERIALES $15M, MELON, MORTEROS TX, ÁRIDOS BIO-BIO. Su
  costo ya está cargado en los ítems de cada nota de venta.
- **Gastos que sí llegan por el SII:** BANCO BICE $338.955 en 4 meses,
  ACNSOLUCIONES $250.000 en 8 documentos, ESMAX y Morales y Torres
  (combustible), cuatro proveedores de alimentación por $325.370 juntos,
  Transbank $26.957, certificación electrónica $19.028.
- **Lo que no está en ninguna parte:** sueldos, arriendo, luz, agua.

Hay además ~$5,7 millones en empresas de transporte. El flete es un costo
traspasado que ya va dentro del precio de venta, así que contarlo de nuevo como
gasto lo restaría dos veces.

## Decisiones tomadas

- Los gastos se **cargan a mano**. No se clasifican las compras del SII.
- Se cubren **todos los gastos operacionales**, fijos y variables, no solo los
  fijos.
- El modelo es una **plantilla con vigencia** que se aplica sola mes a mes,
  más un **ajuste puntual** para el mes que se sale de lo presupuestado.
- Se muestran **dos resultados**: devengado y percibido.
- Las tarjetas de resultado van **siempre en neto** y no reaccionan al switch
  Con IVA / Sin IVA.

## Modelo de datos

### Tabla `gastos_operacionales`

La plantilla. Una fila por gasto vigente.

| campo | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `nombre` | text not null | "Arriendo local", "Sueldo bodega" |
| `categoria` | enum `categoria_gasto` | personal, local, servicios, vehiculos, financieros, otros |
| `monto` | integer not null | `check (monto > 0)`. Lo que efectivamente se paga al mes |
| `afecto_iva` | boolean not null | `default false` |
| `vigente_desde` | date not null | primer día del mes, `check (extract(day from vigente_desde) = 1)` |
| `vigente_hasta` | date | null = sigue vigente; primer día del último mes que aplica |
| `observacion` | text | |
| `created_by` | uuid | `auth.users`, `default auth.uid()` |
| `created_at` | timestamptz not null | `default now()` |

`check (vigente_hasta is null or vigente_hasta >= vigente_desde)`.

Índice por `vigente_desde` y `vigente_hasta`: la consulta siempre es "qué está
vigente en tal mes".

### Tabla `gastos_ajustes`

El override de un mes puntual. Solo existe cuando ese mes se sale de la
plantilla.

| campo | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `gasto_id` | uuid not null | FK a `gastos_operacionales`, `on delete cascade` |
| `mes` | date not null | primer día del mes, mismo check |
| `monto` | integer not null | `check (monto >= 0)`: un mes en cero es válido |
| `observacion` | text | |
| `created_by`, `created_at` | | |

`unique (gasto_id, mes)`.

RLS con `is_member()` en ambas, igual que el resto de las tablas.

Sin backfill: las tablas nacen vacías.

### Por qué el IVA es un campo y no un supuesto

El margen se calcula sobre montos netos. Cargar los gastos en bruto restaría
peras a manzanas y daría un resultado peor que el real, porque el IVA de un
gasto se recupera como crédito fiscal y no es costo de la empresa.

El usuario escribe lo que **paga**, que es lo que sabe, y marca si ese monto
lleva IVA. El sistema netea cuando corresponde. Los sueldos no llevan; el
combustible y el internet sí.

### Por qué la vigencia es mensual y no por fecha

Un gasto fijo es mensual: no existe un arriendo que empieza el 17. Se guarda el
primer día del mes y se compara por mes.

Cuando un monto cambia —suben el arriendo en marzo— se cierra el registro viejo
con `vigente_hasta` y se abre uno nuevo. Así un reporte de enero sigue mostrando
el arriendo de enero. Editar el monto en su lugar reescribiría el pasado y los
meses ya revisados dejarían de cuadrar.

## Cálculo

### Monto efectivo de un gasto en un mes

1. El gasto aplica si `vigente_desde <= mes` y (`vigente_hasta` es null o
   `vigente_hasta >= mes`).
2. Si existe un ajuste para ese gasto y ese mes, manda el ajuste.
3. Si no, manda el monto de la plantilla.
4. El monto neto es `monto` cuando `afecto_iva` es falso, y
   `round(monto / (1 + IVA_RATE))` cuando es verdadero, reusando `IVA_RATE` de
   `src/lib/totals.ts` en vez de escribir 1,19 a mano.

Un ajuste cuyo mes cae fuera de la vigencia del gasto **se ignora**: el paso 1
decide si el gasto aplica, y solo entonces se busca su ajuste. Un ajuste
huérfano puede quedar al acortar la vigencia de un gasto que ya tenía ajustes;
no se borra, queda inerte y vuelve a valer si la vigencia se reabre.

### Rango parcial

El filtro de Situación permite cualquier rango, pero los gastos son mensuales.

Regla única, sin casos especiales: **cada mes que el rango toca aporta la
fracción de ese mes que está dentro del rango.** La fracción es
`días del mes dentro del rango / días del mes`, contando ambos extremos: del 1
al 15 de septiembre son 15 días de 30, o sea 0,5. Un mes completo aporta 1. Con
los chips de mes —el caso normal— la fracción es exactamente 1 y no hay
prorrateo.

Un rango con `hasta` anterior a `desde` no toca ningún mes y da cero, sin
error: es un estado transitorio mientras el usuario escribe las fechas.

Cuando alguna fracción es distinta de 1, la tarjeta lo declara en pantalla.

### Resultados

```
resultado devengado = utilidad generada del período − gastos del período
resultado percibido = utilidad percibida del período − gastos del período
```

El devengado responde "¿el negocio da?"; el percibido, "¿la caja aguantó?".

Ambos en **neto**, siempre. No reaccionan al switch Con IVA / Sin IVA por la
misma razón por la que la utilidad no reacciona: el margen ya es neto, y
restarle gastos brutos mezclaría bases. La banda se rotula "(neto)" para que la
excepción sea visible en vez de sorprender.

## Pantalla `/finanzas/gastos`

Sub-ruta de Finanzas, alcanzable con un botón desde `/finanzas`. El menú no
cambia: la entrada "Finanzas" ya marca activo en sus sub-rutas.

Selector de mes arriba (los mismos chips que el resto del sistema) y la lista
efectiva de ese mes, **agrupada por categoría con subtotal por grupo** y total
del mes:

```
Gastos operacionales     ( sep 26 ) ( ago 26 ) ( jul 26 )   Total: $4.850.000

  PERSONAL
    Sueldo Victor          $1.200.000  sin IVA             [ajustar]
    Sueldo bodega            $850.000  sin IVA             [ajustar]
  LOCAL
    Arriendo local         $1.500.000  sin IVA             [ajustar]
    Luz                      $180.000  con IVA  ajustado   [quitar ajuste]
```

Un gasto ajustado ese mes queda marcado, para ver de un vistazo qué salió de la
plantilla.

**Ajustar** escribe el monto real de ese mes; **quitar ajuste** lo devuelve a la
plantilla. Ninguna de las dos toca otros meses.

Abajo, la plantilla: agregar, editar y cerrar gastos. Los cerrados se ocultan
detrás de un "ver terminados", porque la lista útil es la vigente.

### Avisos en pantalla

Dos, fijos, porque son los errores caros y no se pueden dejar a un manual:

1. *"No cargues aquí la mercadería que compras para vender. Su costo ya está en
   cada nota de venta y restarlo otra vez haría desaparecer utilidad que sí
   existe."*
2. Sobre transportes: solo debería entrar el flete que **no** se le traspasa al
   cliente, porque el que se cobra ya va dentro del precio de venta.

### Borrar

Un gasto con ajustes, o cuyo `vigente_desde` es de un mes ya pasado, no se
borra: se cierra con `vigente_hasta`. Borrarlo cambiaría reportes de meses ya
revisados.

## Integración con `/finanzas`

Banda nueva **"Resultado (neto)"** debajo de Situación, siguiendo su mismo
filtro:

- **Gastos del período**
- **Resultado devengado**
- **Resultado percibido**

Cuando el rango implica prorrateo, la banda lo dice.

## Testing

Lógica pura en `src/lib/gastos.ts`, con tests unitarios:

- gastos vigentes en un mes: bordes de `vigente_desde` y `vigente_hasta`,
  incluidos el mes exacto de apertura y el de cierre
- el ajuste manda sobre la plantilla, y solo en su mes
- neteo según `afecto_iva`
- fracción de mes: mes completo = 1, media = 0,5, rango que cruza varios meses,
  rango de un solo día
- resultado devengado y percibido
- bordes: sin gastos, gasto que abre y cierra el mismo mes, ajuste en cero,
  rango invertido (`hasta` anterior a `desde`)

## Orden de trabajo

1. Migración `024`: las dos tablas, el enum, RLS, índices. Sin backfill.
2. `src/lib/gastos.ts` con sus tests.
3. Server actions y pantalla `/finanzas/gastos`.
4. Banda Resultado en `/finanzas`.
5. Aplicar la migración a producción y desplegar.

La banda de Resultado entra después de la pantalla de carga para que, cuando
aparezca, ya exista dónde cargar los gastos y no muestre ceros.

## Fuera de alcance

**No se clasifican las compras del SII.** Las facturas de banco, combustible y
alimentación que ya están en `compras_sii` no se suman solas: si se quieren en
el resultado, se cargan como gasto. No hay doble conteo —el margen no mira
`compras_sii`— pero sí puede haber gasto olvidado, y eso lo decide el criterio
del usuario.

**No se calcula impuesto a la renta.** Aun con los gastos cargados, el resultado
es operacional y no tributario: faltan depreciación, corrección monetaria y los
gastos rechazados, y no se conoce el régimen. Estimarlo daría un número que el
contador no reconocería.

**No se tocan `/estados-cuenta` ni el dashboard**, que siguen con los pendientes
declarados en el spec de la ruta del dinero.
