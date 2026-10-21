"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Compass, Info, Ticket, UserRound } from "lucide-react";
import { Link } from "@/i18n/routing";
import { getMerakiRouteState } from "@/lib/meraki-routes";
import { LanguageSwitcher } from "@/components/public/language-switcher";
import styles from "./app-shell.module.css";

export { isMerakiRoute } from "@/lib/meraki-routes";

const copy = {
  it: { discover: "Scopri", tickets: "Biglietti", profile: "Info", signIn: "Accesso staff", staffArea: "Area staff", back: "Indietro", navigation: "Navigazione Meraki", skip: "Vai al contenuto", experience: "Esperienze", ticket: "Il tuo biglietto", payment: "Pagamento" },
  en: { discover: "Discover", tickets: "Tickets", profile: "Info", signIn: "Staff sign-in", staffArea: "Staff area", back: "Back", navigation: "Meraki navigation", skip: "Skip to content", experience: "Experiences", ticket: "Your ticket", payment: "Payment" },
  de: { discover: "Entdecken", tickets: "Tickets", profile: "Info", signIn: "Team-Anmeldung", staffArea: "Teambereich", back: "Zurück", navigation: "Meraki-Navigation", skip: "Zum Inhalt", experience: "Erlebnisse", ticket: "Dein Ticket", payment: "Zahlung" },
  es: { discover: "Descubre", tickets: "Entradas", profile: "Info", signIn: "Acceso del equipo", staffArea: "Área del equipo", back: "Volver", navigation: "Navegación de Meraki", skip: "Ir al contenido", experience: "Experiencias", ticket: "Tu entrada", payment: "Pago" },
};

const destinations = [
  { key: "discover", href: "/eventi", icon: Compass },
  { key: "tickets", href: "/biglietti", icon: Ticket },
  { key: "profile", href: "/profilo", icon: Info },
] as const;

function subscribeStandalone(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const getServerStandalone = () => false;

export function MerakiAppShell({ children, locale, logoUrl, staffAccess = false }: { children: ReactNode; locale?: string; logoUrl?: string; staffAccess?: boolean }) {
  const contextLocale = useLocale();
  const pathname = usePathname();
  const text = copy[(locale ?? contextLocale) as keyof typeof copy] ?? copy.it;
  const route = getMerakiRouteState(pathname);
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, getServerStandalone);

  return (
    <div className={`meraki-app ${styles.shell}${standalone ? ` ${styles.standalone}` : ""}`} data-meraki-app>
      <a className={styles.skipLink} href="#meraki-content">{text.skip}</a>
      <header className={styles.header}>
        <div className={`${styles.headerInner}${route.isDetail ? ` ${styles.detailHeader}` : ""}`}>
          <div className={`${styles.headerSide} ${styles.headerStart}`}>
            {route.isDetail ? (
              <Link href={route.backHref} className={styles.iconButton} aria-label={text.back}>
                <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            ) : null}
            <LanguageSwitcher compact align="start" />
          </div>
          <Link href="/eventi" className={styles.wordmark} aria-label="Meraki Experience">
            <Image
              src={logoUrl || "/images/logo-meraki-horizontal.webp"}
              alt="Meraki Experience"
              width={901}
              height={238}
              className={styles.brandLogo}
              sizes="210px"
              unoptimized={!logoUrl}
              priority
            />
          </Link>
          <div className={`${styles.headerSide} ${styles.headerEnd}`}>
            <Link href={staffAccess ? "/admin/biglietti" : "/login"} className={styles.iconButton} aria-label={staffAccess ? text.staffArea : text.signIn} title={staffAccess ? text.staffArea : text.signIn}>
              <UserRound size={19} strokeWidth={1.7} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main id="meraki-content" className={styles.content} tabIndex={-1}>
        {children}
      </main>
      {standalone ? (
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
      ) : null}
    </div>
  );
}
