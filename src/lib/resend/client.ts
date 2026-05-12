import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// La mail a cui verranno mandate le notifiche
const ADMIN_EMAIL = "info@merakiexperience.org";
const FROM_EMAIL = "noreply@merakiexperience.org";

export async function sendLeadNotification(lead: any) {
  if (!resend) {
    console.warn("RESEND_API_KEY not configured. Skipping email notification.");
    return { success: false, error: "API Key not configured" };
  }

  const subject = lead.source === "contact_form" 
    ? `Nuovo Messaggio da ${lead.nome} ${lead.cognome}`
    : `Nuova Richiesta Prova da ${lead.nome} ${lead.cognome}`;

  try {
    const { data, error } = await resend.emails.send({
      from: `Meraki Experience <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
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
