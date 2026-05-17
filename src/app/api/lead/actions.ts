"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";

// In a real scenario we'd use resend here, but for now we simulate or fallback
import { sendLeadNotification, sendAutoReply } from "@/lib/resend/client";

export async function submitLead(formData: FormData) {
  const nome = formData.get("nome") as string;
  const cognome = formData.get("cognome") as string;
  const email = formData.get("email") as string;
  const telefono = formData.get("telefono") as string;
  const note = formData.get("note") as string;
  const source = formData.get("source") as string || "website";

  if (!nome || !cognome || !email) {
    return { error: "Nome, cognome ed email sono obbligatori." };
  }

  try {
    const supabase = await createClient();
    
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
      console.error("Supabase Error:", error);
      return { error: "Errore durante il salvataggio della richiesta." };
    }

    // Try sending email if configured
    try {
      await sendLeadNotification(lead);
      await sendAutoReply(lead);
      console.log("Sent emails for lead", lead.id);
    } catch (emailError) {
      console.error("Email notification failed, but lead was saved:", emailError);
    }

    return { success: true };
  } catch (err) {
    console.error("Submit lead error:", err);
    return { error: "Errore imprevisto." };
  }
}

export async function submitContact(formData: FormData) {
  const nome = formData.get("nome") as string;
  const email = formData.get("email") as string;
  const messaggio = formData.get("messaggio") as string;

  if (!nome || !email || !messaggio) {
    return { error: "Tutti i campi sono obbligatori." };
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

    // Try sending email
    try {
      await sendLeadNotification(lead);
      await sendAutoReply(lead);
      console.log("Sent emails for contact", lead.id);
    } catch (emailError) {
      console.error("Email notification failed, but contact was saved:", emailError);
    }

    return { success: true };
  } catch (err) {
    console.error("Submit contact error:", err);
    return { error: "Errore imprevisto." };
  }
}
