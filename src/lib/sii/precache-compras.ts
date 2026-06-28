import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirSesionRecibidos, descargarReciDiaXml, separarDtes } from "./mipe";
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

  // PDFs ya en Storage.
  const { data: objetos } = await db.storage.from(BUCKET).list("", { limit: 1000 });
  const cacheados = new Set((objetos ?? []).map((o) => o.name.replace(/\.pdf$/, "")));

  const faltantes = todas.filter((c) => !cacheados.has(c.id));
  if (faltantes.length === 0) {
    return { generados: 0, yaCacheados: cacheados.size, pendientes: 0, rateLimited: false };
  }

  // Agrupar faltantes por día.
  const porDia = new Map<string, CompraMin[]>();
  for (const c of faltantes) {
    const arr = porDia.get(c.fecha_emision) ?? [];
    arr.push(c);
    porDia.set(c.fecha_emision, arr);
  }
  const dias = [...porDia.keys()].sort().reverse();

  const sesion = await abrirSesionRecibidos();
  let generados = 0;
  let emptyStreak = 0;
  let rateLimited = false;

  for (const dia of dias) {
    if (generados >= max) break;
    const pendientesDia = porDia.get(dia)!;
    const idx = new Map(pendientesDia.map((c) => [`${c.tipo_doc}-${c.folio}`, c]));

    let xml: string;
    try {
      xml = await descargarReciDiaXml(sesion, dia);
    } catch {
      rateLimited = true;
      break;
    }
    const dtes = separarDtes(xml);
    if (dtes.length === 0) {
      // Día con compras esperadas pero sin DTE: probable throttle del SII.
      if (++emptyStreak >= 3) {
        rateLimited = true;
        break;
      }
      continue;
    }
    emptyStreak = 0;

    for (const dte of dtes) {
      const compra = idx.get(`${dte.tipoDoc}-${dte.folio}`);
      if (!compra) continue;
      try {
        const buf = await generarPdfFacturaRecibida(parseDte(dte.xml));
        const up = await db.storage
          .from(BUCKET)
          .upload(`${compra.id}.pdf`, new Uint8Array(buf), {
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

  return {
    generados,
    yaCacheados: cacheados.size,
    pendientes: faltantes.length - generados,
    rateLimited,
  };
}
