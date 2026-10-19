import { getEvent } from "@/app/api/admin/eventi/actions";
import { EventForm } from "./event-form";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";

export default async function AdminEventPage({ params, searchParams }: { params: Promise<{ id: string; locale: string }>; searchParams?: Promise<{ ticketing?: string | string[] }> }) {
  const { id, locale } = await params;
  const query = searchParams ? await searchParams : {};
  let initialData = null;

  if (id !== "nuovo") {
    const { success, data, error } = await getEvent(id);
    if (!success || !data) {
      console.error(error);
      notFound();
    }
    initialData = data;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="mb-8">
        <Link href="/admin/eventi" className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Torna agli Eventi
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {id === "nuovo" ? "Crea Nuovo Evento" : "Modifica Evento"}
        </h1>
        <p className="text-slate-500 mt-2">
          {id === "nuovo" 
            ? "Inserisci i dettagli e scegli come vendere i biglietti: prezzo unico oppure formule, scaglioni e cena."
            : initialData?.attivo ? "Aggiorna i dettagli pubblicati oppure apri Formule e prezzi per gestire la biglietteria." : "Questo evento non è pubblicato. Completa i dettagli e la biglietteria prima di renderlo visibile."}
        </p>
      </div>

      {id !== "nuovo" && <div className="grid gap-3 md:grid-cols-2"><Link href={`/admin/eventi/${id}/commerce`} className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-indigo-900"><span><strong className="block">Formule e prezzi</strong><span className="mt-1 block text-sm">Workshop, masterclass, scaglioni, cena, vendite e lista d’attesa.</span></span><span aria-hidden="true">→</span></Link><Link href={`/admin/biglietti?event=${id}`} className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900"><span><strong className="block">Iscritti e check-in</strong><span className="mt-1 block text-sm text-slate-600">Partecipanti e accessi di questo evento.</span></span><span aria-hidden="true">→</span></Link></div>}

      <EventForm initialData={initialData} locale={locale} initialTicketingMode={query.ticketing === "advanced" ? "advanced" : undefined} />
    </div>
  );
}
