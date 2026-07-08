"use client";

import { useState, type ReactNode, type SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

// --- Íconos (SVG inline, stroke currentColor, sin dependencias) ---
type IconProps = SVGProps<SVGSVGElement>;
const baseIcon = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "shrink-0",
  ...props,
});

const IconDashboard = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);
const IconCotizaciones = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 9h1M9 13h6M9 17h6" />
  </svg>
);
const IconVentas = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M3 3h2l.4 2M7 13h10l3-8H6.4" />
    <circle cx="9" cy="19" r="1.6" />
    <circle cx="17" cy="19" r="1.6" />
  </svg>
);
const IconVenta = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M5 21V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21Z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);
const IconNota = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M14 3v5h5" />
    <path d="M8 13h8M8 17h5" />
  </svg>
);
const IconConciliacion = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M12 3v18" />
    <path d="M6 7 3 13h6L6 7ZM18 7l-3 6h6l-3-6Z" />
    <path d="M4 21h16" />
  </svg>
);
const IconCompras = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M6 2 3 6v14a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);
const IconCompra = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
  </svg>
);
const IconOrden = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M9 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <path d="m9 13 2 2 4-4" />
  </svg>
);
const IconProveedores = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M1 3h13v11H1zM14 8h4l3 3v3h-7" />
    <circle cx="6" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </svg>
);
const IconProductos = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </svg>
);
const IconClientes = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);
const IconEstadoCuenta = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 14h4" />
    <circle cx="16.5" cy="14" r="1" />
  </svg>
);
const IconUsuarios = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5Z" />
    <circle cx="12" cy="10" r="2.2" />
    <path d="M8.5 16a3.5 3.5 0 0 1 7 0" />
  </svg>
);
const IconPerfil = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
const IconLogout = (p: IconProps) => (
  <svg {...baseIcon(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);
const Chevron = (p: IconProps) => (
  <svg {...baseIcon({ width: 16, height: 16, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// --- Estructura del menú ---
type Item = { href: string; label: string; icon: (p: IconProps) => ReactNode };
type Group = { label: string; icon: (p: IconProps) => ReactNode; items: Item[] };
type Entry = Item | Group;

const isGroup = (e: Entry): e is Group => "items" in e;

const menu: Entry[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  {
    label: "Ventas",
    icon: IconVentas,
    items: [
      { href: "/cotizaciones", label: "Cotizaciones", icon: IconCotizaciones },
      { href: "/ventas", label: "Ventas", icon: IconVenta },
      { href: "/notas-venta", label: "Notas de Venta", icon: IconNota },
      { href: "/conciliacion", label: "Conciliación", icon: IconConciliacion },
    ],
  },
  {
    label: "Compras",
    icon: IconCompras,
    items: [
      { href: "/compras", label: "Compras", icon: IconCompra },
      { href: "/ordenes-compra", label: "Órdenes de Compra", icon: IconOrden },
    ],
  },
  { href: "/proveedores", label: "Proveedores", icon: IconProveedores },
  { href: "/productos", label: "Productos", icon: IconProductos },
  {
    label: "Clientes",
    icon: IconClientes,
    items: [
      { href: "/clientes", label: "Clientes", icon: IconClientes },
      { href: "/estados-cuenta", label: "Estados de Cuenta", icon: IconEstadoCuenta },
    ],
  },
];

function itemClasses(active: boolean) {
  return `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
    active
      ? "bg-brand-600 text-white"
      : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`;
}

export function Sidebar({ esAdmin = false }: { esAdmin?: boolean }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const groupHasActive = (g: Group) => g.items.some((i) => isActive(i.href));
  // Abierto si el usuario lo abrió, o por defecto si tiene un hijo activo.
  const isOpen = (g: Group) => toggled[g.label] ?? groupHasActive(g);

  const cerrar = () => setAbierto(false);

  const contenido = (
    <>
      <div className="flex justify-center border-b border-slate-800 px-4 py-6">
        <Link href="/dashboard" onClick={cerrar}>
          <Image
            src="/logo-marca.png"
            alt="Tulbless"
            width={310}
            height={229}
            priority
            className="h-auto w-[150px]"
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {menu.map((entry) => {
          if (!isGroup(entry)) {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={cerrar}
                className={itemClasses(isActive(entry.href))}
              >
                <Icon />
                {entry.label}
              </Link>
            );
          }

          const abiertoGrupo = isOpen(entry);
          const activo = groupHasActive(entry);
          const Icon = entry.icon;
          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() =>
                  setToggled((prev) => ({
                    ...prev,
                    [entry.label]: !abiertoGrupo,
                  }))
                }
                aria-expanded={abiertoGrupo}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  activo && !abiertoGrupo
                    ? "text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon />
                <span className="flex-1 text-left">{entry.label}</span>
                <Chevron
                  className={`shrink-0 transition-transform ${
                    abiertoGrupo ? "rotate-180" : ""
                  }`}
                />
              </button>
              {abiertoGrupo && (
                <div className="mt-1 space-y-1 border-l border-slate-800 pl-3 ml-4">
                  {entry.items.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={cerrar}
                        className={itemClasses(isActive(sub.href))}
                      >
                        <SubIcon />
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-slate-800 px-3 py-4">
        {esAdmin && (
          <Link
            href="/usuarios"
            onClick={cerrar}
            className={itemClasses(isActive("/usuarios"))}
          >
            <IconUsuarios />
            Usuarios
          </Link>
        )}
        <Link
          href="/perfil"
          onClick={cerrar}
          className={itemClasses(isActive("/perfil"))}
        >
          <IconPerfil />
          Mi Perfil
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <IconLogout />
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/dashboard">
          <Image
            src="/logo-marca.png"
            alt="Tulbless"
            width={310}
            height={229}
            priority
            className="h-auto w-[110px]"
          />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* Sidebar fijo en desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col bg-slate-900 lg:flex">
        {contenido}
      </aside>

      {/* Drawer móvil */}
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={cerrar}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] max-w-[80vw] flex-col bg-slate-900">
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar menú"
              className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
