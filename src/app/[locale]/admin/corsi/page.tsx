import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/admin/data-table";
import { Link } from "@/i18n/routing";

export default async function AdminCorsiPage() {
  const supabase = await createClient();

  const { data: courses, error } = await supabase
    .from('courses')
    .select(`
      id,
      nome,
      disciplina,
      livello,
      durata_minuti,
      attivo,
      instructor_id,
      team_members (
        nome,
        cognome
      )
    `)
    .order('ordine_display', { ascending: true });

  if (error) {
    console.error("Error fetching courses:", error);
    return <div>Errore durante il caricamento dei corsi.</div>;
  }

  const formattedCourses = (courses || []).map(c => ({
    ...c,
    istruttore: Array.isArray(c.team_members) ? c.team_members[0] : c.team_members
  }));

  const columns = [
    {
      header: "Corso",
      cell: (course: any) => (
        <div>
          <span className="block font-bold text-slate-900">{course.nome}</span>
          <span className="block text-[13px] text-slate-500 uppercase tracking-widest mt-0.5">{course.disciplina}</span>
        </div>
      )
    },
    {
      header: "Istruttore",
      cell: (course: any) => course.istruttore ? <span className="font-bold text-slate-700">{course.istruttore.nome} {course.istruttore.cognome}</span> : <span className="text-slate-400">-</span>
    },
    {
      header: "Dettagli",
      cell: (course: any) => (
        <span className="text-[13px] font-medium text-slate-500">
          {course.livello || 'Tutti i livelli'} &middot; {course.durata_minuti ? `${course.durata_minuti} min` : '-'}
        </span>
      )
    },
    {
      header: "Stato",
      cell: (course: any) => course.attivo 
        ? <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Attivo</span>
        : <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Disattivato</span>
    },
    {
      header: "Azioni",
      cell: (course: any) => (
        <Link href={`/admin/corsi/${course.id}`} className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
          Modifica
        </Link>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catalogo Corsi</h1>
          <p className="text-slate-500 mt-2">Gestisci le schede dei corsi mostrati sul sito pubblico.</p>
        </div>
        <Link href="/admin/corsi/nuovo" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 hover:shadow-lg transition-all active:scale-95">
          + Nuovo Corso
        </Link>
      </div>

      <DataTable 
        data={formattedCourses} 
        columns={columns} 
        keyExtractor={(course) => course.id} 
      />
    </div>
  );
}
