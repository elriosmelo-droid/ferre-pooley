import { crearProducto } from "../actions";
import { ProductoForm } from "../producto-form";

export default function NuevoProductoPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Nuevo producto</h1>
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <ProductoForm action={crearProducto} submitLabel="Crear producto" />
      </div>
    </div>
  );
}
