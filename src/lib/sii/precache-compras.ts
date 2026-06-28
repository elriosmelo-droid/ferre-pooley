import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirSesionRecibidos, descargarReciRangoXml, separarDtes } from "./mipe";
import { parseDte } from "./dte-xml";
import { generarPdfFacturaRecibida } from "@/lib/pdf/venta-pdf";

const BUCKET = "compras-pdf";
// Tope por corrida para no exceder el maxDuration ni gatillar el rate-limit del
// SII. Lo que falte lo toma la corrida siguiente (idempotente).
const MAX_POR_CORRIDA = 60;

type CompraMin = {
  id: string;
  folio: string;
  tipo_doc: number;
  fecha_emision: string;
};

export type PrecacheResult = {
  generados: number;
  yaCacheados: number;
  pendientes: number;
  // Faltantes cuyo mes SÍ se consultó pero el DTE no está en MIPE (proveedor que
  // no entrega por el sistema gratuito del SII): sin fuente, no recuperables.
  noDisponibles: number;
  rateLimited: boolean;
};

// Baja en UNA sola sesión los DTE recibidos que aún no tienen PDF cacheado,
// agrupando por día (cada descarga trae todos los documentos del día), genera
// el PDF y lo sube a Storage `compras-pdf/{id}.pdf`. Así "Ver" sirve del caché
// sin abrir una sesión al SII por click (que el SII throttlea).
export async function precachearComprasPdf(max = MAX_POR_CORRIDA): Promise<PrecacheResult> {
  const db = createAdminClient();

  const { data: compras } = await db
    .from("compras_sii")
    .select("id, folio, tipo_doc, fecha_emision")
    .not("fecha_emision", "is", null);
  const todas = (compras ?? []) as CompraMin[];

  // PDFs ya en Storage (versión actual del render).
  const { data: objetos } = await db.storage.from(BUCKET).list("", { limit: 1000 });
  const cacheados = new Set(
    (objetos ?? [])
      .filter((o) => o.name.endsWith("-v3.pdf"))
      .map((o) => o.name.replace(/-v3\.pdf$/, ""))
  );

  const faltantes = todas.filter((c) => !cacheados.has(c.id));
  if (faltantes.length === 0) {
    return { generados: 0, yaCacheados: cacheados.size, pendientes: 0, noDisponibles: 0, rateLimited: false };
  }

  // Agrupar faltantes por MES (AAAA-MM). Un rango mensual trae todos los
  // documentos del mes en una sola request → mucho menos tráfico que día por
  // día, que el SII throttlea.
  const porMes = new Map<string, CompraMin[]>();
  for (const c of faltantes) {
    const mes = c.fecha_emision.slice(0, 7); // AAAA-MM
    const arr = porMes.get(mes) ?? [];
    arr.push(c);
    porMes.set(mes, arr);
  }
  const meses = [...porMes.keys()].sort().reverse();

  // Índice global folio+tipo → compra (los DTE del rango pueden venir en
  // cualquier orden; se matchea por folio+tipo, no por día).
  const idx = new Map(faltantes.map((c) => [`${c.tipo_doc}-${c.folio}`, c]));

  // Fecha de hoy (UTC): el SII devuelve vacío si el rango se extiende al futuro,
  // así que no se pide más allá de hoy para el mes en curso.
  const hoy = new Date();
  const hoyStr = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}-${String(hoy.getUTCDate()).padStart(2, "0")}`;

  const sesion = await abrirSesionRecibidos();
  let generados = 0;
  let rateLimited = false;
  // Meses cuyo rango se descargó OK + folios+tipo vistos en MIPE. Sirve para
  // distinguir "no disponible en el SII" (mes consultado, DTE ausente) de
  // "pendiente" (mes no alcanzado por tope/throttle).
  const mesesConsultados = new Set<string>();
  const vistosEnMipe = new Set<string>();

  for (const mes of meses) {
    if (generados >= max) break;
    const [y, m] = mes.split("-").map(Number);
    const desde = `${mes}-01`;
    let hasta = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    if (hasta > hoyStr) hasta = hoyStr; // no pedir rango al futuro

    let xml: string;
    try {
      xml = await descargarReciRangoXml(sesion, desde, hasta);
    } catch {
      rateLimited = true;
      break;
    }
    mesesConsultados.add(mes);
    let dtes = separarDtes(xml);
    // Si el rango mensual vino vacío, reintentar día por día los días con
    // documentos esperados (el día puntual sí responde aunque el rango falle).
    if (dtes.length === 0) {
      const dias = [...new Set((porMes.get(mes) ?? []).map((c) => c.fecha_emision))];
      for (const dia of dias) {
        try {
          dtes = dtes.concat(separarDtes(await descargarReciRangoXml(sesion, dia, dia)));
        } catch {
          rateLimited = true;
          break;
        }
      }
    }
    for (const dte of dtes) {
      vistosEnMipe.add(`${dte.tipoDoc}-${dte.folio}`);
      const compra = idx.get(`${dte.tipoDoc}-${dte.folio}`);
      if (!compra) continue;
      try {
        const buf = await generarPdfFacturaRecibida(parseDte(dte.xml));
        const up = await db.storage
          .from(BUCKET)
          .upload(`${compra.id}-v3.pdf`, new Uint8Array(buf), {
            contentType: "application/pdf",
            upsert: true,
          });
        if (!up.error) generados++;
      } catch {
        // un documento que falla no corta la corrida
      }
      if (generados >= max) break;
    }
  }

  // Faltante cuyo mes se consultó pero no estaba en MIPE → sin fuente.
  const noDisponibles = faltantes.filter(
    (c) =>
      mesesConsultados.has(c.fecha_emision.slice(0, 7)) &&
      !vistosEnMipe.has(`${c.tipo_doc}-${c.folio}`)
  ).length;

  return {
    generados,
    yaCacheados: cacheados.size,
    pendientes: faltantes.length - generados - noDisponibles,
    noDisponibles,
    rateLimited,
  };
}
