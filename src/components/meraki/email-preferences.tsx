"use client";

import { useEffect, useState } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/routing";

const copy = {
  it: { title: "Le tue email Meraki", purpose: "Scegli se ricevere via email novità, eventi e offerte di Meraki Experience. Questa scelta è facoltativa e non modifica acquisti, biglietti o email di servizio.", pending: "La tua scelta attende conferma.", subscribed: "Il consenso alle novità e promozioni Meraki è confermato.", unsubscribed: "Il consenso alle novità e promozioni Meraki è stato revocato. Le email di servizio restano attive.", confirm: "Confermo: voglio ricevere novità e promozioni", unsubscribe: "Revoca il consenso", invalid: "Questo link non è valido o è scaduto. Per assistenza puoi contattare Meraki.", error: "Non siamo riusciti a salvare la scelta. Riprova tra poco.", loading: "Verifica delle preferenze…", saving: "Salvataggio…", back: "Scopri gli eventi", help: "Contatta Meraki", privacy: "Informativa privacy", notice: "La semplice apertura del link non cambia il consenso. Conferma o revoca usando il pulsante." },
  en: { title: "Your Meraki emails", purpose: "Choose whether to receive email news, events and offers from Meraki Experience. This is optional and does not affect purchases, tickets or service emails.", pending: "Your choice is awaiting confirmation.", subscribed: "Your consent to Meraki news and promotions is confirmed.", unsubscribed: "Your consent to Meraki news and promotions has been withdrawn. Service emails remain active.", confirm: "I confirm: send me Meraki news and promotions", unsubscribe: "Withdraw consent", invalid: "This link is invalid or has expired. Contact Meraki for help.", error: "We could not save your choice. Please try again shortly.", loading: "Checking preferences…", saving: "Saving…", back: "Discover events", help: "Contact Meraki", privacy: "Privacy policy", notice: "Opening this link does not change your consent. Confirm or withdraw it using the button." },
  de: { title: "Deine Meraki-E-Mails", purpose: "Wähle, ob du Neuigkeiten, Events und Angebote von Meraki Experience per E-Mail erhalten möchtest. Die Wahl ist freiwillig und hat keinen Einfluss auf Käufe, Tickets oder Service-E-Mails.", pending: "Deine Wahl wartet auf Bestätigung.", subscribed: "Deine Einwilligung zu Meraki-Neuigkeiten und Angeboten ist bestätigt.", unsubscribed: "Deine Einwilligung zu Meraki-Neuigkeiten und Angeboten wurde widerrufen. Service-E-Mails bleiben aktiv.", confirm: "Ich bestätige: Meraki-Neuigkeiten und Angebote erhalten", unsubscribe: "Einwilligung widerrufen", invalid: "Dieser Link ist ungültig oder abgelaufen. Kontaktiere Meraki, wenn du Hilfe benötigst.", error: "Deine Wahl konnte nicht gespeichert werden. Bitte versuche es gleich erneut.", loading: "Einstellungen werden geprüft…", saving: "Wird gespeichert…", back: "Events entdecken", help: "Meraki kontaktieren", privacy: "Datenschutzerklärung", notice: "Das Öffnen des Links ändert deine Einwilligung nicht. Nutze die Schaltfläche zum Bestätigen oder Widerrufen." },
  es: { title: "Tus emails de Meraki", purpose: "Elige si quieres recibir por email novedades, eventos y ofertas de Meraki Experience. Es opcional y no afecta a las compras, entradas ni emails de servicio.", pending: "Tu elección está pendiente de confirmación.", subscribed: "Tu consentimiento para las novedades y promociones de Meraki está confirmado.", unsubscribed: "Has retirado tu consentimiento para las novedades y promociones de Meraki. Los emails de servicio siguen activos.", confirm: "Confirmo: quiero recibir novedades y promociones", unsubscribe: "Retirar el consentimiento", invalid: "Este enlace no es válido o ha caducado. Contacta con Meraki si necesitas ayuda.", error: "No hemos podido guardar tu elección. Vuelve a intentarlo en unos momentos.", loading: "Comprobando preferencias…", saving: "Guardando…", back: "Descubrir eventos", help: "Contactar con Meraki", privacy: "Política de privacidad", notice: "Abrir el enlace no cambia tu consentimiento. Confirma o retíralo mediante el botón." },
};
type Preference = { status: "pending" | "subscribed" | "unsubscribed"; canConfirm: boolean; canUnsubscribe: boolean };

export function EmailPreferences({ locale, token }: { locale: string; token: string }) {
  const t = copy[locale as keyof typeof copy] || copy.it;
  const [preference, setPreference] = useState<Preference | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [invalid, setInvalid] = useState(!token);
  const [failure, setFailure] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetch(`/api/marketing/preferences?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) { if (response.status < 500) setInvalid(true); else setFailure(true); return; }
      setPreference(await response.json());
    }).catch(() => { if (!controller.signal.aborted) setFailure(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token]);

  async function save(action: "confirm" | "unsubscribe") {
    if (saving) return;
    setSaving(true); setFailure(false);
    try {
      const response = await fetch("/api/marketing/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action }) });
      if (!response.ok) { if (response.status < 500) setInvalid(true); else setFailure(true); return; }
      const result = await response.json();
      setPreference((current) => ({ status: result.status, canConfirm: false, canUnsubscribe: current?.canUnsubscribe === true && result.status !== "unsubscribed" }));
    } catch { setFailure(true); } finally { setSaving(false); }
  }
  return <div className="mx-auto max-w-lg px-5 pb-7 pt-8 sm:pt-12"><div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eee7d9] text-[#8c7348]"><MailCheck className="h-6 w-6" aria-hidden="true"/></div><h1 className="text-3xl font-bold tracking-tight text-[#18251f]">{t.title}</h1><p className="mt-4 text-sm leading-7 text-[#647062]">{t.purpose}</p><div className="mt-7 rounded-3xl border border-[#e1e4d9] bg-white p-6"><div role="status" aria-live="polite" className="text-sm font-semibold leading-7 text-[#18251f]">{loading ? t.loading : invalid ? t.invalid : preference ? t[preference.status] : ""}</div>{failure && <p role="alert" className="mt-3 text-sm leading-6 text-[#9b4b39]">{t.error}</p>}
    {!loading && !invalid && preference && <div className="mt-5 space-y-3">{preference.canConfirm && <button disabled={saving} onClick={() => save("confirm")} className="min-h-14 w-full rounded-2xl bg-[#18251f] px-4 py-3 text-sm font-semibold leading-6 text-white disabled:opacity-60">{saving ? t.saving : t.confirm}</button>}{preference.canUnsubscribe && <button disabled={saving} onClick={() => save("unsubscribe")} className="min-h-12 w-full rounded-2xl border border-[#dce1d4] px-4 py-3 text-sm font-semibold text-[#18251f] disabled:opacity-60">{saving ? t.saving : t.unsubscribe}</button>}</div>}
    <p className="mt-5 flex items-start gap-2 text-xs leading-6 text-[#78816f]"><ShieldCheck className="mt-1 h-4 w-4 shrink-0" aria-hidden="true"/>{t.notice}</p></div><div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#18251f]"><Link href="/eventi" className="inline-flex min-h-11 items-center underline underline-offset-4">{t.back}</Link><Link href="/profilo/assistenza" className="inline-flex min-h-11 items-center underline underline-offset-4">{t.help}</Link><Link href="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">{t.privacy}</Link></div></div>;
}
