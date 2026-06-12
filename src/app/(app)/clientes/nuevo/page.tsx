import { crearCliente } from "../actions";
import { ClienteForm } from "../cliente-form";

export default function NuevoClientePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Nuevo cliente</h1>
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <ClienteForm action={crearCliente} submitLabel="Crear cliente" />
      </div>
    </div>
  );
}
