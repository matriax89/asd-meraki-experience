"use client";

import Script from "next/script";

export function InstagramWidget() {
  return (
    <div className="w-full relative">
      {/* Elfsight Platform Script */}
      <Script src="https://static.elfsight.com/platform/platform.js" strategy="lazyOnload" />
      
      {/* 
        Sostituisci l'ID '00000000-0000-0000-0000-000000000000' con il VERO ID fornito da Elfsight.
        Quando il widget è configurato correttamente, Elfsight sostituirà questo div con il feed di Instagram.
      */}
      <div className="elfsight-app-00000000-0000-0000-0000-000000000000" data-elfsight-app-lazy></div>
      
      {/* Istruzioni per l'utente (visibili solo se il widget non si carica) */}
      <div className="text-center text-sm text-slate-500 mt-8 bg-slate-100 p-8 rounded-3xl border-2 border-dashed border-slate-300 shadow-inner">
        <h3 className="text-lg font-bold text-slate-800 mb-2">Configura il tuo Feed Instagram</h3>
        <p className="mb-4">Per mostrare le foto del tuo profilo, segui questi 3 semplici passi:</p>
        <ol className="text-left max-w-md mx-auto space-y-2 list-decimal list-inside text-slate-600 font-medium">
          <li>Crea un account su <a href="https://elfsight.com/instagram-feed-instashow/" target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">Elfsight Instagram Feed</a>.</li>
          <li>Collega il tuo profilo Instagram Meraki e scegli il design che preferisci (es. Griglia o Slider).</li>
          <li>Copia l'ID del widget e inseriscilo in questo file (<code className="bg-slate-200 px-1 py-0.5 rounded text-xs">src/components/public/instagram-widget.tsx</code>).</li>
        </ol>
      </div>
    </div>
  );
}
