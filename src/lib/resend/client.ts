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

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9fb; padding: 40px 20px; color: #1d1d1f;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
        <div style="background-color: #1d1d1f; padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Nuovo Messaggio</h1>
          <p style="color: #a1a1a6; margin: 8px 0 0 0; font-size: 15px;">Hai ricevuto una nuova richiesta su ASD Meraki</p>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0;">Dettagli Contatto</h2>
          <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
            <p style="margin: 0 0 12px 0; font-size: 15px;"><strong>Nome:</strong> ${lead.nome} ${lead.cognome}</p>
            <p style="margin: 0 0 12px 0; font-size: 15px;"><strong>Email:</strong> <a href="mailto:${lead.email}" style="color: #0066cc; text-decoration: none;">${lead.email}</a></p>
            ${lead.telefono && lead.telefono !== 'N/A' ? `<p style="margin: 0 0 12px 0; font-size: 15px;"><strong>Telefono:</strong> ${lead.telefono}</p>` : ""}
            <p style="margin: 0; font-size: 15px;"><strong>Sorgente:</strong> ${lead.source}</p>
          </div>
          
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0;">Messaggio</h2>
          <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; font-size: 15px; line-height: 1.5; color: #1d1d1f;">
            ${lead.messaggio ? lead.messaggio.replace(/\\n/g, '<br />') : "<em>Nessun messaggio fornito.</em>"}
          </div>
          
          <div style="margin-top: 40px; text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merakiexperience.org'}/admin/dashboard/leads" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 980px;">Gestisci su Dashboard</a>
          </div>
        </div>
      </div>
    </div>
  `;

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

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9fb; padding: 40px 20px; color: #1d1d1f;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
        <div style="padding: 48px 32px; text-align: center;">
          <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #1d1d1f;">Grazie per averci contattato, ${lead.nome}!</h1>
          <p style="font-size: 17px; line-height: 1.5; color: #515154; margin: 0 0 32px 0;">
            Abbiamo ricevuto la tua richiesta e il nostro team la sta già esaminando. Ti risponderemo il prima possibile all'indirizzo email che ci hai fornito.
          </p>
          <div style="background: #f5f5f7; border-radius: 16px; padding: 24px; text-align: left; margin-bottom: 32px;">
            <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 12px 0;">Il tuo messaggio</h2>
            <p style="font-size: 15px; line-height: 1.5; color: #1d1d1f; margin: 0; font-style: italic;">
              "${lead.messaggio ? lead.messaggio.replace(/\\n/g, '<br />') : "Richiesta prova gratuita"}"
            </p>
          </div>
          <p style="font-size: 15px; color: #86868b; margin: 0;">
            A presto,<br />
            <strong>Il Team di ASD Meraki Experience</strong>
          </p>
        </div>
      </div>
    </div>
  `;

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
        from: \`Meraki Experience <\${FROM_EMAIL}>\`,
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
