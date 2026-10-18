"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { ArrowLeft, Compass, Ticket, UserRound } from "lucide-react";
import { Link } from "@/i18n/routing";
import { getMerakiRouteState } from "@/lib/meraki-routes";
import styles from "./app-shell.module.css";

export { isMerakiRoute } from "@/lib/meraki-routes";

const copy = {
  it: { discover: "Scopri", tickets: "Biglietti", profile: "Tu", back: "Indietro", navigation: "Navigazione Meraki", skip: "Vai al contenuto", experience: "Esperienze", ticket: "Il tuo biglietto", payment: "Pagamento" },
  en: { discover: "Discover", tickets: "Tickets", profile: "You", back: "Back", navigation: "Meraki navigation", skip: "Skip to content", experience: "Experiences", ticket: "Your ticket", payment: "Payment" },
  de: { discover: "Entdecken", tickets: "Tickets", profile: "Du", back: "Zurück", navigation: "Meraki-Navigation", skip: "Zum Inhalt", experience: "Erlebnisse", ticket: "Dein Ticket", payment: "Zahlung" },
  es: { discover: "Descubre", tickets: "Entradas", profile: "Tú", back: "Volver", navigation: "Navegación de Meraki", skip: "Ir al contenido", experience: "Experiencias", ticket: "Tu entrada", payment: "Pago" },
};

const destinations = [
  { key: "discover", href: "/eventi", icon: Compass },
  { key: "tickets", href: "/biglietti", icon: Ticket },
  { key: "profile", href: "/profilo", icon: UserRound },
] as const;

export function MerakiAppShell({ children, locale }: { children: ReactNode; locale?: string }) {
  const contextLocale = useLocale();
  const pathname = usePathname();
  const text = copy[(locale ?? contextLocale) as keyof typeof copy] ?? copy.it;
  const route = getMerakiRouteState(pathname);

  return (
    <div className={`meraki-app ${styles.shell}`} data-meraki-app>
      <a className={styles.skipLink} href="#meraki-content">{text.skip}</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerSide}>
            {route.isDetail ? (
              <Link href={route.backHref} className={styles.iconButton} aria-label={text.back}>
                <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            ) : <span className={styles.brandSymbol} aria-hidden="true">m</span>}
          </div>
          <Link href="/eventi" className={styles.wordmark} aria-label="Meraki Experience">
            <span>meraki<span className={styles.wordmarkDot}>.</span></span>
            <small>EXPERIENCE</small>
          </Link>
          <div className={`${styles.headerSide} ${styles.headerEnd}`}>
            <Link href="/profilo" className={styles.iconButton} aria-label={text.profile} aria-current={route.active === "profile" ? "page" : undefined}>
              <UserRound size={19} strokeWidth={1.7} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main id="meraki-content" className={styles.content} tabIndex={-1}>
        {children}
      </main>
      <div className={styles.bottomDock}>
        <nav className={styles.bottomNav} aria-label={text.navigation}>
          {destinations.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={href} className={`${styles.navItem} ${route.active === key ? styles.navItemActive : ""}`} aria-current={route.active === key ? "page" : undefined}>
              <span className={styles.navIcon}><Icon size={22} strokeWidth={route.active === key ? 2 : 1.65} aria-hidden="true" /></span>
              <span>{text[key]}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
