// Dominio público de la aplicación. Fuente de verdad para los links que ven los
// clientes (correo de cotización, página de aceptación, link público). Se define
// aquí en vez de en una variable de entorno para que el dominio sea estable y
// fácil de cambiar en un solo lugar. Si cambia el dominio, editar esta constante.
const raw = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

// Ignora valores de *.vercel.app (URL técnica del deploy) y usa el dominio
// propio. Respeta localhost en desarrollo y cualquier dominio propio explícito.
export const APP_URL =
  !raw || raw.includes("vercel.app") ? "https://tulbless.cl" : raw;

