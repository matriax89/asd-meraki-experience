"use client";

import { useState, useEffect } from "react";
import { useCookieConsent } from "@/hooks/use-cookie-consent";
import { X, Check, Settings2, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/routing";

export function CookieBanner() {
  const { hasConsented, preferences, acceptAll, rejectAll, savePreferences } = useCookieConsent();
  const [showSettings, setShowSettings] = useState(false);
  const [localPreferences, setLocalPreferences] = useState(preferences);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalPreferences(preferences);
  }, [preferences]);

  if (!mounted || hasConsented) return null;

  const handleSaveSettings = () => {
    savePreferences(localPreferences);
    setShowSettings(false);
  };

  const togglePreference = (key: keyof typeof localPreferences) => {
    if (key === "necessary") return;
    setLocalPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      {/* Overlay if settings are open */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9998]" onClick={() => setShowSettings(false)} />
      )}

      {/* Main Banner / Modal */}
      <div className={`fixed z-[9999] transition-all duration-500 ease-out ${
        showSettings 
          ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md rounded-[32px]" 
          : "bottom-4 left-4 right-4 md:left-auto md:right-8 md:w-[420px] rounded-3xl translate-y-0"
      }`}>
        
        <div className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] overflow-hidden rounded-[inherit]">
          
          {/* Header */}
          <div className="p-6 pb-4 border-b border-slate-100 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-900">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">
                  {showSettings ? "Personalizza Cookie" : "La tua Privacy"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestiamo i tuoi dati con cura.
                </p>
              </div>
            </div>
            {showSettings && (
              <button onClick={() => setShowSettings(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-6">
            {!showSettings ? (
              // Simple View
              <div className="space-y-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Utilizziamo cookie per assicurarti la migliore esperienza sul nostro sito, analizzare il traffico e proporti contenuti in linea con i tuoi interessi. Leggi la nostra <Link href="/legal/cookie-policy" className="text-slate-900 font-semibold underline underline-offset-2">Cookie Policy</Link>.
                </p>
                <div className="flex flex-col gap-2.5">
                  <button onClick={acceptAll} className="w-full bg-slate-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-slate-800 hover:-translate-y-0.5 transition-all shadow-md">
                    Accetta Tutti
                  </button>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button onClick={rejectAll} className="w-full bg-white border border-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                      Rifiuta
                    </button>
                    <button onClick={() => setShowSettings(true)} className="w-full bg-slate-100 text-slate-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      Personalizza
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Advanced Settings View
              <div className="space-y-5">
                <div className="space-y-3">
                  <CookieToggle 
                    title="Strettamente Necessari" 
                    description="Cookie indispensabili per il funzionamento del sito (carrello, login, sicurezza)."
                    checked={true}
                    disabled={true}
                    onChange={() => {}}
                  />
                  <CookieToggle 
                    title="Statistiche" 
                    description="Ci aiutano a capire come i visitatori interagiscono con il sito in modo anonimo."
                    checked={localPreferences.analytics}
                    disabled={false}
                    onChange={() => togglePreference("analytics")}
                  />
                  <CookieToggle 
                    title="Marketing" 
                    description="Utilizzati per tracciare i visitatori sui siti web e proporre annunci pertinenti."
                    checked={localPreferences.marketing}
                    disabled={false}
                    onChange={() => togglePreference("marketing")}
                  />
                </div>
                
                <div className="pt-2">
                  <button onClick={handleSaveSettings} className="w-full bg-slate-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-slate-800 hover:-translate-y-0.5 transition-all shadow-md flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    Salva Preferenze
                  </button>
                </div>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </>
  );
}

function CookieToggle({ title, description, checked, disabled, onChange }: { title: string, description: string, checked: boolean, disabled: boolean, onChange: () => void }) {
  return (
    <div 
      className={`p-4 rounded-2xl border transition-all ${checked ? 'border-slate-300 bg-slate-50' : 'border-slate-100 bg-white'} ${!disabled && 'cursor-pointer hover:border-slate-300'}`}
      onClick={() => !disabled && onChange()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-slate-900 text-sm mb-1">{title}</h4>
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
        <div className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-300 ${checked ? 'bg-slate-900' : 'bg-slate-200'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${checked ? 'left-5' : 'left-1'}`} />
        </div>
      </div>
    </div>
  );
}
