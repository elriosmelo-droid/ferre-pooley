"use client";

import { useActionState, useEffect, useRef } from "react";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import { crearUsuario } from "./actions";

export function CrearUsuarioForm() {
  const [state, formAction, isPending] = useActionState(crearUsuario, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Al crear con éxito, limpia el formulario.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          Correo *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="nombre" className={labelClass}>
          Nombre *
        </label>
        <input id="nombre" name="nombre" required className={inputClass} />
        <FieldErrors errors={state.fieldErrors?.nombre} />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Contraseña inicial *
        </label>
        <input
          id="password"
          name="password"
          type="text"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.password} />
        <p className="mt-1 text-xs text-slate-500">
          El usuario la usa para entrar. Puede cambiarla luego.
        </p>
      </div>

      <div>
        <label htmlFor="rol" className={labelClass}>
          Rol
        </label>
        <select id="rol" name="rol" defaultValue="admin" className={inputClass}>
          <option value="admin">Admin</option>
          <option value="usuario">Usuario</option>
        </select>
        <FieldErrors errors={state.fieldErrors?.rol} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600">Usuario creado.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}
