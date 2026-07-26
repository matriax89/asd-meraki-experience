"use client";

import { useState } from "react";
import { useModal } from "@/components/ui/modal-provider";
import { useLocale } from "next-intl";
import { X } from "lucide-react";
import { normalizeRegistrationFields, type RegistrationAnswers } from "@/lib/events/registration-fields";

export function CheckoutButton({ eventId, isFree = false, registrationFields }: { eventId: string; isFree?: boolean; registrationFields?: unknown }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [answers, setAnswers] = useState<RegistrationAnswers>({});
  const { showAlert } = useModal();
  const locale = useLocale();
  const fields = normalizeRegistrationFields(registrationFields);

  const copy = {
    it: { title: isFree ? "Iscrizione gratuita" : "Acquista il biglietto", name: "Nome e cognome", email: "Email", submit: isFree ? "Completa iscrizione" : "Continua al pagamento", button: isFree ? "Iscriviti gratuitamente" : "Acquista biglietto", wait: "Attendere…" },
    en: { title: isFree ? "Free registration" : "Buy your ticket", name: "Full name", email: "Email", submit: isFree ? "Complete registration" : "Continue to payment", button: isFree ? "Register for free" : "Buy ticket", wait: "Please wait…" },
    de: { title: isFree ? "Kostenlose Anmeldung" : "Eintrittskarte kaufen", name: "Vor- und Nachname", email: "E-Mail", submit: isFree ? "Anmeldung abschließen" : "Weiter zur Zahlung", button: isFree ? "Kostenlos anmelden" : "Eintrittskarte kaufen", wait: "Bitte warten…" },
  }[locale as "it" | "en" | "de"];

  const handleCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setLoading(true);
      const res = await fetch("/api/checkout/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          buyerEmail,
          buyerName,
          locale,
          registrationAnswers: answers,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.assign(data.url);
      } else {
        showAlert({ title: "Errore", message: data.error || "Errore durante il pagamento", type: "error" });
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      showAlert({ title: "Errore", message: "Si è verificato un errore.", type: "error" });
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50">
        {loading ? copy.wait : copy.button}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
          <form onSubmit={handleCheckout} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-left shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-950">{copy.title}</h2>
              <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Chiudi"><X className="size-4" /></button>
            </div>
            <label className="mb-4 block text-sm font-medium text-slate-700">
              {copy.name}
              <input required minLength={2} value={buyerName} onChange={event => setBuyerName(event.target.value)} autoComplete="name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="mb-5 block text-sm font-medium text-slate-700">
              {copy.email}
              <input required type="email" value={buyerEmail} onChange={event => setBuyerEmail(event.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            {fields.length > 0 && (
              <div className="mb-5 space-y-4 border-t border-slate-200 pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Informazioni per l’evento</p>
                {fields.map((field) => field.type === "checkbox" ? (
                  <label key={field.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      required={field.required}
                      checked={answers[field.id] === true}
                      onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.checked })}
                      className="mt-0.5 size-4 accent-slate-950"
                    />
                    <span>{field.label}{field.required ? " *" : ""}</span>
                  </label>
                ) : (
                  <label key={field.id} className="block text-sm font-medium text-slate-700">
                    {field.label}{field.required ? " *" : ""}
                    {field.type === "select" ? (
                      <select
                        required={field.required}
                        value={String(answers[field.id] || "")}
                        onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                      >
                        <option value="">Seleziona…</option>
                        {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        required={field.required}
                        maxLength={500}
                        value={String(answers[field.id] || "")}
                        onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                      />
                    )}
                  </label>
                ))}
              </div>
            )}
            <button disabled={loading} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? copy.wait : copy.submit}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
