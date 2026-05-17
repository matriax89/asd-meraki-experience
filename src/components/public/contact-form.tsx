"use client";

import { useState, useTransition } from "react";
import { submitContact } from "@/app/api/lead/actions";
import { useTranslations, useLocale } from "next-intl";

export function ContactForm() {
  const t = useTranslations("Contact");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  async function action(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await submitContact(formData);
      setResult(res);
      if (res.success) {
        (document.getElementById("contact-form") as HTMLFormElement)?.reset();
      }
    });
  }

  if (result?.success) {
    return (
      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center h-full flex flex-col justify-center">
        <h3 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">{t("success_title")}</h3>
        <p className="text-green-700 dark:text-green-400">
          {t("success_desc")}
        </p>
      </div>
    );
  }

  return (
    <form id="contact-form" action={action} className="space-y-6">
      <div className="space-y-2.5">
        <label htmlFor="nome" className="text-sm font-bold text-slate-700">{t("form_name")}</label>
        <input type="text" id="nome" name="nome" required placeholder={t("form_name_placeholder")} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all duration-300" />
      </div>
      
      <div className="space-y-2.5">
        <label htmlFor="email" className="text-sm font-bold text-slate-700">{t("form_email")}</label>
        <input type="email" id="email" name="email" required placeholder={t("form_email_placeholder")} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all duration-300" />
      </div>

      <div className="space-y-2.5">
        <label htmlFor="messaggio" className="text-sm font-bold text-slate-700">{t("form_message")}</label>
        <textarea id="messaggio" name="messaggio" required rows={5} placeholder={t("form_message_placeholder")} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all duration-300 resize-none"></textarea>
      </div>

      <input type="hidden" name="locale" value={locale} />

      {result?.error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm font-medium rounded-xl border border-red-200">
          {result.error}
        </div>
      )}

      <button 
        type="submit" 
        disabled={isPending}
        className="w-full bg-slate-900 hover:bg-slate-800 hover:-translate-y-1 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 shadow-[0_8px_20px_rgb(0,0,0,0.12)]"
      >
        {isPending ? t("form_submitting") : t("form_submit")}
      </button>
    </form>
  );
}
