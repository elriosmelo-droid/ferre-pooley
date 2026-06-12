# Diseño: Sistema de Cotizaciones → Notas de Venta (Ferre Pooley)

**Fecha:** 2026-06-12
**Estado:** Aprobado por Elvis (flujo, modelo de datos y estructura de pantallas validados en brainstorming)

## Resumen

Sistema web para ferretería que gestiona cotizaciones y las convierte en notas de venta cuando el cliente las acepta vía link en correo electrónico.

## Stack

- **Next.js (App Router, TypeScript, Tailwind)** desplegado en **Vercel** — UI + API en un solo proyecto
- **Supabase** — Postgres, Auth (un usuario interno por ahora) y RLS
- **Resend** — envío de correos con plantillas React Email
- **@react-pdf/renderer** — generación de PDF serverless (adjunto en correo)

## Flujo de documentos

```
Cotización:  Borrador → Enviada → { Aceptada | Rechazada | Vencida }
Al aceptar:  se crea Nota de Venta automáticamente
Nota Venta:  Pendiente de pago → { Pagada | Anulada }
```

Reglas:
- Cotización solo editable en Borrador. Enviada se congela; para cambios se duplica como nueva versión.
- Aceptación: link con token único (UUID) enviado por Resend. Cliente no necesita cuenta. Página pública `/cotizacion/[token]` con botones Aceptar / Rechazar.
- Al aceptar: se crea nota de venta (snapshot de ítems y montos, folio propio NV-0001…) y se notifica por correo al usuario interno.
- Folios correlativos separados: COT-0001… y NV-0001…, generados por secuencia Postgres.
- Vencimiento: cotización con fecha de validez pasada se considera vencida (validación al consultar; el link de aceptación deja de funcionar).

## Modelo de datos (Supabase Postgres)

| Tabla | Campos clave |
|---|---|
| `clientes` | nombre, rut, correo, teléfono, dirección |
| `productos` | sku (único), descripción, costo, precio |
| `cotizaciones` | folio, cliente_id, estado, fecha_validez, flete, token_aceptacion (único), enviada_at, respondida_at, subtotal_neto, iva, total |
| `cotizacion_items` | cotizacion_id, producto_id (nullable = ítem libre), sku, descripción, cantidad, costo, precio (copia, no referencia viva) |
| `notas_venta` | folio, cotizacion_id, cliente_id, estado, flete, subtotal_neto, iva, total |
| `nota_venta_items` | snapshot de ítems al aceptar |
| `perfiles` | user_id (auth), nombre, datos de la ferretería (razón social, RUT, dirección, logo) para PDF/correo |

Decisiones:
- Ítems guardan **copia** de sku/descripción/costo/precio → editar el catálogo no altera documentos emitidos.
- **Costo es solo interno** (margen). Nunca aparece en correo, PDF ni página pública.
- **IVA 19% desglosado**: precios netos; documento muestra subtotal neto + flete → IVA → total. Flete es un valor único por documento, se suma al neto antes de IVA.
- Moneda CLP, montos enteros.
- RLS: tablas privadas requieren usuario autenticado. La página pública accede solo vía token con cliente de servidor (service role) validando token + estado + vigencia.

## Correo (Resend)

- Cotización: correo HTML (resumen + botón "Aceptar cotización") + **PDF adjunto** formal. PDF sin columna costo.
- Aviso interno: al aceptar/rechazar, correo al usuario.

## Pantallas (menús separados)

- **Dashboard** — resumen: cotizaciones pendientes, ventas del mes, por cobrar
- **Cotizaciones** — listado con filtros por estado; crear/editar (borrador); detalle; enviar; duplicar
- **Notas de Venta** — listado separado; filtros por estado de pago; marcar pagada/anulada
- **Productos** — CRUD catálogo (sku, descripción, costo, precio); en cotización se busca por sku/descripción o se ingresa ítem libre
- **Clientes** — CRUD (nombre, RUT, correo, teléfono, dirección) + historial de documentos
- **Mi Perfil** — datos del usuario y de la ferretería que salen en PDF/correo
- **Pública**: `/cotizacion/[token]` — vista de cotización sin costos, botones Aceptar/Rechazar
- **Login** — Supabase Auth email/password, un usuario

Pantalla Nueva Cotización: selector de cliente (o crear), tabla de ítems (SKU, descripción, cantidad, costo interno, precio, total línea), agregar desde catálogo o libre, campo flete, totales con IVA, acciones Guardar borrador / Enviar al cliente.

## Manejo de errores

- Token inválido/usado/vencido → página pública muestra estado correspondiente, sin filtrar datos.
- Doble clic en aceptar / carrera: transición de estado atómica en Postgres (UPDATE condicional sobre estado='enviada'); solo la primera gana.
- Fallo de Resend al enviar: cotización queda en borrador y se muestra error; reintento manual.
- Folios: secuencias Postgres evitan duplicados bajo concurrencia.

## Fuera de alcance (por ahora)

- Multiusuario / roles
- Inventario / stock
- Facturación electrónica SII
- Pagos en línea
