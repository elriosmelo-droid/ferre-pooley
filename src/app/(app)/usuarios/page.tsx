import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/rol";
import { CrearUsuarioForm } from "./crear-usuario-form";
import { EliminarUsuarioButton } from "./eliminar-usuario-button";

export type UsuarioRow = {
  id: string;
  email: string;
  nombre: string | null;
  rol: string;
  created_at: string;
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function UsuariosPage() {
  const perfilActual = await requireAdmin();

  const admin = createAdminClient();
  const [{ data: lista, error }, { data: perfiles }] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from("perfiles").select("user_id, nombre, rol"),
  ]);

  const porId = new Map(
    (perfiles ?? []).map((p) => [p.user_id, p as { nombre: string | null; rol: string }])
  );

  const usuarios: UsuarioRow[] = (lista?.users ?? [])
    .map((u) => {
      const p = porId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "—",
        nombre: p?.nombre ?? null,
        rol: p?.rol ?? "usuario",
        created_at: u.created_at,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Crea y administra los usuarios que pueden entrar a la aplicación.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Creado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                    No se pudieron cargar los usuarios.
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No hay usuarios.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">{u.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatearFecha(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {u.id === perfilActual.userId ? (
                        <span className="text-xs text-slate-400">Tú</span>
                      ) : (
                        <EliminarUsuarioButton id={u.id} email={u.email} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Nuevo usuario
          </h2>
          <CrearUsuarioForm />
        </div>
      </div>
    </div>
  );
}
