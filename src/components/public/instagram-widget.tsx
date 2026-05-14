"use client";

import Image from "next/image";

// Placeholder data - we can connect this to Behold.so or a Supabase table later
const MOCK_POSTS = [
  { id: 1, image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=800", likes: 124, comments: 12 },
  { id: 2, image: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&q=80&w=800", likes: 89, comments: 5 },
  { id: 3, image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&q=80&w=800", likes: 256, comments: 34 },
  { id: 4, image: "https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&q=80&w=800", likes: 167, comments: 8 },
];

export function InstagramWidget() {
  return (
    <div className="w-full relative">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {MOCK_POSTS.map((post) => (
          <a 
            key={post.id}
            href="https://www.instagram.com/merakiexperience_official"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square rounded-2xl md:rounded-[2rem] overflow-hidden shadow-sm hover:shadow-[0_20px_40px_rgb(219,39,119,0.15)] hover:-translate-y-2 transition-all duration-500 bg-slate-100"
          >
            <Image 
              src={post.image} 
              alt="Instagram Post" 
              fill 
              className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
            />
            {/* Hover overlay with likes and comments */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex items-center gap-6 text-white font-bold text-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  <span>{post.likes}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
                  <span>{post.comments}</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
      
      {/* Istruzioni per l'utente */}
      <div className="text-center text-sm text-slate-500 mt-12 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm max-w-2xl mx-auto">
        <p className="mb-2 font-semibold text-slate-700">Vuoi rendere queste immagini automatiche o gestirle tu?</p>
        <p className="text-slate-500">
          Questa è una griglia personalizzata (senza loghi esterni). Possiamo collegarla in due modi:
        </p>
        <div className="mt-4 flex flex-col sm:flex-row gap-4 text-left justify-center">
          <div className="bg-slate-50 p-4 rounded-xl flex-1 border border-slate-100">
            <p className="font-bold text-slate-700 mb-1">1. Tramite Behold.so</p>
            <p className="text-xs">Usa un servizio come Behold.so che ci passa i dati senza sporcare il design con watermark.</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl flex-1 border border-slate-100">
            <p className="font-bold text-slate-700 mb-1">2. Gestione Manuale</p>
            <p className="text-xs">Aggiungiamo una sezione nel Pannello Admin dove puoi caricare tu le tue 4 foto preferite.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
