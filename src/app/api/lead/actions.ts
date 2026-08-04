"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendLeadNotification, sendAutoReply } from "@/lib/resend/client";
import { after } from "next/server";

const textValue = (formData: FormData, key: string, maxLength: number) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
};

export async function submitLead(formData: FormData) {
  const nome = textValue(formData, "nome", 80);
  const cognome = textValue(formData, "cognome", 80);
  const email = textValue(formData, "email", 254).toLowerCase();
  const telefono = textValue(formData, "telefono", 40);
  const note = textValue(formData, "note", 2000);
  const requestedSource = textValue(formData, "source", 40);
  const requestedLocale = textValue(formData, "locale", 5);
  const source = ["prova_gratuita", "website"].includes(requestedSource) ? requestedSource : "website";
  const locale = ["it", "en", "de"].includes(requestedLocale) ? requestedLocale : "it";

  if (!nome || !cognome || !email) {
    return { error: "Nome, cognome ed email sono obbligatori." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Inserisci un indirizzo email valido." };
  }

  try {
    // This is a public Server Action, but the database mutation is performed
    // server-side with the service role. The previous anonymous insert asked
    // PostgREST to return the new row, which requires a SELECT policy that
    // anonymous visitors intentionally do not have.
    const supabase = createAdminClient();
    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        nome,
        cognome,
        email,
        telefono: telefono || "N/A",
        messaggio: note,
        interesse: "generico",
        source,
        status: "nuovo",
        consenso_privacy: true
      })
      .select()
      .single();

    if (error) {
      console.error("Lead submission database error", {
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return { error: "Errore durante il salvataggio della richiesta." };
    }

    // The user gets confirmation as soon as the lead is safely stored.
    // Email delivery continues within the Vercel request lifetime and cannot
    // turn a successful form submission into a timeout or visible failure.
    after(async () => {
      const results = await Promise.allSettled([
        sendLeadNotification(lead),
        sendAutoReply(lead, locale),
      ]);
      const failed = results.filter(result =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && !result.value?.success)
      ).length;
      if (failed) console.error("Lead saved but one or more emails failed", { leadId: lead.id, failed });
    });

    return { success: true, reference: lead.id.slice(0, 8).toUpperCase() };
  } catch (err) {
    console.error("Submit lead error:", err);
    return { error: "Non siamo riusciti a inviare la richiesta. Riprova tra qualche istante." };
  }
}

export async function submitContact(formData: FormData) {
  const nome = textValue(formData, "nome", 160);
  const email = textValue(formData, "email", 254).toLowerCase();
  const messaggio = textValue(formData, "messaggio", 3000);
  const requestedLocale = textValue(formData, "locale", 5);
  const locale = ["it", "en", "de"].includes(requestedLocale) ? requestedLocale : "it";

  if (!nome || !email || !messaggio) {
    return { error: "Tutti i campi sono obbligatori." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Inserisci un indirizzo email valido." };
  }

  try {
    // We use createAdminClient to bypass RLS for anonymous public form submissions
    const supabase = createAdminClient();
    
    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        nome: nome.split(' ')[0] || "",
        cognome: nome.split(' ').slice(1).join(' ') || "",
        email,
        telefono: "N/A",
        messaggio,
        source: "contact_form",
        status: "nuovo",
        consenso_privacy: true
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase Error:", error);
      return { error: "Errore durante l'invio del messaggio." };
    }

    after(async () => {
      const results = await Promise.allSettled([
        sendLeadNotification(lead),
        sendAutoReply(lead, locale),
      ]);
      const failed = results.filter(result =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && !result.value?.success)
      ).length;
      if (failed) console.error("Contact saved but one or more emails failed", { leadId: lead.id, failed });
    });

    return { success: true, reference: lead.id.slice(0, 8).toUpperCase() };
  } catch (err) {
    console.error("Submit contact error:", err);
    return { error: "Errore imprevisto." };
  }
}
