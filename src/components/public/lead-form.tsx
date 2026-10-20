"use client";

import { useState, useTransition } from "react";
import { submitLead } from "@/app/api/lead/actions";
import { useLocale, useTranslations } from "next-intl";

export function LeadForm() {
  const locale = useLocale();
  const t = useTranslations("PublicUi");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  async function action(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await submitLead(formData);
      setResult(res);
      if (res.success) {
        // Reset the form if success
        (document.getElementById("lead-form") as HTMLFormElement)?.reset();
      }
    });
  }

  if (result?.success) {
    return (
      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
        <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">{t("leadSuccessTitle")}</h3>
        <p className="text-green-700 dark:text-green-400">
          {t("leadSuccessDescription")}
        </p>
      </div>
    );
  }

  return (
    <form id="lead-form" action={action} className="space-y-4 bg-card border border-border p-6 md:p-8 rounded-xl shadow-lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="nome" className="text-sm font-medium">{t("firstName")} *</label>
          <input type="text" id="nome" name="nome" required className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="Mario" />
        </div>
        <div className="space-y-2">
          <label htmlFor="cognome" className="text-sm font-medium">{t("lastName")} *</label>
          <input type="text" id="cognome" name="cognome" required className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="Rossi" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">{t("email")} *</label>
          <input type="email" id="email" name="email" required className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="mario@example.com" />
        </div>
        <div className="space-y-2">
          <label htmlFor="telefono" className="text-sm font-medium">{t("phone")}</label>
          <input type="tel" id="telefono" name="telefono" className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow" placeholder="+39 333 1234567" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="note" className="text-sm font-medium">{t("leadNotes")}</label>
        <textarea id="note" name="note" rows={3} className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary outline-none transition-shadow resize-none" placeholder={t("leadNotesPlaceholder")}></textarea>
      </div>
      
      <input type="hidden" name="source" value="prova_gratuita" />
      <input type="hidden" name="locale" value={locale} />

      {result?.error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          {t("formError")}
        </div>
      )}

      <button 
        type="submit" 
        disabled={isPending}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 rounded-lg transition-colors disabled:opacity-50 mt-4"
      >
        {isPending ? t("sending") : t("requestTrial")}
      </button>
      
      <p className="text-xs text-muted-foreground text-center mt-4">
        {t("leadPrivacy")}
      </p>
    </form>
  );
}
