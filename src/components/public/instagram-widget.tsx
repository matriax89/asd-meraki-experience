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
        
        /* Distruzione Totale del Watermark Elfsight */
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 a[href*="elfsight"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 a[href*="apps.elfsight.com"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 [class*="Badge__BadgeTemplate"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 [class*="badge"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 [class*="eapps-link"],
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 > div > a,
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 > div > div:last-child > a,
        a[href*="elfsight.com"],
        a[title*="Free Instagram Feed"],
        a[title*="Elfsight"] {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          position: absolute !important;
          z-index: -9999 !important;
          font-size: 0 !important;
          color: transparent !important;
          transform: scale(0) !important;
          overflow: hidden !important;
        }

        /* Se il watermark è un elemento a blocco in fondo, lo nascondiamo brutalmente tagliando l'overflow */
        .elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63 {
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
