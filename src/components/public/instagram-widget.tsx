import Script from "next/script";

export function InstagramWidget({ beholdUrl, profileUrl }: { beholdUrl?: string, profileUrl?: string }) {
  return (
    <div className="w-full relative pb-6 md:pb-12 min-h-[400px]">
      <style>{`
        /* Nascondiamo l'header originale di Elfsight perché abbiamo già il nostro titolo */
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 [class*="Header__Container"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 [class*="header"] {
          display: none !important;
        }
        
        /* Distruzione Totale del Watermark Elfsight tramite Taglio Fisico (Clip-Path) */
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 {
          /* Tagliamo fisicamente i 50 pixel inferiori ma MANTENIAMO i bordi arrotondati su tutti i lati! */
          clip-path: inset(0px 0px 50px 0px round 24px) !important;
          /* Tiriamo su il margine per compensare lo spazio vuoto lasciato dal taglio */
          margin-bottom: -50px !important;
          padding-bottom: 0 !important;
        }

        /* Arrotondiamo e diamo un tocco Apple-style al contenitore della griglia */
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 [class*="WidgetBackground__Content"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 {
          border-radius: 24px !important;
          overflow: hidden !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.08) !important;
          background: transparent !important;
        }
      `}</style>
      
      {/* Elfsight Instagram Feed */}
      <div className="elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63" data-elfsight-app-lazy></div>
      <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
    </div>
  );
}
