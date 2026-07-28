"use client";

import { useState, useTransition } from "react";
import { submitLead } from "@/app/api/lead/actions";
import { useLocale } from "next-intl";

export function LeadForm() {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string; reference?: string } | null>(null);

  async function action(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await submitLead(formData);
        setResult(res);
        if (res.success) {
          (document.getElementById("lead-form") as HTMLFormElement)?.reset();
        }
      } catch {
        setResult({ error: "Connessione interrotta. Controlla la rete e riprova: i dati inseriti sono ancora nel modulo." });
      }
    });
  }

  if (result?.success) {
    return (
      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
        <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">Richiesta Inviata!</h3>
        <p className="text-green-700 dark:text-green-400">
          Grazie per averci contattato. Il nostro team ti risponderà al più presto.
        </p>
        {result.reference && <p className="mt-3 text-xs font-medium text-green-700">Riferimento: {result.reference}</p>}
      </div>
    );
  }

  return (
    <form id="lead-form" action={action} className="space-y-4 bg-card border border-border p-6 md:p-8 rounded-xl shadow-lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="nome" className="text-sm font-medium">Nome *</label>
          <input type="text" id="nome" name="nome" required maxLength={80} autoComplete="given-name" className="w-full p-3 text-base rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="Mario" />
        </div>
        <div className="space-y-2">
          <label htmlFor="cognome" className="text-sm font-medium">Cognome *</label>
          <input type="text" id="cognome" name="cognome" required maxLength={80} autoComplete="family-name" className="w-full p-3 text-base rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="Rossi" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email *</label>
          <input type="email" id="email" name="email" required maxLength={254} autoComplete="email" inputMode="email" className="w-full p-3 text-base rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="mario@example.com" />
        </div>
        <div className="space-y-2">
          <label htmlFor="telefono" className="text-sm font-medium">Telefono</label>
          <input type="tel" id="telefono" name="telefono" maxLength={40} autoComplete="tel" inputMode="tel" className="w-full p-3 text-base rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="+39 333 1234567" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="note" className="text-sm font-medium">A quale corso sei interessato? / Note</label>
        <textarea id="note" name="note" rows={3} maxLength={2000} className="w-full p-3 text-base rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow resize-none" placeholder="Vorrei informazioni sul corso di Bootcamp..."></textarea>
      </div>
      
      <input type="hidden" name="source" value="prova_gratuita" />
      <input type="hidden" name="locale" value={locale} />

      {result?.error && (
        <div role="alert" aria-live="assertive" className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          {result.error}
        </div>
      )}

      <button 
        type="submit" 
        disabled={isPending}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 rounded-lg transition-colors disabled:opacity-50 mt-4"
      >
        {isPending ? "Invio in corso..." : "Richiedi Prova Gratuita"}
      </button>
      
      <p className="text-xs text-muted-foreground text-center mt-4">
        Inviando questo modulo accetti la nostra Privacy Policy. I tuoi dati saranno trattati con cura.
      </p>
    </form>
  );
}
