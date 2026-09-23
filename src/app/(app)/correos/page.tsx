import { createClient } from "@/lib/supabase/server";
import { CorreosLista, type CorreoRow } from "./correos-lista";
import { CorreosNav } from "./correos-nav";
import { requirePermiso } from "@/lib/auth/rol";
import { tienePermiso } from "@/lib/auth/permisos";

export default async function CorreosPage() {
  const perfil = await requirePermiso("correos");
  const puedeEscribir = tienePermiso(perfil, "correos", "escritura");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("correos")
    .select("id, de, para, asunto, recibido_at, leido")
    .eq("direccion", "entrante")
    .order("recibido_at", { ascending: false });

  const correos = (data ?? []) as CorreoRow[];
  const sinLeer = correos.filter((c) => !c.leido).length;

  return (
    <div>
      <CorreosNav activo="recibidos" sinLeer={sinLeer} puedeEscribir={puedeEscribir} />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los correos. Intenta nuevamente.
        </p>
      ) : (
        <CorreosLista correos={correos} modo="recibidos" />
      )}
    </div>
  );
}
