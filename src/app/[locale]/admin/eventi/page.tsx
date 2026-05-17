import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/admin/data-table";
import { Link } from "@/i18n/routing";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";

export default async function AdminEventiPage() {
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: eventi, error } = await supabase
    .from('events')
    .select('*')
    .order('data_inizio', { ascending: false });

  if (error) {
    console.error("Error fetching eventi:", error);
    return <div>Errore durante il caricamento degli eventi.</div>;
  }

  const columns = [
    {
      header: "Evento",
      cell: (evento: any) => (
        <div>
          <span className="block font-bold text-slate-900">{getLocalizedText(evento.titolo, locale)}</span>
          <span className="block text-[13px] text-slate-500 uppercase tracking-widest mt-0.5">{evento.tipo}</span>
        </div>
      )
    },
    {
      header: "Data",
      cell: (evento: any) => (
        <div>
          <span className="font-bold text-slate-700">
            {new Date(evento.data_inizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span className="block text-[12px] text-slate-500 mt-0.5">
            {new Date(evento.data_inizio).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - {evento.data_fine ? new Date(evento.data_fine).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '...'}
          </span>
        </div>
      )
    },
    {
      header: "Prezzo",
      cell: (evento: any) => (
        <span className="font-medium text-slate-700">
          {evento.prezzo_cents ? `€${(evento.prezzo_cents / 100).toFixed(2)}` : 'Gratis'}
        </span>
      )
    },
    {
      header: "Biglietti",
      cell: (evento: any) => (
        <div>
          <span className="font-bold text-slate-700">{evento.posti_venduti || 0}</span>
          <span className="text-[12px] text-slate-500"> / {evento.capacity || '∞'} venduti</span>
        </div>
      )
    },
    {
      header: "Stato",
      cell: (evento: any) => evento.attivo 
        ? <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Attivo</span>
        : <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Disattivato</span>
    },
    {
      header: "Azioni",
      cell: (evento: any) => (
        <Link href={`/admin/eventi/${evento.id}`} className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
          Modifica
        </Link>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Eventi & Workshop</h1>
          <p className="text-slate-500 mt-2">Gestisci il calendario di eventi speciali e ritiri.</p>
        </div>
        <Link href="/admin/eventi/nuovo" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 hover:shadow-lg transition-all active:scale-95">
          + Nuovo Evento
        </Link>
      </div>

      <DataTable 
        data={eventi || []} 
        columns={columns} 
        keyExtractor={(evento) => evento.id} 
      />
    </div>
  );
}
