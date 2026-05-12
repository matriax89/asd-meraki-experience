import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/routing";
import { JsonLd } from "@/components/seo/json-ld";

export default async function CorsoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: corso } = await supabase
    .from("courses")
    .select("*, istruttore:team_members(*)")
    .eq("slug", slug)
    .single();

  if (!corso) {
    notFound();
  }

  // Costruisci lo schema Course dinamico in base ai dati del database
  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    "name": corso.nome,
    "description": corso.descrizione_breve || corso.nome,
    "provider": {
      "@type": "Organization",
      "name": "ASD Meraki Experience",
      "sameAs": "https://www.merakiexperience.org"
    },
    ...(corso.copertina_url && { "image": corso.copertina_url })
  };

  return (
    <>
      <JsonLd schema={courseSchema} />
      <div className="container py-12 md:py-24">
      {/* Hero Section */}
      <div className="aspect-[21/9] md:aspect-[3/1] bg-muted rounded-2xl overflow-hidden mb-12 relative border border-border">
        {corso.copertina_url ? (
          <img 
            src={corso.copertina_url} 
            alt={corso.nome} 
            className="object-cover w-full h-full" 
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/80 to-secondary/80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent flex items-end p-8 md:p-12">
          <div className="max-w-3xl">
            <div className="inline-block bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              {corso.disciplina}
            </div>
            <h1 className="text-4xl md:text-6xl font-heading font-bold text-foreground mb-4">
              {corso.nome}
            </h1>
            {corso.descrizione_breve && (
              <p className="text-xl md:text-2xl text-foreground/90">
                {corso.descrizione_breve}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-12">
          {corso.descrizione_lunga && (
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              {corso.descrizione_lunga.split("\n").map((par, i) => (
                <p key={i}>{par}</p>
              ))}
            </div>
          )}

          {corso.benefici && corso.benefici.length > 0 && (
            <div>
              <h2 className="text-3xl font-heading font-bold mb-6">Cosa imparerai</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {corso.benefici.map((ben, i) => (
                  <li key={i} className="flex items-start">
                    <svg className="w-6 h-6 text-primary mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{ben}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {corso.galleria_urls && corso.galleria_urls.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {corso.galleria_urls.map((url, i) => (
                <div key={i} className="aspect-square bg-muted rounded-xl overflow-hidden border border-border">
                  <img src={url} alt={`Galleria ${i}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <div className="bg-card border border-border rounded-xl p-8 space-y-6">
            <h3 className="text-xl font-bold font-heading">Dettagli del Corso</h3>
            
            <div className="space-y-4">
              {corso.livello && (
                <div>
                  <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Livello</div>
                  <div className="font-semibold">{corso.livello}</div>
                </div>
              )}
              {corso.durata_minuti && (
                <div>
                  <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Durata</div>
                  <div className="font-semibold">{corso.durata_minuti} minuti</div>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-border">
              <Link href={corso.cta_url || "/prova-gratuita"} className="w-full inline-block text-center bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 px-6 rounded-lg transition-colors">
                Prenota una Prova
              </Link>
            </div>
          </div>

          {corso.istruttore && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <h3 className="text-sm text-muted-foreground uppercase tracking-wider mb-6">Il tuo istruttore</h3>
              <div className="w-24 h-24 mx-auto rounded-full overflow-hidden bg-muted mb-4 border-2 border-primary/20">
                {corso.istruttore.foto_url ? (
                  <img src={corso.istruttore.foto_url} alt={corso.istruttore.nome} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-muted-foreground">
                    {corso.istruttore.nome[0]}
                  </div>
                )}
              </div>
              <h4 className="font-bold text-xl mb-1">{corso.istruttore.nome} {corso.istruttore.cognome}</h4>
              <p className="text-primary text-sm font-medium">{corso.istruttore.ruolo}</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
