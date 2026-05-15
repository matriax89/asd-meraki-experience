"use client";

import { useState } from "react";
import { saveProvaGratuitaContent } from "@/app/api/admin/impostazioni/actions";
import { Save, AlertCircle, Plus, Trash2, CheckCircle2 } from "lucide-react";

export function ProvaGratuitaClient({ initialData }: { initialData: any }) {
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [data, setData] = useState({
    badge: initialData?.badge || "Posti disponibili",
    titolo: initialData?.titolo || "Prova gratuita",
    sottotitolo: initialData?.sottotitolo || "Compila il modulo, verrai ricontattato entro 24 ore per fissare la tua prova.",
    steps: initialData?.steps || [
      { n: "1", title: "Compila", desc: "Lascia i tuoi dati e le preferenze." },
      { n: "2", title: "Ti chiamiamo", desc: "Scegliamo insieme il giorno." },
      { n: "3", title: "Allenati", desc: "La prima lezione è offerta." }
    ]
  });

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("payload", JSON.stringify(data));
      const result = await saveProvaGratuitaContent(formData);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      setMessage({ type: "success", text: "Impostazioni salvate con successo!" });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Errore durante il salvataggio" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateStep = (index: number, field: string, value: string) => {
    const newSteps = [...data.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setData({ ...data, steps: newSteps });
  };

  const addStep = () => {
    setData({
      ...data,
      steps: [
        ...data.steps,
        { n: String(data.steps.length + 1), title: "", desc: "" }
      ]
    });
  };

  const removeStep = (index: number) => {
    const newSteps = data.steps.filter((_: any, i: number) => i !== index);
    // Reassign numbers
    const updatedSteps = newSteps.map((step: any, i: number) => ({
      ...step,
      n: String(i + 1)
    }));
    setData({ ...data, steps: updatedSteps });
  };

  return (
    <div className="space-y-8 pb-20">
      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 ${
          message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
        }`}>
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Intestazione */}
      <section className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6">Testata della pagina</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Badge</label>
            <input 
              type="text" 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
              value={data.badge}
              onChange={(e) => setData({...data, badge: e.target.value})}
              placeholder="es. Posti disponibili"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Titolo Principale</label>
            <input 
              type="text" 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm font-bold"
              value={data.titolo}
              onChange={(e) => setData({...data, titolo: e.target.value})}
              placeholder="es. Prova gratuita"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Sottotitolo (Descrizione sotto al titolo)</label>
            <textarea 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm resize-y"
              value={data.sottotitolo}
              onChange={(e) => setData({...data, sottotitolo: e.target.value})}
              placeholder="Compila il modulo..."
              rows={3}
            />
          </div>
        </div>
      </section>

      {/* Steps Inferiori */}
      <section className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">Steps Inferiori (Come funziona)</h2>
          <button 
            onClick={addStep}
            className="flex items-center gap-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Aggiungi Step
          </button>
        </div>

        <div className="space-y-6">
          {data.steps.map((step: any, index: number) => (
            <div key={index} className="p-5 border border-slate-200 rounded-2xl relative bg-slate-50/50">
              <button 
                onClick={() => removeStep(index)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg shrink-0">
                  {step.n}
                </div>
                <div className="flex-1">
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm font-semibold bg-white"
                    value={step.title}
                    onChange={(e) => updateStep(index, "title", e.target.value)}
                    placeholder="Titolo step (es. Compila)"
                  />
                </div>
              </div>
              <div>
                <textarea 
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm bg-white resize-y"
                  value={step.desc}
                  onChange={(e) => updateStep(index, "desc", e.target.value)}
                  placeholder="Descrizione step (es. Lascia i tuoi dati...)"
                  rows={2}
                />
              </div>
            </div>
          ))}
          {data.steps.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Nessuno step configurato. Aggiungine uno per mostrarlo sulla pagina.
            </div>
          )}
        </div>
      </section>

      {/* Floating Save Button */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[280px] p-4 bg-white/80 backdrop-blur-lg border-t border-slate-200 z-10 flex justify-end">
        <div className="max-w-4xl mx-auto w-full flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 shadow-lg shadow-slate-900/20"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Salva Modifiche
          </button>
        </div>
      </div>
    </div>
  );
}
