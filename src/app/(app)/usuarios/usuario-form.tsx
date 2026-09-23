"use client";

import { useActionState, useRef, useState } from "react";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import {
  PERMISOS_DEFAULT_VENDEDOR,
  type Permisos,
  type Rol,
} from "@/lib/auth/permisos";
import type { UsuarioFormState } from "./actions";
import { PermisosGrid } from "./permisos-grid";

type Props = {
  action: (prev: UsuarioFormState, formData: FormData) => Promise<UsuarioFormState>;
  // Sin usuario = crear (pide correo y contraseña). Con usuario = editar.
  usuario?: { email: string; nombre: string | null; rol: Rol; permisos: Permisos };
  submitLabel: string;
};

export function UsuarioForm({ action, usuario, submitLabel }: Props) {
  const creando = !usuario;
  const formRef = useRef<HTMLFormElement>(null);
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "admin");
  const [permisos, setPermisos] = useState<Permisos>(
    usuario?.permisos ?? PERMISOS_DEFAULT_VENDEDOR
  );

  // Al crear con éxito, limpia el formulario para el siguiente usuario.
  async function accion(prev: UsuarioFormState, formData: FormData) {
    const res = await action(prev, formData);
    if (res.success && creando) {
      formRef.current?.reset();
      setRol("admin");
      setPermisos(PERMISOS_DEFAULT_VENDEDOR);
    }
    return res;
  }
  const [state, formAction, isPending] = useActionState(accion, {});

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
          required={creando}
          readOnly={!creando}
          defaultValue={usuario?.email ?? ""}
          autoComplete="off"
          className={`${inputClass} ${creando ? "" : "bg-slate-50 text-slate-500"}`}
        />
        <FieldErrors errors={state.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="nombre" className={labelClass}>
          Nombre *
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          defaultValue={usuario?.nombre ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.nombre} />
      </div>

      {creando && (
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
      )}

      <div>
        <label htmlFor="rol" className={labelClass}>
          Rol
        </label>
        <select
          id="rol"
          name="rol"
          value={rol}
          onChange={(e) => setRol(e.target.value as Rol)}
          className={inputClass}
        >
          <option value="admin">Admin</option>
          <option value="vendedor">Vendedor</option>
        </select>
        <FieldErrors errors={state.fieldErrors?.rol} />
      </div>

      {rol === "vendedor" && (
        <div>
          <p className={labelClass}>Permisos</p>
          <PermisosGrid value={permisos} onChange={setPermisos} />
          <FieldErrors errors={state.fieldErrors?.permisos} />
        </div>
      )}
      <input type="hidden" name="permisos" value={JSON.stringify(permisos)} />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600">
          {creando ? "Usuario creado." : "Cambios guardados."}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
