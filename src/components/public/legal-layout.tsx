"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/routing";
import { ShieldCheck, FileText, Cookie } from "lucide-react";

export function LegalLayout({ children, title, lastUpdated }: { children: React.ReactNode, title: string, lastUpdated: string }) {
  const pathname = usePathname();

  const links = [
    { href: "/legal/privacy-policy", label: "Privacy Policy", icon: ShieldCheck },
    { href: "/legal/termini-e-condizioni", label: "Termini e Condizioni", icon: FileText },
    { href: "/legal/cookie-policy", label: "Cookie Policy", icon: Cookie },
  ];

  return (
    <div className="container py-12 md:py-24 max-w-6xl">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-extrabold text-foreground tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-3">Ultimo aggiornamento: {lastUpdated}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 relative items-start">
        {/* Sidebar */}
        <aside className="w-full lg:w-64 flex-shrink-0 lg:sticky lg:top-32">
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <nav className="flex flex-col gap-1">
              {links.map((link) => {
                const isActive = pathname.includes(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
                      isActive 
                        ? "bg-white text-slate-900 font-bold shadow-sm border border-slate-200/60" 
                        : "text-slate-500 font-medium hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <link.icon className={`w-5 h-5 ${isActive ? "text-slate-900" : "text-slate-400"}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content (Bento Card) */}
        <main className="flex-1 w-full bg-white rounded-[40px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100/80 p-8 md:p-14 lg:p-16">
          <div className="prose prose-slate prose-lg dark:prose-invert max-w-none 
                          prose-headings:font-heading prose-headings:font-bold prose-headings:text-slate-900
                          prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-4 prose-h2:border-b prose-h2:border-slate-100
                          prose-p:text-slate-600 prose-p:leading-relaxed prose-li:text-slate-600">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
