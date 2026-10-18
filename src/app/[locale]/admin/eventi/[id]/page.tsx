import { getEvent } from "@/app/api/admin/eventi/actions";
import { EventForm } from "./event-form";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
            ? "Inserisci i dettagli per un nuovo evento, masterclass o workshop." 
            : "Aggiorna i dettagli di questo evento. Le modifiche saranno visibili sul sito immediatamente."}
        </p>
      </div>

      {id !== "nuovo" && <Link href={`/admin/eventi/${id}/commerce`} className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-indigo-900"><span><strong className="block">Formule, scaglioni e cross-selling</strong><span className="mt-1 block text-sm">Configura workshop, masterclass, cena e consulta vendite e lista d’attesa.</span></span><span aria-hidden="true">→</span></Link>}

      <EventForm initialData={initialData} />
    </div>
  );
}
