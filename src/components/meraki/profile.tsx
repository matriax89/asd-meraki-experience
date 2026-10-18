"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Check, ChevronRight, Globe2, HeartHandshake, LifeBuoy, LockKeyhole, ScanLine, ShieldCheck, Smartphone, Ticket } from "lucide-react";
import { Link } from "@/i18n/routing";
import { InstallCard } from "@/components/pwa/install-card";
import styles from "./profile.module.css";

const copy = {
  it: {
    eyebrow: "IL TUO SPAZIO", title: "Ciao, sei a casa.", description: "Le tue esperienze iniziano da qui.",
    ticket: "I miei biglietti", ticketDescription: "Ritrova i tuoi QR e preparati a partire.",
    preferences: "A modo tuo", language: "Lingua dell’app", install: "Meraki sulla tua Home", installDescription: "Su iPhone e Android, aggiungi Meraki alla Home per aprirla come un’app.",
    support: "Siamo qui per te", help: "Hai bisogno di una mano?", helpDescription: "Contattaci per eventi e biglietti.", staff: "Accesso staff", staffDescription: "Check-in e gestione dei biglietti.",
    legal: "Info e privacy", privacy: "Informativa privacy", terms: "Termini e condizioni", cookies: "Cookie policy", footer: "Il tempo per stare bene è adesso.", switching: "Cambio lingua…",
  },
  en: {
    eyebrow: "YOUR SPACE", title: "Make yourself at home.", description: "Your experiences begin here.",
    ticket: "My tickets", ticketDescription: "Find your QR codes and get ready to go.",
    preferences: "Your way", language: "App language", install: "Meraki on your Home Screen", installDescription: "On iPhone and Android, add Meraki to your Home Screen to open it like an app.",
    support: "Here for you", help: "Need a hand?", helpDescription: "Contact us about events and tickets.", staff: "Staff access", staffDescription: "Check-in and ticket management.",
    legal: "Info and privacy", privacy: "Privacy policy", terms: "Terms and conditions", cookies: "Cookie policy", footer: "Make time to feel good.", switching: "Changing language…",
  },
  de: {
    eyebrow: "DEIN BEREICH", title: "Fühl dich wie zu Hause.", description: "Deine Erlebnisse beginnen hier.",
    ticket: "Meine Tickets", ticketDescription: "Finde deine QR-Codes und sei bereit.",
    preferences: "So, wie du magst", language: "App-Sprache", install: "Meraki auf deinem Home-Bildschirm", installDescription: "Füge Meraki auf iPhone und Android zum Home-Bildschirm hinzu und öffne es wie eine App.",
    support: "Wir sind für dich da", help: "Brauchst du Hilfe?", helpDescription: "Kontaktiere uns zu Events und Tickets.", staff: "Zugang für das Team", staffDescription: "Check-in und Ticketverwaltung.",
    legal: "Info und Datenschutz", privacy: "Datenschutzerklärung", terms: "Allgemeine Geschäftsbedingungen", cookies: "Cookie-Richtlinie", footer: "Jetzt ist Zeit, dich wohlzufühlen.", switching: "Sprache wird geändert…",
  },
  es: {
    eyebrow: "TU ESPACIO", title: "Estás en casa.", description: "Tus experiencias empiezan aquí.",
    ticket: "Mis entradas", ticketDescription: "Encuentra tus códigos QR y prepárate para disfrutar.",
    preferences: "A tu manera", language: "Idioma de la app", install: "Meraki en tu pantalla de inicio", installDescription: "En iPhone y Android, añade Meraki a la pantalla de inicio para abrirla como una app.",
    support: "Estamos para ayudarte", help: "¿Necesitas ayuda?", helpDescription: "Contacta con nosotros sobre eventos y entradas.", staff: "Acceso del equipo", staffDescription: "Control de acceso y gestión de entradas.",
    legal: "Información y privacidad", privacy: "Política de privacidad", terms: "Términos y condiciones", cookies: "Política de cookies", footer: "Es momento de sentirte bien.", switching: "Cambiando idioma…",
  },
};

export function MerakiProfile({ locale }: { locale: string }) {
  const text = copy[locale as keyof typeof copy] ?? copy.it;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function changeLanguage(nextLocale: string) {
    if (nextLocale === locale) return;
    const path = pathname.replace(/^\/(it|en|de|es)(?=\/|$)/, "");
    startTransition(() => router.replace(`/${nextLocale}${path}${window.location.search}${window.location.hash}`, { scroll: false }));
  }

  return (
    <div className={styles.page} aria-labelledby="profile-title">
      <div className={styles.intro}>
        <span className={styles.eyebrow}>{text.eyebrow}</span>
        <h1 id="profile-title">{text.title}</h1>
        <p>{text.description}</p>
      </div>

      <Link href="/biglietti" className={styles.ticketCard}>
        <span className={styles.ticketIcon}><Ticket size={28} strokeWidth={1.5} aria-hidden="true" /></span>
        <span><strong>{text.ticket}</strong><small>{text.ticketDescription}</small></span>
        <ChevronRight size={22} aria-hidden="true" />
      </Link>

      <section aria-labelledby="preferences-title" className={styles.section}>
        <h2 id="preferences-title">{text.preferences}</h2>
        <div className={styles.card}>
          <div className={styles.cardTitle}><Globe2 size={20} aria-hidden="true" /><h3>{text.language}</h3></div>
          <div className={styles.languages} role="group" aria-label={text.language}>
            {([{ value: "it", label: "Italiano" }, { value: "en", label: "English" }, { value: "de", label: "Deutsch" }, { value: "es", label: "Español" }]).map(({ value, label }) => (
              <button key={value} type="button" lang={value} aria-pressed={locale === value} disabled={isPending} onClick={() => changeLanguage(value)}>
                {label}{locale === value ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <span role="status" className={styles.status}>{isPending ? text.switching : ""}</span>
        </div>
        <div className={`${styles.card} ${styles.installCard}`}>
          <div className={styles.cardTitle}><Smartphone size={20} aria-hidden="true" /><h3>{text.install}</h3></div>
          <p>{text.installDescription}</p>
          <InstallCard locale={locale} />
        </div>
      </section>

      <section aria-labelledby="support-title" className={styles.section}>
        <h2 id="support-title">{text.support}</h2>
        <div className={styles.linkGroup}>
          <Link href="/profilo/assistenza" className={styles.row}>
            <LifeBuoy size={21} strokeWidth={1.6} aria-hidden="true" /><span><strong>{text.help}</strong><small>{text.helpDescription}</small></span><ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/admin/biglietti" className={styles.row}>
            <ScanLine size={21} strokeWidth={1.6} aria-hidden="true" /><span><strong>{text.staff}</strong><small>{text.staffDescription}</small></span><LockKeyhole size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="legal-title" className={styles.section}>
        <h2 id="legal-title">{text.legal}</h2>
        <div className={styles.linkGroup}>
          {[
            { href: "/legal/privacy-policy", label: text.privacy },
            { href: "/legal/termini-e-condizioni", label: text.terms },
            { href: "/legal/cookie-policy", label: text.cookies },
          ].map(({ href, label }) => (
            <Link key={href} href={href} target="_blank" rel="noopener noreferrer" className={`${styles.row} ${styles.legalRow}`}>
              <ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span><ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <p className={styles.signoff}><HeartHandshake size={17} strokeWidth={1.5} aria-hidden="true" />{text.footer}</p>
    </div>
  );
}
