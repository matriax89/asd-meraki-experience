"use client";

import { useState } from "react";
import { useModal } from "@/components/ui/modal-provider";
import { useLocale } from "next-intl";
import { X } from "lucide-react";

export function CheckoutButton({ eventId, isFree = false }: { eventId: string; isFree?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const { showAlert } = useModal();
  const locale = useLocale();

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
            <button disabled={loading} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? copy.wait : copy.submit}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
