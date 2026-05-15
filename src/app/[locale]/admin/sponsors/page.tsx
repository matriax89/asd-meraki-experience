import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/admin/data-table";
import { Link } from "@/i18n/routing";
import Image from "next/image";

export default async function AdminSponsorsPage() {
  const supabase = await createClient();

  const { data: sponsors, error } = await supabase
    .from('sponsors')
    .select('*')
    .order('ordine_display', { ascending: true });

  if (error) {
    console.error("Error fetching sponsors:", error);
    return <div>Errore durante il caricamento dei partner.</div>;
  }

  const columns = [
    {
      header: "Logo",
      cell: (sponsor: any) => (
        <div className="relative w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
          {sponsor.logo_url ? (
            <Image 
              src={sponsor.logo_url} 
              alt={sponsor.nome} 
              fill 
              className="object-contain p-1"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
      )
    },
    {
      header: "Partner",
      cell: (sponsor: any) => (
        <div>
          <span className="block font-bold text-slate-900">{sponsor.nome}</span>
          {sponsor.link && (
            <a href={sponsor.link} target="_blank" rel="noopener noreferrer" className="text-[12px] text-indigo-500 hover:underline flex items-center gap-1 mt-0.5">
              {sponsor.link.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      )
    },
    {
      header: "Tier / Ordine",
      cell: (sponsor: any) => (
        <div>
          {sponsor.tier ? (
            <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px] font-bold uppercase tracking-wider mb-1">
              {sponsor.tier}
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[11px] font-bold uppercase tracking-wider mb-1">
              Base
            </span>
          )}
          <span className="block text-[12px] text-slate-500 font-medium">Posizione: {sponsor.ordine_display || 0}</span>
        </div>
      )
    },
    {
      header: "Stato",
      cell: (sponsor: any) => sponsor.attivo 
        ? <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Visibile</span>
        : <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Nascosto</span>
    },
    {
      header: "Azioni",
      cell: (sponsor: any) => (
        <Link href={`/admin/sponsors/${sponsor.id}`} className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
          Modifica
        </Link>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Partner & Sponsor</h1>
          <p className="text-slate-500 mt-2">Gestisci i loghi e i link dei partner mostrati in homepage.</p>
        </div>
        <Link href="/admin/sponsors/nuovo" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 hover:shadow-lg transition-all active:scale-95">
          + Nuovo Sponsor
        </Link>
      </div>

      <DataTable 
        data={sponsors || []} 
        columns={columns} 
        keyExtractor={(sponsor) => sponsor.id} 
      />
    </div>
  );
}
