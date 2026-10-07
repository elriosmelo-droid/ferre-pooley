import Link from "next/link";
import { notFound } from "next/navigation";
import { RedactarForm } from "../redactar-form";
import { requirePermiso } from "@/lib/auth/rol";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/app-url";
import { sanearHtml } from "@/lib/email/sanear-html";
import {
  casillasPropias,
  correoDeRemitente,
  remitenteDe,
} from "@/lib/email/remitente";
import {
  citarOriginal,
  cuerpoInicial,
  destinatariosResponderATodos,
  firmaPorDefecto,
  prefijoAsunto,
} from "@/lib/email/firma";

type Original = {
  de: string | null;
  para: string[];
  cc: string[] | null;
  asunto: string | null;
  texto: string | null;
  html: string | null;
  recibido_at: string;
};

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function soloEmail(de: string | null): string {
  if (!de) return "";
  return de.match(/<([^>]+)>/)?.[1] ?? de.trim();
}

export default async function RedactarCorreoPage({
  searchParams,
}: {
  searchParams: Promise<{
    responder?: string;
    todos?: string;
    reenviar?: string;
    para?: string;
    asunto?: string;
  }>;
}) {
  const perfil = await requirePermiso("correos", "escritura");
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: miPerfil }, { data: clientes }, { data: proveedores }] =
    await Promise.all([
      supabase
        .from("perfiles")
        .select("nombre, razon_social, telefono_empresa, firma_html")
        .eq("user_id", perfil.userId)
        .maybeSingle(),
      supabase.from("clientes").select("nombre, correo").limit(1000),
      supabase.from("proveedores").select("razon_social, correo").limit(1000),
    ]);

  // Firma propia; si no editó ninguna, la de por defecto con el logo.
  const firma =
    miPerfil?.firma_html?.trim() ||
    firmaPorDefecto({
      nombre: miPerfil?.nombre,
      razonSocial: miPerfil?.razon_social,
      telefono: miPerfil?.telefono_empresa,
      correo: correoDeRemitente(remitenteDe(perfil.email)),
      logoUrl: `${APP_URL}/logo-full.png`,
    });

  const sugerencias = [
    ...(clientes ?? []).map((c) => ({ correo: c.correo as string, nombre: c.nombre as string })),
    ...(proveedores ?? []).map((p) => ({ correo: p.correo as string, nombre: (p.razon_social as string) ?? "" })),
  ].filter((s) => s.correo);

  let para: string[] = sp.para ? [sp.para] : [];
  let cc: string[] = [];
  let asunto = sp.asunto ?? "";
  let cita = "";
  let titulo = "Redactar correo";

  const originalId = sp.responder ?? sp.reenviar;
  if (originalId) {
    const { data } = await supabase
      .from("correos")
      .select("de, para, cc, asunto, texto, html, recibido_at")
      .eq("id", originalId)
      .maybeSingle();
    if (!data) notFound();
    const o = data as Original;
    const reenvio = Boolean(sp.reenviar);
    cita = citarOriginal({
      de: o.de,
      fecha: fmtFechaHora(o.recibido_at),
      html: o.html ? sanearHtml(o.html) : null,
      texto: o.texto,
      reenvio,
      asunto: o.asunto,
      para: o.para,
    });
    if (reenvio) {
      titulo = "Reenviar correo";
      asunto = prefijoAsunto(o.asunto, "Fwd:");
    } else if (sp.todos) {
      titulo = "Responder a todos";
      asunto = prefijoAsunto(o.asunto, "Re:");
      ({ para, cc } = destinatariosResponderATodos({
        de: o.de,
        para: o.para,
        cc: o.cc ?? [],
        propios: casillasPropias(),
      }));
    } else {
      titulo = "Responder";
      asunto = prefijoAsunto(o.asunto, "Re:");
      para = [soloEmail(o.de)].filter(Boolean);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/correos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Correos
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{titulo}</h1>
      </div>
      {/* key: al cambiar de correo a responder se reinicia el editor. */}
      <RedactarForm
        key={`${sp.responder ?? ""}${sp.reenviar ?? ""}${sp.todos ?? ""}`}
        para={para}
        cc={cc}
        asunto={asunto}
        cuerpo={cuerpoInicial(firma, cita)}
        sugerencias={sugerencias}
      />
    </div>
  );
}
