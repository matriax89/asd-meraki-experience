import { Resend } from "resend";
import nodemailer from "nodemailer";
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
  
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;
  const adminEmail = integrations?.admin_email || DEFAULT_ADMIN_EMAIL;

  const subject = lead.source === "contact_form" 
    ? `Nuovo Messaggio da ${lead.nome} ${lead.cognome}`
    : `Nuova Richiesta Prova da ${lead.nome} ${lead.cognome}`;

  const htmlContent = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuovo Messaggio</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e5ea; overflow: hidden; margin: 0 auto;">
          <tr>
            <td style="padding: 48px 40px; text-align: left;">
              <h1 style="color: #1d1d1f; margin: 0 0 8px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Nuovo Messaggio</h1>
              <p style="color: #86868b; margin: 0 0 32px 0; font-size: 15px;">Hai ricevuto una nuova richiesta su ASD Meraki.</p>
              
              <hr style="border: none; border-top: 1px solid #e5e5ea; margin: 0 0 32px 0;" />

              <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0; font-weight: 600;">Dettagli Contatto</h2>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="padding: 0 0 12px 0; font-size: 15px; color: #1d1d1f;">
                    <span style="color: #86868b; display: inline-block; width: 80px;">Nome</span> ${lead.nome} ${lead.cognome}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 0 12px 0; font-size: 15px; color: #1d1d1f;">
                    <span style="color: #86868b; display: inline-block; width: 80px;">Email</span> <a href="mailto:${lead.email}" style="color: #1d1d1f; text-decoration: underline;">${lead.email}</a>
                  </td>
                </tr>
                ${lead.telefono && lead.telefono !== 'N/A' ? `
                <tr>
                  <td style="padding: 0 0 12px 0; font-size: 15px; color: #1d1d1f;">
                    <span style="color: #86868b; display: inline-block; width: 80px;">Telefono</span> ${lead.telefono}
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="padding: 0 0 0 0; font-size: 15px; color: #1d1d1f;">
                    <span style="color: #86868b; display: inline-block; width: 80px;">Sorgente</span> ${lead.source}
                  </td>
                </tr>
              </table>
              
              <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0; font-weight: 600;">Messaggio</h2>
              <div style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin-bottom: 40px;">
                ${lead.messaggio ? lead.messaggio.replace(/\\n/g, '<br />') : "<span style='color: #86868b; font-style: italic;'>Nessun messaggio fornito.</span>"}
              </div>
              
              <div style="text-align: left;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merakiexperience.org'}/admin/dashboard/leads" style="display: inline-block; background-color: #1d1d1f; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 500; padding: 12px 24px; border-radius: 8px;">Gestisci nella Dashboard</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      
      if (!smtp_host || !smtp_user || !smtp_pass) {
        console.warn("SMTP configurato in modo incompleto. Salto invio email.");
        return { success: false, error: "Dati SMTP incompleti" };
      }

      const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: parseInt(smtp_port) || 587,
        secure: parseInt(smtp_port) === 465, // true for 465, false for other ports
        auth: {
          user: smtp_user,
          pass: smtp_pass,
        },
      });

      const info = await transporter.sendMail({
        from: `"Meraki Experience" <${smtp_user}>`, // Use SMTP user as sender to avoid blocks
        to: adminEmail,
        subject: subject,
        html: htmlContent,
      });

      return { success: true, data: info };

    } else {
      // Default to Resend
      if (!activeApiKey) {
        console.warn("RESEND_API_KEY non configurata. Salto invio email.");
        return { success: false, error: "API Key non configurata" };
      }

      const resend = new Resend(activeApiKey);
      const { data, error } = await resend.emails.send({
        from: `Meraki Experience <${FROM_EMAIL}>`,
        to: adminEmail,
        subject,
        html: htmlContent,
      });

      if (error) {
        console.error("Resend API error:", error);
        return { success: false, error };
      }

      return { success: true, data };
    }
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error };
  }
}

export async function sendAutoReply(lead: any) {
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;

  const subject = "Abbiamo ricevuto la tua richiesta - ASD Meraki Experience";

  const htmlContent = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grazie per averci contattato</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e5ea; overflow: hidden; margin: 0 auto;">
          <tr>
            <td style="padding: 48px 40px; text-align: left;">
              <h1 style="color: #1d1d1f; margin: 0 0 16px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Grazie per averci contattato, ${lead.nome}!</h1>
              <p style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin: 0 0 32px 0;">
                Abbiamo ricevuto la tua richiesta e il nostro team la sta già esaminando. Ti risponderemo il prima possibile all'indirizzo email che ci hai fornito.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e5ea; margin: 0 0 32px 0;" />
              
              <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0; font-weight: 600;">Il tuo messaggio</h2>
              <div style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin-bottom: 40px; font-style: italic; border-left: 3px solid #e5e5ea; padding-left: 16px;">
                ${lead.messaggio ? lead.messaggio.replace(/\\n/g, '<br />') : "Richiesta prova gratuita"}
              </div>
              
              <p style="font-size: 15px; color: #86868b; margin: 0; line-height: 1.5;">
                A presto,<br />
                <strong style="color: #1d1d1f; font-weight: 600;">Il Team di ASD Meraki Experience</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };

      const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: parseInt(smtp_port) || 587,
        secure: parseInt(smtp_port) === 465,
        auth: { user: smtp_user, pass: smtp_pass },
      });

      await transporter.sendMail({
        from: `"Meraki Experience" <${smtp_user}>`,
        to: lead.email,
        subject,
        html: htmlContent,
      });

      return { success: true };
    } else {
      if (!activeApiKey) return { success: false };

      const resend = new Resend(activeApiKey);
      await resend.emails.send({
        from: `Meraki Experience <${FROM_EMAIL}>`,
        to: lead.email,
        subject,
        html: htmlContent,
      });

      return { success: true };
    }
  } catch (error) {
    console.error("Failed to send auto-reply:", error);
    return { success: false };
  }
}
