"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/routing";
import { ArrowUpRight, CalendarDays, ChevronRight, Dumbbell, Handshake, LayoutDashboard, LogOut, Menu, Plus, RotateCcw, Search, Settings, ShoppingBag, Sparkles, Ticket, Users, X } from "lucide-react";
import styles from "./admin-shell.module.css";

const navigation = [
  { label: "Gestione eventi", items: [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard, hint: "statistiche incassi panoramica" },
    { name: "Eventi", href: "/admin/eventi", icon: CalendarDays, hint: "workshop masterclass prezzi locandina" },
    { name: "Iscritti e check-in", href: "/admin/biglietti", icon: Ticket, hint: "partecipanti biglietti scanner" },
    { name: "Affiliati", href: "/admin/affiliati", icon: Users, hint: "venditori gruppi iscrizioni" },
    { name: "Rimborsi", href: "/admin/rimborsi", icon: RotateCcw, hint: "pagamenti annullamento" },
  ] },
  { label: "Relazioni e contenuti", items: [
    { name: "Richieste e contatti", href: "/admin/leads", icon: Users, hint: "leads messaggi" },
    { name: "Contatti e consensi", href: "/admin/contatti", icon: Users, hint: "newsletter marketing dati partecipanti" },
    { name: "Corsi", href: "/admin/corsi", icon: Dumbbell, hint: "catalogo lezioni" },
    { name: "Prova gratuita", href: "/admin/prova-gratuita", icon: Sparkles, hint: "richieste prova" },
    { name: "Partner e sponsor", href: "/admin/sponsors", icon: Handshake, hint: "collaborazioni" },
  ] },
  { label: "Configurazione", items: [
    { name: "Storico ordini", href: "/admin/ordini", icon: ShoppingBag, hint: "negozio consegne" },
    { name: "Impostazioni", href: "/admin/impostazioni", icon: Settings, hint: "sito integrazioni email" },
  ] },
];
const items = navigation.flatMap(group => group.items);
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function AdminNavigation({ activeHref, onNavigate }: { activeHref: string; onNavigate?: () => void }) {
  return navigation.map(group => <div key={group.label} className={styles.group}>
    <p className={styles.groupLabel}>{group.label}</p>
    {group.items.map(item => <Link key={item.href} href={item.href} prefetch={false} onClick={onNavigate} aria-current={item.href === activeHref ? "page" : undefined} className={`${styles.navItem} ${item.href === activeHref ? styles.navActive : ""}`}><item.icon aria-hidden="true" size={18}/><span>{item.name}</span>{item.href === activeHref ? <span className={styles.activeDot}/> : null}</Link>)}
  </div>);
}

