import Image from "next/image";

// MOCK POSTS as fallback
const MOCK_POSTS = [
  { id: 1, image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=800" },
  { id: 2, image: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&q=80&w=800" },
  { id: 3, image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&q=80&w=800" },
  { id: 4, image: "https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&q=80&w=800" },
];

export async function InstagramWidget({ beholdUrl, profileUrl }: { beholdUrl?: string, profileUrl?: string }) {
  let posts: any[] = [];
  let fetchError = false;

  if (beholdUrl) {
    try {
      // Aggiungiamo un parametro per invalidare la vecchia cache incastrata su Vercel
      const cleanUrl = new URL(beholdUrl);
      cleanUrl.searchParams.set("v", "2"); 
      
      // Cache di 1 ora (3600 secondi) per restare nel piano gratuito
      const res = await fetch(cleanUrl.toString(), { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error("Failed to fetch Behold API");
      
      const data = await res.json();
      
      // Behold di solito restituisce un array di oggetti o un oggetto con un array
      // Dipende dalla configurazione, di solito è un array
      let rawPosts: any[] = [];
      if (Array.isArray(data)) {
        rawPosts = data;
      } else if (data.posts && Array.isArray(data.posts)) {
        rawPosts = data.posts;
      }

      // Ordina cronologicamente (dal più recente al più vecchio) usando il timestamp di Instagram
      if (rawPosts.length > 0) {
        rawPosts.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        posts = rawPosts.slice(0, 4);
      }
    } catch (err) {
      console.error("Error fetching Instagram posts via Behold:", err);
      fetchError = true;
    }
  }

  // Se non abbiamo un URL di Behold o c'è stato un errore o l'array è vuoto, usiamo i mock
  const isMock = posts.length === 0 || !beholdUrl || fetchError;
  const displayPosts = isMock ? MOCK_POSTS : posts;

  return (
    <div className="w-full relative pb-6 md:pb-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {displayPosts.map((post: any, idx: number) => {
          // La struttura di Behold usa thumbnailUrl per video, mediaUrl per immagini
          const imageUrl = isMock ? post.image : (post.thumbnailUrl || post.mediaUrl || post.sizes?.large?.mediaUrl);
          const postLink = isMock ? profileUrl : (post.permalink || profileUrl);

          return (
            <a 
              key={post.id || idx}
              href={postLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-[4/5] rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-[0_20px_40px_rgb(219,39,119,0.2)] md:even:translate-y-6 transition-all duration-500 bg-slate-100"
            >
              {imageUrl && (
                <Image 
                  src={imageUrl} 
                  alt={post.caption || "Instagram Post"} 
                  fill 
                  className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
              )}
              
              {/* Instagram Icon Badge (Top Right) */}
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-80 group-hover:opacity-100 transition-opacity z-10">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </div>
              {/* Hover overlay per un look moderno */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                <svg className="w-10 h-10 text-white drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </div>
            </a>
          );
        })}
      </div>
      
      {/* Messaggio solo se non è configurato l'URL */}
      {isMock && (
        <div className="text-center text-sm text-slate-500 mt-12 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm max-w-2xl mx-auto">
          <p className="mb-2 font-semibold text-slate-700">Immagini Provvisorie (Behold.so non configurato)</p>
          <p className="text-slate-500 text-xs">
            Vai in <strong>Admin &gt; Impostazioni &gt; Contatti & Social</strong> e incolla il link "Feed URL" di Behold.so per attivare il fetch automatico.
          </p>
        </div>
      )}
    </div>
  );
}
