import { Link } from "@/i18n/routing";
import { loadParticipantRoster, loadParticipantRosterEvents } from "@/lib/admin/participant-roster";
import { ParticipantsClient } from "./participants-client";

type Query = { event?: string | string[]; affiliate?: string | string[]; status?: string | string[] };
const value = (entry: string | string[] | undefined) => typeof entry === "string" ? entry : entry === undefined ? undefined : "invalid";

export default async function AdminParticipantsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const eventId = value(query.event);
  if (eventId === undefined || eventId === "") {
    let events;
    try { events = await loadParticipantRosterEvents(locale); }
    catch {
      return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Non è stato possibile caricare gli eventi. Verifica l’accesso con un account autorizzato e ricarica la pagina.</p>;
    }
    return <div className="min-w-0 space-y-5"><header><h1 className="text-3xl font-semibold text-[#24382c]">Partecipanti degli eventi</h1><p className="mt-2 text-sm leading-6 text-[#63715b]">Seleziona un evento per consultare l’elenco completo ed esportare i dati di iscrizione.</p></header>{events.length ? <ul className="divide-y divide-[#e5eadf] overflow-hidden rounded-2xl border border-[#dce2d5] bg-white">{events.map(event => <li key={event.id}><Link href={`/admin/partecipanti?event=${event.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-[#36533e] hover:bg-[#f5f7f1]"><span className="min-w-0 break-words">{event.title}</span><span className="text-xs font-normal text-[#63715b]">{new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(event.startsAt))} →</span></Link></li>)}</ul> : <p className="rounded-2xl border border-[#dce2d5] bg-white p-5 text-sm text-[#63715b]">Non ci sono eventi disponibili.</p>}</div>;
  }
  let roster;
  try {
    roster = await loadParticipantRoster({ locale, eventId, affiliateId: value(query.affiliate), includeDocuments: false });
  } catch {
    return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Non è stato possibile caricare i partecipanti. Verifica l’evento, i filtri e l’accesso con un account autorizzato, poi ricarica la pagina.</p>;
  }
  const safeRoster = { ...roster, participants: roster.participants.map(participant => ({ ...participant, documentNumber: "" })) };
  return <ParticipantsClient key={`${roster.event.id}:${roster.affiliate?.id || "all"}`} data={safeRoster} initialStatus={query.status === "valid" ? "valid" : "all"} />;
}
