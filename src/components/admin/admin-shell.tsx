"use client";

import { useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Tag,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import type { LucideIcon } from "lucide-react";

type AdminShellProps = {
  children: React.ReactNode;
  identity: {
    email: string;
    fullName: string | null;
    role: "admin" | "editor";
  };
};

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { name: "Panoramica", href: "/admin", icon: LayoutDashboard },
      { name: "Lead e richieste", href: "/admin/leads", icon: Users },
      { name: "Ordini", href: "/admin/ordini", icon: ShoppingBag },
      { name: "Biglietti", href: "/admin/biglietti", icon: Ticket },
    ],
  },
  {
    label: "Contenuti",
    items: [
      { name: "Prodotti", href: "/admin/prodotti", icon: Package },
      { name: "Corsi", href: "/admin/corsi", icon: Dumbbell },
      { name: "Eventi", href: "/admin/eventi", icon: CalendarDays },
      { name: "Partner", href: "/admin/sponsors", icon: Handshake },
    ],
  },
  {
    label: "Crescita",
    items: [
      { name: "Coupon", href: "/admin/coupon", icon: Tag },
      { name: "Prova gratuita", href: "/admin/prova-gratuita", icon: Sparkles },
      { name: "Impostazioni sito", href: "/admin/impostazioni", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname.endsWith("/admin")
    : pathname.includes(href);
}

export function AdminShell({ children, identity }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  const allItems: NavItem[] = sections.flatMap((section) => section.items);
  const currentItem = allItems
    .find((item) => isActive(pathname, item.href));
  const initials = (identity.fullName || identity.email || "ME")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const navigation = (
    <>
      <div className="flex h-20 items-center justify-between px-5">
        <Link href="/admin" className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#f2d95c] text-sm font-black text-[#151712] shadow-[0_8px_28px_rgba(242,217,92,.2)]">
            M
          </span>
          {!compact && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-[-0.02em] text-white">
                Meraki Experience
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                Control room
              </span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCompact((value) => !value)}
          className="hidden size-9 place-items-center rounded-xl text-white/35 transition hover:bg-white/8 hover:text-white lg:grid"
          aria-label={compact ? "Espandi navigazione" : "Comprimi navigazione"}
        >
          <PanelLeftClose className={`size-4 transition ${compact ? "rotate-180" : ""}`} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-5">
        {sections.map((section) => (
          <div key={section.label} className="mb-6">
            {!compact && (
              <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/25">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={compact ? item.name : undefined}
                    className={`group flex h-11 items-center rounded-2xl transition ${
                      compact ? "justify-center px-0" : "gap-3 px-3"
                    } ${
                      active
                        ? "bg-[#f2d95c] text-[#171914] shadow-[0_10px_24px_rgba(0,0,0,.18)]"
                        : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 1.8} />
                    {!compact && (
                      <>
                        <span className="flex-1 text-[13px] font-semibold">{item.name}</span>
                        {active && <ChevronRight className="size-3.5 opacity-50" />}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className={`flex items-center ${compact ? "justify-center" : "gap-3"} rounded-2xl bg-white/[0.04] p-2`}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-xs font-extrabold text-white">
            {initials}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-white">
                  {identity.fullName || "Team Meraki"}
                </span>
                <span className="block truncate text-[10px] text-white/35">
                  {identity.role === "admin" ? "Amministratore" : "Editor"}
                </span>
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="grid size-8 place-items-center rounded-xl text-white/35 transition hover:bg-rose-400/10 hover:text-rose-300"
                  aria-label="Disconnetti"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="admin-surface min-h-dvh bg-[#f3f4ef] text-[#20221d]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#171914] transition-[width] duration-300 lg:flex ${
          compact ? "w-[76px]" : "w-[264px]"
        }`}
      >
        {navigation}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Chiudi navigazione"
          />
          <aside className="relative flex h-full w-[286px] flex-col bg-[#171914] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Chiudi navigazione"
            >
              <X className="size-5" />
            </button>
            {navigation}
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-300 ${compact ? "lg:pl-[76px]" : "lg:pl-[264px]"}`}>
        <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f3f4ef]/90 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-7 lg:px-9">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid size-10 place-items-center rounded-2xl border border-black/[0.08] bg-white lg:hidden"
              aria-label="Apri navigazione"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/35">
                Meraki / Workspace
              </p>
              <h1 className="truncate text-sm font-extrabold tracking-[-0.02em]">
                {currentItem?.name || "Pannello di controllo"}
              </h1>
            </div>
            <button
              type="button"
              className="hidden h-10 w-56 items-center gap-2 rounded-2xl border border-black/[0.07] bg-white px-3 text-xs text-black/35 shadow-sm sm:flex"
            >
              <Search className="size-4" />
              Cerca nel pannello
              <kbd className="ml-auto rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[9px] font-bold">⌘ K</kbd>
            </button>
            <span className="flex items-center gap-2 rounded-full border border-emerald-700/10 bg-emerald-100/70 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-800">
              <Activity className="size-3" />
              Live
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          {children}
        </main>
      </div>
    </div>
  );
}
