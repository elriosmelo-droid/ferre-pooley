import { createClient } from "@/lib/supabase/server";
import { CorreosLista, type CorreoRow } from "../correos-lista";
import { CorreosNav } from "../correos-nav";

export default async function CorreosEnviadosPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("correos")
    .select("id, de, para, asunto, recibido_at, leido")
    .eq("direccion", "saliente")
    .order("recibido_at", { ascending: false });

  const correos = (data ?? []) as CorreoRow[];

  return (
    <div>
      <CorreosNav activo="enviados" />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los enviados. Intenta nuevamente.
        </p>
      ) : (
        <CorreosLista correos={correos} modo="enviados" />
      )}
    </div>
  );
}
