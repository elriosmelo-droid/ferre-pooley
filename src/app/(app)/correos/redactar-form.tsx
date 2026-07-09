"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import { enviarCorreoNuevo } from "./actions";
import { RichEditor } from "./rich-editor";

export function RedactarForm({
  para = "",
  asunto = "",
  cuerpo = "",
}: {
  para?: string;
  asunto?: string;
  cuerpo?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(enviarCorreoNuevo, {});

  useEffect(() => {
    if (state.success) router.push("/correos/enviados");
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div>
        <label htmlFor="para" className={labelClass}>
          Para *
        </label>
        <input
          id="para"
          name="para"
          type="email"
          required
          defaultValue={para}
          placeholder="cliente@correo.cl"
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.para} />
      </div>

      <div>
        <label htmlFor="asunto" className={labelClass}>
          Asunto *
        </label>
        <input
          id="asunto"
          name="asunto"
          required
          defaultValue={asunto}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.asunto} />
      </div>

      <div>
        <label className={labelClass}>Mensaje *</label>
        <RichEditor name="cuerpo" defaultValue={cuerpo} />
        <FieldErrors errors={state.fieldErrors?.cuerpo} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar"}
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
