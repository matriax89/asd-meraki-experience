import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";

const defaultResendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = "noreply@merakiexperience.org";
const DEFAULT_ADMIN_EMAIL = "info@merakiexperience.org";

export async function sendLeadNotification(lead: any) {
  // Fetch dynamic settings from database
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const integrations = (settings?.value as any)?.integrations;
  
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;
  const adminEmail = integrations?.admin_email || DEFAULT_ADMIN_EMAIL;

  if (!activeApiKey) {
    console.warn("RESEND_API_KEY non configurata. Salto invio email.");
    return { success: false, error: "API Key non configurata" };
  }

  const resend = new Resend(activeApiKey);

  const subject = lead.source === "contact_form" 
    ? `Nuovo Messaggio da ${lead.nome} ${lead.cognome}`
    : `Nuova Richiesta Prova da ${lead.nome} ${lead.cognome}`;

  try {
    const { data, error } = await resend.emails.send({
      from: `Meraki Experience <${FROM_EMAIL}>`,
      to: adminEmail,
      subject,
      html: `
        <h2>Hai ricevuto una nuova richiesta!</h2>
        <p><strong>Dati del contatto:</strong></p>
        <ul>
          <li><strong>Nome:</strong> ${lead.nome} ${lead.cognome}</li>
          <li><strong>Email:</strong> ${lead.email}</li>
          ${lead.telefono ? `<li><strong>Telefono:</strong> ${lead.telefono}</li>` : ""}
          <li><strong>Sorgente:</strong> ${lead.source}</li>
        </ul>
        <p><strong>Note / Messaggio:</strong></p>
        <p>${lead.messaggio || "Nessun messaggio."}</p>
        <br />
        <p><em>Puoi gestire questo lead dalla tua Dashboard.</em></p>
      `,
    });

    if (error) {
      console.error("Resend API error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email with Resend:", error);
    return { success: false, error };
  }
}
