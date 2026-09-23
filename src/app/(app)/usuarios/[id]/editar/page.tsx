import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/rol";
import { normalizarPermisos } from "@/lib/auth/permisos";
import { actualizarUsuario } from "../../actions";
import { UsuarioForm } from "../../usuario-form";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: authData }, { data: perfil }] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("perfiles").select("nombre, rol, permisos").eq("user_id", id).maybeSingle(),
  ]);
  if (!authData?.user || !perfil) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/usuarios" className="text-sm text-brand-600 hover:text-brand-800">
        ← Usuarios
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-slate-900">Editar usuario</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <UsuarioForm
          action={actualizarUsuario.bind(null, id)}
          submitLabel="Guardar cambios"
          usuario={{
            email: authData.user.email ?? "",
            nombre: perfil.nombre,
            rol: perfil.rol === "admin" ? "admin" : "vendedor",
            permisos: normalizarPermisos(perfil.permisos),
          }}
        />
      </div>
    </div>
  );
}
