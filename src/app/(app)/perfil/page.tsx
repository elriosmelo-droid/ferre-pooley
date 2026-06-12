import { createClient } from "@/lib/supabase/server";
import { PerfilForm, type PerfilData } from "./perfil-form";

export default async function PerfilPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil, error } = user
    ? await supabase
        .from("perfiles")
        .select(
          "nombre, razon_social, rut_empresa, direccion_empresa, telefono_empresa, correo_aviso"
        )
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  if (error) {
    throw new Error("No se pudo cargar el perfil.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi Perfil</h1>
        <p className="mt-1 text-sm text-slate-600">
          Estos datos aparecen en el PDF y los correos enviados a tus clientes.
        </p>
      </div>

      <PerfilForm
        perfil={(perfil as PerfilData | null) ?? null}
        correoCuenta={user?.email ?? ""}
      />
    </div>
  );
}
