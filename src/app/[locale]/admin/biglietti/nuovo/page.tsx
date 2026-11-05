import { Link } from "@/i18n/routing";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { loadParticipantRosterEvents } from "@/lib/admin/participant-roster";
import { ManualEnrollmentClient } from "@/components/admin/manual-enrollment-client";

export default async function ManualEnrollmentPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string; upgradePass?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  try { await requireCommerceStaff(); }
  catch { return <p role="alert">Accedi con un account autorizzato per iscrivere un partecipante.</p>; }
  if (query.event) {
    if (!/^[0-9a-f-]{36}$/i.test(query.event) || query.upgradePass && !/^[0-9a-f-]{36}$/i.test(query.upgradePass)) return <p role="alert">Seleziona un evento e un biglietto validi.</p>;
    return <ManualEnrollmentClient key={`${query.event}:${query.upgradePass || "new"}`} eventId={query.event} upgradePassId={query.upgradePass} locale={locale} />;
  }
  let events;
  try { events = await loadParticipantRosterEvents(locale); }
  catch { return <p role="alert">Impossibile caricare gli eventi. Ricarica la pagina.</p>; }
  const now = new Date().getTime();
  const upcoming = events.filter(event => Date.parse(event.startsAt) > now);
  return <div className="space-y-5"><header><h1 className="text-3xl font-semibold text-[#24382c]">Iscrivi partecipante</h1><p className="mt-2 text-sm text-[#63715b]">Scegli l’evento per registrare un pagamento già ricevuto in contanti o tramite POS.</p></header><ul className="divide-y divide-[#e5eadf] overflow-hidden rounded-2xl border border-[#dce2d5] bg-white">{upcoming.map(event => <li key={event.id}><Link className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-5 py-4 font-semibold text-[#36533e] hover:bg-[#f5f7f1]" href={`/admin/biglietti/nuovo?event=${event.id}`}><span>{event.title}</span><span className="text-sm font-normal">{new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(event.startsAt))} →</span></Link></li>)}</ul>{!upcoming.length && <p>Non ci sono eventi futuri disponibili.</p>}</div>;
}
