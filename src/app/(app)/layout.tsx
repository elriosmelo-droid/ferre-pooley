import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";
import { Sidebar } from "@/components/sidebar";
import { tienePermiso } from "@/lib/auth/permisos";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const perfil = await getPerfilActual();
  const sujeto = perfil
    ? { rol: perfil.rol, permisos: perfil.permisos }
    : { rol: "vendedor" as const, permisos: {} };

  // El contador de no leídos solo se pide si puede ver correos.
  let correosSinLeer = 0;
  if (tienePermiso(sujeto, "correos", "lectura")) {
    const { count } = await supabase
      .from("correos")
      .select("id", { count: "exact", head: true })
      .eq("leido", false);
    correosSinLeer = count ?? 0;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar perfil={sujeto} correosSinLeer={correosSinLeer} />
      <main className="p-4 sm:p-6 lg:ml-[220px] lg:p-8">{children}</main>
    </div>
  );
}
