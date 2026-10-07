"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import { enviarCorreoNuevo } from "./actions";
import { RichEditor } from "./rich-editor";
import { DestinatariosInput, type Sugerencia } from "./destinatarios-input";
import { AdjuntosUploader } from "./adjuntos-uploader";

export function RedactarForm({
  para = [],
  cc = [],
  asunto = "",
  cuerpo = "",
  sugerencias = [],
}: {
  para?: string[];
  cc?: string[];
  asunto?: string;
  cuerpo?: string;
  sugerencias?: Sugerencia[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(enviarCorreoNuevo, {});
  const [mostrarCc, setMostrarCc] = useState(cc.length > 0);
  const [mostrarCco, setMostrarCco] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    if (state.success) router.push("/correos/enviados");
  }, [state.success, router]);

  return (
    // noValidate: los destinatarios se validan en el servidor y con chips; la
    // validación nativa del navegador solo estorba con campos que no son un
    // único correo.
    <form action={formAction} noValidate className="flex max-w-3xl flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="para" className={labelClass}>
            Para *
          </label>
          <div className="flex gap-3 text-xs">
            {!mostrarCc && (
              <button type="button" onClick={() => setMostrarCc(true)} className="text-brand-600 hover:text-brand-800">
                Cc
              </button>
            )}
            {!mostrarCco && (
              <button type="button" onClick={() => setMostrarCco(true)} className="text-brand-600 hover:text-brand-800">
                Cco
              </button>
            )}
          </div>
        </div>
        <DestinatariosInput id="para" name="para" defaultValue={para} sugerencias={sugerencias} required />
        <FieldErrors errors={state.fieldErrors?.para} />
      </div>

      {mostrarCc && (
        <div>
          <label htmlFor="cc" className={labelClass}>Cc</label>
          <DestinatariosInput id="cc" name="cc" defaultValue={cc} sugerencias={sugerencias} />
          <FieldErrors errors={state.fieldErrors?.cc} />
        </div>
      )}
      {mostrarCco && (
        <div>
          <label htmlFor="cco" className={labelClass}>Cco (copia oculta)</label>
          <DestinatariosInput id="cco" name="cco" sugerencias={sugerencias} />
          <FieldErrors errors={state.fieldErrors?.cco} />
        </div>
      )}

      <div>
        <label htmlFor="asunto" className={labelClass}>
          Asunto *
        </label>
        <input id="asunto" name="asunto" required defaultValue={asunto} className={inputClass} />
        <FieldErrors errors={state.fieldErrors?.asunto} />
      </div>

      <div>
        <label className={labelClass}>Mensaje *</label>
        <RichEditor name="cuerpo" defaultValue={cuerpo} minHeight={280} />
        <FieldErrors errors={state.fieldErrors?.cuerpo} />
      </div>

      <AdjuntosUploader name="adjuntos" onOcupado={setSubiendo} />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || subiendo}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Enviando…" : subiendo ? "Subiendo archivos…" : "Enviar"}
        </button>
        <Link
          href="/correos"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
