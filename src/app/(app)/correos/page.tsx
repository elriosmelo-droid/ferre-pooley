import { createClient } from "@/lib/supabase/server";
import { CorreosLista, type CorreoRow } from "./correos-lista";

export default async function CorreosPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("correos")
    .select("id, de, asunto, recibido_at, leido")
    .order("recibido_at", { ascending: false });

  const correos = (data ?? []) as CorreoRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Correos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Correos recibidos en la casilla de la empresa.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los correos. Intenta nuevamente.
        </p>
      ) : (
        <CorreosLista correos={correos} />
      )}
    </div>
  );
}
