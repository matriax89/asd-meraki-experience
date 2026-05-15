type TeamMember = {
  id: string;
  nome: string;
  cognome: string;
  ruolo: string;
  bio?: string | null;
  foto_url?: string | null;
  instagram?: string | null;
};

export function TeamGrid({ members }: { members: TeamMember[] }) {
  if (!members || members.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Nessun membro del team trovato.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
      {members.map((member) => (
        <div key={member.id} className="group flex flex-col items-center text-center">
          <div className="w-40 h-40 md:w-56 md:h-56 rounded-[2rem] overflow-hidden bg-secondary/30 mb-6 relative border border-border/40 group-hover:border-border transition-all duration-500 shadow-sm group-hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] group-hover:-translate-y-2">
            {member.foto_url ? (
              <img 
                src={member.foto_url} 
                alt={`${member.nome} ${member.cognome}`} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground/30 bg-secondary/50">
                {member.nome[0]}{member.cognome[0]}
              </div>
            )}
          </div>
          
          <h3 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-1 group-hover:text-slate-600 transition-colors">
            {member.nome} {member.cognome}
          </h3>
          <div className="flex flex-col items-center gap-0.5 mb-4">
            {member.ruolo?.split('\n').map((r, i) => r.trim() && (
              <p key={i} className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                {r.trim()}
              </p>
            ))}
          </div>
          
          {member.bio && (
            <p className="text-slate-500 text-[14px] leading-relaxed line-clamp-3 max-w-xs">
              {member.bio}
            </p>
          )}

          {member.instagram && (
            <a 
              href={member.instagram} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="mt-4 text-slate-400 hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
              </svg>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
