"use client";

import { useActionState, useState } from "react";
import { RichEditor } from "../correos/rich-editor";
import { guardarFirma, type FirmaFormState } from "./actions";

// Firma de correo del usuario. Se agrega sola al final de cada correo nuevo y
// se puede editar en el momento. Sin firma guardada se usa la de por defecto.
export function FirmaForm({
  firmaGuardada,
  firmaPorDefecto,
}: {
  firmaGuardada: string | null;
  firmaPorDefecto: string;
}) {
  const [state, formAction, isPending] = useActionState<FirmaFormState, FormData>(
    guardarFirma,
    {}
  );
  // El editor toma su contenido inicial una sola vez: para restaurar la firma
  // por defecto se vuelve a montar con otra `key`.
  const [version, setVersion] = useState(0);
  const [inicial, setInicial] = useState(firmaGuardada?.trim() || firmaPorDefecto);

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6"
    >
      <div>
        <h2 className="text-lg font-bold text-slate-900">Firma de correo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Se agrega sola al final de los correos que redactes. Puedes cambiarla
          aquí o editarla en un correo puntual.
        </p>
      </div>

      <RichEditor key={version} name="firma_html" defaultValue={inicial} minHeight={160} />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">Firma guardada.</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar firma"}
        </button>
        <button
          type="button"
          onClick={() => {
            setInicial(firmaPorDefecto);
            setVersion((v) => v + 1);
          }}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Restaurar la de por defecto
        </button>
      </div>
    </form>
  );
}