export function AdminShell({ children, fullName, email, role, dateLabel }: {
  children: ReactNode; fullName: string; email: string; role: "admin" | "editor"; dateLabel: string;
}) {
  const pathname = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const fieldId = useId();
  const section = [...items].reverse().find(item => item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)) || items[0];
  const pageLabel = pathname.endsWith("/statistiche") ? "Statistiche evento" : pathname.endsWith("/commerce") ? "Formule e prezzi" : pathname === "/admin/eventi/nuovo" ? "Nuovo evento" : section.name;
  const matches = useMemo(() => items.filter(item => normalize(`${item.name} ${item.hint}`).includes(normalize(query.trim()))), [query]);
  const closeMenu = () => menu.current?.close();
  const closeSearch = () => search.current?.close();
  const profile = <div className={styles.profile}><span className={styles.avatar}>{(fullName || email || "M").slice(0, 1).toUpperCase()}</span><div><strong>{fullName || "Meraki"}</strong><span title={email}>{email}</span></div></div>;

  return <div className={`meraki-admin ${styles.shell}`}>
    <a href="#meraki-admin-content" className={styles.skip}>Vai al contenuto</a>
    <aside className={styles.sidebar}>
      <Link href="/admin" className={styles.brand} aria-label="Meraki, dashboard amministrazione"><Image src="/images/logo-meraki-horizontal-white.webp" alt="Meraki Experience" width={205} height={64} unoptimized/><span>AMMINISTRAZIONE</span></Link>
      <nav className={styles.navigation} aria-label="Amministrazione"><AdminNavigation activeHref={section.href}/></nav>
      <div className={styles.sidebarFooter}>{profile}<form action="/auth/signout" method="post"><button className={styles.signOut} type="submit"><LogOut aria-hidden="true" size={16}/>Disconnetti</button></form></div>
    </aside>
    <div className={styles.mainColumn}>
      <header className={styles.topbar}>
        <div className={styles.location}><button type="button" ref={menuButton} className={styles.menuButton} aria-label="Apri menu amministrazione" onClick={() => menu.current?.showModal()}><Menu aria-hidden="true" size={20}/></button><nav aria-label="Percorso" className={styles.breadcrumb}><Link href="/admin">Meraki</Link><ChevronRight size={14} aria-hidden="true"/><span>{pageLabel}</span></nav></div>
        <div className={styles.topActions}><span className={styles.today}>{dateLabel}</span><button ref={searchButton} type="button" className={styles.searchButton} aria-label="Cerca una sezione del pannello" onClick={() => search.current?.showModal()}><Search aria-hidden="true" size={17}/><span>Cerca nel pannello</span></button><Link href="/admin/eventi/nuovo" className={styles.newEvent}><Plus size={17} aria-hidden="true"/><span>Nuovo evento</span></Link><Link href="/eventi" target="_blank" rel="noopener noreferrer" className={styles.publicLink} aria-label="Apri sito pubblico in una nuova scheda"><ArrowUpRight size={19} aria-hidden="true"/></Link></div>
      </header>
      <main id="meraki-admin-content" tabIndex={-1} className={styles.workspace}><div className={styles.content}>{children}</div><footer className={styles.pageFooter}><span>Meraki Experience · Pannello {role === "admin" ? "amministratore" : "staff"}</span><span>Orari italiani · Europe/Rome</span></footer></main>
    </div>
    <dialog ref={menu} className={styles.menuDialog} onClose={() => menuButton.current?.focus()} onClick={event => { if (event.target === event.currentTarget) closeMenu(); }} aria-label="Menu amministrazione"><div className={styles.drawer}><div className={styles.drawerHeader}><span>Meraki Admin</span><button type="button" onClick={closeMenu} aria-label="Chiudi menu"><X size={20}/></button></div><nav aria-label="Navigazione amministrazione mobile" className={styles.navigation}><AdminNavigation activeHref={section.href} onNavigate={closeMenu}/></nav>{profile}<form action="/auth/signout" method="post"><button type="submit" className={styles.signOut}><LogOut size={16} aria-hidden="true"/>Disconnetti</button></form></div></dialog>
    <dialog ref={search} className={styles.searchDialog} aria-labelledby={`${fieldId}-title`} onClose={() => { setQuery(""); searchButton.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) closeSearch(); }}><div className={styles.searchPanel}><div className={styles.searchHeader}><h2 id={`${fieldId}-title`}>Dove vuoi andare?</h2><button type="button" onClick={closeSearch} aria-label="Chiudi ricerca"><X size={20}/></button></div><label htmlFor={fieldId} className={styles.searchInput}><Search size={18} aria-hidden="true"/><input id={fieldId} autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Eventi, iscritti, rimborsi…" autoComplete="off" aria-label="Cerca nel pannello"/></label><div className={styles.searchResults}>{matches.length ? matches.map(item => <Link key={item.href} href={item.href} prefetch={false} onClick={closeSearch}><item.icon size={18} aria-hidden="true"/><span>{item.name}</span><ChevronRight size={16} aria-hidden="true"/></Link>) : <p role="status">Nessuna sezione trovata. Prova “eventi” o “iscritti”.</p>}</div><p className={styles.searchHelp}>Premi Esc per chiudere · Cerca tra le sezioni del pannello</p></div></dialog>
  </div>;
}
