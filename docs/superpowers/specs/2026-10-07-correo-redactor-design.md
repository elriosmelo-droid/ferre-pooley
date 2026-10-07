# Redactor de correo tipo Gmail

Fecha: 2026-10-07

## Contexto

El redactor de `/correos/nuevo` es mínimo: un editor `contentEditable` con
`execCommand` (negrita, cursiva, subrayado, listas, enlace), un solo
destinatario, sin adjuntos al enviar y sin firma. El cliente pide herramientas
como las de Gmail: firma automática con logo y editable, adjuntar archivos y
fotos, viñetas y más formato.

## Decisiones (aprobadas)

- Firma **por usuario** (opción A), editable desde Perfil. Logo de Tulbless
  precargado.
- Editor nuevo con **TipTap**.
- Extras de Gmail: Para/CC/CCO con varios destinatarios, Responder, Responder a
  todos y Reenviar.
- Fuera de alcance: borradores, programar envío, reenviar los adjuntos del
  correo original.

## 1. Editor (TipTap)

Barra: deshacer/rehacer, tamaño (pequeño, normal, grande, título), negrita,
cursiva, subrayado, tachado, color de texto, resaltado, alineación, viñetas,
lista numerada, sangría, cita, línea, enlace, imagen, quitar formato.

Una sola pieza `RichEditor` reutilizada por el redactor y por la firma del
perfil. Entrega HTML por un input oculto, igual que hoy.

Fotos en el cuerpo: se suben a un bucket público (`correo-imagenes`) y se
insertan por URL absoluta, para que se vean en cualquier cliente de correo.

## 2. Adjuntos

- Subida directa del navegador a un bucket privado (`correo-adjuntos`) con URL
  firmada creada en el servidor. No pasa por la función de Vercel, que rechaza
  cuerpos de más de 4,5 MB.
- Límite: 25 MB en total. Chips con nombre, tamaño y quitar.
- Al enviar, el servidor baja los archivos con el service role y los pasa a
  Resend (`attachments`). Se guardan en `correos.adjuntos` con su ruta y se
  pueden descargar desde Enviados.

## 3. Firma por usuario

- `perfiles.firma_html` (null = firma por defecto generada con nombre, empresa y
  logo).
- Editor en Perfil → Firma de correo, con botón para insertar el logo.
- Redactar nuevo: la firma va al final del mensaje, editable en ese correo.
  Responder/reenviar: firma antes del texto citado.
- Logo desde `NEXT_PUBLIC_APP_URL` + `/logo-full.png` (URL absoluta pública).

## 4. Destinatarios y respuestas

- Para, CC y CCO con varios destinatarios como chips (coma o Enter), validados.
  Sugerencias desde correos de clientes y proveedores.
- `correos.cc` y `correos.cco` (text[]). El correo sale con `cc` y `bcc` en
  Resend; Enviados muestra Para y CC (el CCO solo a quien lo envió).
- En un correo recibido: Responder (ya existe), Responder a todos (suma los demás
  destinatarios a CC) y Reenviar (prefija `Fwd:` y cita el original).

## 5. Seguridad y datos

- HTML saneado en el servidor con `sanitize-html` antes de enviar, guardar y
  mostrar (lista blanca de etiquetas y estilos; sin scripts ni eventos).
- Solo miembros con permiso `correos` suben archivos: las URLs de subida las
  genera una server action que valida el permiso.
- Migración 028 (SQL mínimo): `perfiles.firma_html`, `correos.cc`, `correos.cco`.
  Los buckets se crean por la API de Storage, sin SQL.

## Pruebas

- Unitarias: saneador, parseo/validación de destinatarios, firma por defecto,
  límites de adjuntos, armado de respuesta/reenvío.
- Envío real de un correo de prueba con formato, imagen, adjunto, CC y firma.
