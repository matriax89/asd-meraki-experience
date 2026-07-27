type Person = {
  id: string;
  nome: string;
  cognome: string;
  ruolo: string;
  bio?: string | null;
  foto_url?: string | null;
};

export function EventPeople({
  instructor,
  guests,
}: {
  instructor?: Person | null;
  guests?: Person[];
}) {
  const people = [
    ...(instructor ? [{ ...instructor, label: "Istruttore responsabile" }] : []),
    ...(guests || []).filter(person => person.id !== instructor?.id).map(person => ({ ...person, label: "Ospite" })),
  ];
  if (!people.length) return null;

  return (
    <section className="border-t border-slate-200 pt-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Protagonisti dell’evento</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {people.map(person => (
          <article key={`${person.label}-${person.id}`} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
            {person.foto_url ? (
              <img src={person.foto_url} alt={`${person.nome} ${person.cognome}`} className="size-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg font-bold text-slate-500">
                {person.nome.charAt(0)}{person.cognome.charAt(0)}
              </span>
            )}
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">{person.label}</span>
              <h3 className="mt-0.5 font-semibold text-slate-950">{person.nome} {person.cognome}</h3>
              <p className="text-xs text-slate-500">{person.ruolo}</p>
              {person.bio && <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{person.bio}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
