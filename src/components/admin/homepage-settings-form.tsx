"use client";

import { useState, useTransition } from "react";
import { updateHomepageCardSettings } from "@/lib/admin/settings-actions";
import { Loader2, Save } from "lucide-react";

export function HomepageSettingsForm({ initialSettings }: { initialSettings: any }) {
  const [masterclassImage, setMasterclassImage] = useState(initialSettings?.masterclass_image || "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success'|'error', text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await updateHomepageCardSettings({ masterclass_image: masterclassImage });
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
      } else {
        setMessage({ type: 'success', text: "Impostazioni salvate con successo!" });
      }
    });
  };

  return (
    <div className="bg-white rounded-[24px] p-8 border border-slate-200 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Sezione "Novità & Eventi" (Home)</h2>
      
      {message && (
        <div className={`p-4 rounded-xl mb-8 text-[13px] font-bold tracking-wide uppercase ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <label className="block text-[13px] font-bold text-slate-900 mb-2 uppercase tracking-wide">
            Immagine "Masterclass Aerial"
          </label>
          <input
            type="text"
            value={masterclassImage}
            onChange={(e) => setMasterclassImage(e.target.value)}
            placeholder="es. /images/v2/aerial_glow.png oppure https://..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all shadow-sm"
            required
          />
          <p className="text-[12px] text-slate-500 mt-2 font-medium">
            Immagine copertina per la card grande (Aerial Silks) in Home Page.
          </p>
        </div>

        <div className="pt-6 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="bg-slate-900 text-white font-bold px-6 py-3 rounded-xl hover:bg-slate-800 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 active:scale-95 text-sm"
          >
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-4 h-4" />}
            Salva Impostazioni
          </button>
        </div>
      </form>
    </div>
  );
}
