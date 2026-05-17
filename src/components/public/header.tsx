"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ShoppingCart, Menu, X, ArrowRight } from "lucide-react";
import { LanguageSwitcher } from "./language-switcher";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { usePathname } from "next/navigation";

import { CartDropdown } from "./cart-dropdown";
import Image from "next/image";

export function Header({ initialCartCount = 0, logoUrl, logoWhiteUrl }: { initialCartCount?: number, logoUrl?: string, logoWhiteUrl?: string }) {
  const t = useTranslations("Navigation");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Consider it home if pathname is exactly '/' or '/[locale]' or '/[locale]/'
  const isHome = /^\/([a-z]{2})?(\/)?$/.test(pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { key: "chi_siamo", href: "/#chi-siamo" },
    { key: "corsi", href: "/#corsi" },
    { key: "orario", href: "/#orario" },
    { key: "shop", href: "/shop" },
    { key: "contatti", href: "/contatti" },
  ] as const;

  const isTransparentAndHome = isHome && !scrolled;
  const textColorClass = isTransparentAndHome ? "text-white" : "text-foreground";
  const mutedTextColorClass = isTransparentAndHome ? "text-white/80" : "text-muted-foreground";
  const logoFillClass = isTransparentAndHome ? "fill-white text-black" : "fill-foreground text-white";

  return (
    <>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`fixed top-0 md:top-4 inset-x-0 z-50 flex justify-center px-0 md:px-4 transition-all duration-300`}
      >
        <div 
          className={`w-full md:max-w-6xl transition-all duration-500 ${
            scrolled
              ? "bg-white/80 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-200/50 md:rounded-[24px]"
              : "bg-transparent border border-transparent"
          }`}
        >
          <div className="px-5 md:px-6 flex h-16 md:h-18 items-center justify-between">
            {/* Logo */}
            <Link href="/" className={`flex items-center gap-2.5 transition-colors duration-300 ${textColorClass}`}>
              {(logoUrl || logoWhiteUrl) ? (
                <div className="relative h-10 w-32 md:h-12 md:w-40 flex-shrink-0">
                  <Image 
                    src={(isTransparentAndHome && logoWhiteUrl) ? logoWhiteUrl : (logoUrl || logoWhiteUrl || "")} 
                    alt="Meraki Logo" 
                    fill 
                    className="object-contain object-left" 
                    sizes="(max-width: 768px) 128px, 160px" 
                    priority
                  />
                </div>
              ) : (
                <>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <rect width="28" height="28" rx="7" className={isTransparentAndHome ? "fill-white" : "fill-foreground"} />
                    <text x="14" y="19" textAnchor="middle" fontSize="14" fontWeight="700" fontFamily="Inter, sans-serif" className={isTransparentAndHome ? "fill-black" : "fill-background"}>M</text>
                  </svg>
                  <span className="text-[15px] font-semibold tracking-tight">Meraki</span>
                </>
              )}
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1.5">
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-300 ${mutedTextColorClass} hover:text-slate-900 hover:bg-slate-100 hover:shadow-sm`}
                >
                  {t(l.key as any)}
                </Link>
              ))}
            </nav>

            {/* Right */}
            <div className={`flex items-center gap-2 transition-colors duration-300 ${textColorClass}`}>
              <div className="hidden sm:flex items-center">
                <LanguageSwitcher />
              </div>

              <CartDropdown initialCount={initialCartCount} isTransparentAndHome={isTransparentAndHome} />

              <Link
                href="/sponsors"
                className={`hidden md:inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-bold tracking-wide transition-all duration-300 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ml-2 ${
                  isTransparentAndHome ? "bg-white text-black hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {t("sponsor")}
                <ArrowRight className="w-4 h-4" />
              </Link>

              <button
                className="md:hidden p-2 rounded-lg hover:bg-secondary/20"
                onClick={() => setOpen(!open)}
              >
                {open ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background pt-24 px-6 md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="text-lg font-semibold text-foreground py-3 px-2 rounded-lg hover:bg-secondary transition-colors"
                >
                  {t(l.key as any)}
                </Link>
              ))}
              <Link
                href="/sponsors"
                onClick={() => setOpen(false)}
                className="mt-4 flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground text-background text-sm font-semibold"
              >
                {t("sponsor")}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <div className="mt-6 pt-6 border-t border-border">
                <LanguageSwitcher />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
