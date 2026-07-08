import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";
import { Sidebar } from "@/components/sidebar";

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

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar esAdmin={perfil?.rol === "admin"} />
      <main className="p-4 sm:p-6 lg:ml-[220px] lg:p-8">{children}</main>
    </div>
  );
}
