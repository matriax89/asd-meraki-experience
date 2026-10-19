import { Resend } from "resend";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { Database } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";
import { emailLocale, escapeEmailHtml, marketingEmailSection, renderMerakiEmail } from "@/lib/email/meraki-template";

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
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merakiexperience.org'}/it/admin/leads" style="display: inline-block; background-color: #1d1d1f; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 500; padding: 12px 24px; border-radius: 8px;">Gestisci nella Dashboard</a>
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

export async function sendAutoReply(lead: any, locale: string = "it") {
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;

  // Localized strings
  const translations: Record<string, any> = {
    it: {
      subject: "Abbiamo ricevuto la tua richiesta - ASD Meraki Experience",
      title: `Grazie per averci contattato, ${lead.nome}!`,
      body: "Abbiamo ricevuto la tua richiesta e il nostro team la sta già esaminando. Ti risponderemo il prima possibile all'indirizzo email che ci hai fornito.",
      messageLabel: "Il tuo messaggio",
      defaultMessage: "Richiesta prova gratuita",
      footer: "A presto",
      team: "Il Team di ASD Meraki Experience"
    },
    en: {
      subject: "We received your request - ASD Meraki Experience",
      title: `Thanks for contacting us, ${lead.nome}!`,
      body: "We have received your request and our team is already reviewing it. We will reply as soon as possible to the email address you provided.",
      messageLabel: "Your message",
      defaultMessage: "Free trial request",
      footer: "See you soon",
      team: "The ASD Meraki Experience Team"
    },
    de: {
      subject: "Wir haben Ihre Anfrage erhalten - ASD Meraki Experience",
      title: `Danke für Ihre Kontaktaufnahme, ${lead.nome}!`,
      body: "Wir haben Ihre Anfrage erhalten und unser Team prüft sie bereits. Wir werden so schnell wie möglich an die von Ihnen angegebene E-Mail-Adresse antworten.",
      messageLabel: "Ihre Nachricht",
      defaultMessage: "Anfrage für ein kostenloses Probetraining",
      footer: "Bis bald",
      team: "Das Team von ASD Meraki Experience"
    }
  };

  const t = translations[locale] || translations["it"];

  const subject = t.subject;

  const htmlContent = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e5ea; overflow: hidden; margin: 0 auto;">
          <tr>
            <td style="padding: 48px 40px; text-align: left;">
              <h1 style="color: #1d1d1f; margin: 0 0 16px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">${t.title}</h1>
              <p style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin: 0 0 32px 0;">
                ${t.body}
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e5ea; margin: 0 0 32px 0;" />
              
              <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0; font-weight: 600;">${t.messageLabel}</h2>
              <div style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin-bottom: 40px; font-style: italic; border-left: 3px solid #e5e5ea; padding-left: 16px;">
                ${lead.messaggio ? lead.messaggio.replace(/\\n/g, '<br />') : t.defaultMessage}
              </div>
              
              <p style="font-size: 15px; color: #86868b; margin: 0; line-height: 1.5;">
                ${t.footer},<br />
                <strong style="color: #1d1d1f; font-weight: 600;">${t.team}</strong>
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

export async function sendOrderConfirmation(order: any, items: any[], locale: string = "it") {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;

  const translations: Record<string, any> = {
    it: { subject: `Conferma Ordine ${order.numero_ordine} - ASD Meraki Experience`, title: "Grazie per il tuo ordine!", body: "Abbiamo ricevuto il tuo ordine e lo stiamo preparando per la spedizione.", orderNum: "Numero Ordine", total: "Totale", shipTo: "Indirizzo di spedizione", footer: "A presto", team: "Il Team di ASD Meraki Experience" },
    en: { subject: `Order Confirmation ${order.numero_ordine} - ASD Meraki Experience`, title: "Thank you for your order!", body: "We have received your order and are preparing it for shipment.", orderNum: "Order Number", total: "Total", shipTo: "Shipping Address", footer: "See you soon", team: "The ASD Meraki Experience Team" },
    de: { subject: `Bestellbestätigung ${order.numero_ordine} - ASD Meraki Experience`, title: "Vielen Dank für Ihre Bestellung!", body: "Wir haben Ihre Bestellung erhalten und bereiten sie für den Versand vor.", orderNum: "Bestellnummer", total: "Gesamtbetrag", shipTo: "Lieferadresse", footer: "Bis bald", team: "Das Team von ASD Meraki Experience" }
  };
  const t = translations[locale] || translations["it"];

  const itemsHtml = items.map(i => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e5ea; color: #1d1d1f; font-size: 14px;">
        <strong>${i.product_nome}</strong><br/>
        <span style="color: #86868b; font-size: 12px;">${i.variant_descrizione || ''} x${i.quantita}</span>
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e5ea; text-align: right; color: #1d1d1f; font-size: 14px; font-weight: 600;">
        €${(i.totale_cents / 100).toFixed(2)}
      </td>
    </tr>
  `).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="\${locale}">
<head>
  <meta charset="utf-8">
  <title>\${t.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
    <tr><td align="center">
      <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e5ea; overflow: hidden;">
        <tr><td style="padding: 48px 40px; text-align: left;">
          <h1 style="color: #1d1d1f; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">\${t.title}</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin: 0 0 32px 0;">\${t.body}</p>
          
          <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0; font-weight: 600;">\${t.orderNum}: \${order.numero_ordine}</h2>
          
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
            \${itemsHtml}
            <tr>
              <td style="padding: 16px 0 0 0; text-align: right; color: #86868b; font-size: 14px;">Spedizione:</td>
              <td style="padding: 16px 0 0 0; text-align: right; color: #1d1d1f; font-size: 14px;">€\${(order.shipping_cents / 100).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0 0 0; text-align: right; color: #1d1d1f; font-size: 16px; font-weight: 600;">\${t.total}:</td>
              <td style="padding: 8px 0 0 0; text-align: right; color: #1d1d1f; font-size: 16px; font-weight: 600;">€\${(order.total_cents / 100).toFixed(2)}</td>
            </tr>
          </table>

          <div style="background-color: #f5f5f7; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
            <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 8px 0; font-weight: 600;">\${t.shipTo}</h3>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1d1d1f;">
              \${order.buyer_nome} \${order.buyer_cognome}<br/>
              \${order.ship_address_line1}<br/>
              \${order.ship_address_line2 ? order.ship_address_line2 + '<br/>' : ''}
              \${order.ship_city}, \${order.ship_postal_code} (\${order.ship_state})<br/>
              \${order.ship_country}
            </p>
          </div>
          
          <p style="font-size: 15px; color: #86868b; margin: 0;">\${t.footer},<br/><strong style="color: #1d1d1f;">\${t.team}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: `"Meraki Experience" <\${smtp_user}>`, to: order.buyer_email, subject: t.subject, html: htmlContent });
      return { success: true };
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      await resend.emails.send({ from: `Meraki Experience <\${FROM_EMAIL}>`, to: order.buyer_email, subject: t.subject, html: htmlContent });
      return { success: true };
    }
  } catch (error) {
    console.error("Failed to send order confirmation:", error);
    return { success: false };
  }
}

export async function sendOrderNotification(order: any, items: any[]) {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;
  const targetEmail = integrations?.admin_email || "amministrazione.meraki@gmail.com";

  const subject = `Nuovo Ordine Shop: \${order.numero_ordine}`;
  
  const itemsHtml = items.map(i => `<li>\${i.product_nome} (\${i.variant_descrizione || ''}) x\${i.quantita}</li>`).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 16px;">
    <h1 style="margin: 0 0 16px; font-size: 20px;">Nuovo Ordine Ricevuto</h1>
    <p>È stato appena pagato l'ordine <strong>\${order.numero_ordine}</strong> da \${order.buyer_nome} \${order.buyer_cognome} (\${order.buyer_email}).</p>
    <ul>\${itemsHtml}</ul>
    <p>Totale: €\${(order.total_cents / 100).toFixed(2)}</p>
    <a href="\${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merakiexperience.org'}/it/admin/ordini" style="display: inline-block; background: #1d1d1f; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Gestisci Ordini</a>
  </div>
</body></html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: `"Sistema" <\${smtp_user}>`, to: targetEmail, subject, html: htmlContent });
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      await resend.emails.send({ from: `Sistema <\${FROM_EMAIL}>`, to: targetEmail, subject, html: htmlContent });
    }
  } catch (error) {
    console.error("Failed to send admin order notification:", error);
  }
}

type TicketEmail = Pick<Database["public"]["Tables"]["tickets"]["Row"], "id" | "qr_code" | "buyer_email" | "buyer_nome" | "buyer_cognome">;
type TicketEventEmail = Pick<Database["public"]["Tables"]["events"]["Row"], "titolo" | "data_inizio" | "location" | "indirizzo"> & { copertina_url?: string | null };
type TicketEmailAccess = { name: string; menuChoice?: string | null };

export async function sendTicketConfirmation(ticket: TicketEmail, eventData: TicketEventEmail, locale = "it", options?: {
  deliveryId: string; accessNames: string[]; packageName?: string; accessDetails?: TicketEmailAccess[];
  marketing?: { confirmUrl?: string; unsubscribeUrl: string };
}) {
  const escapeHtml = escapeEmailHtml;
  try {
    if (!ticket.qr_code) return { success: false };
    const supabase = createAdminClient();
    const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
    const rawSettings = settings?.value;
    const integrations = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      && rawSettings.integrations && typeof rawSettings.integrations === "object" && !Array.isArray(rawSettings.integrations)
      ? rawSettings.integrations : {};
    const readSetting = (name: string) => typeof integrations[name] === "string" ? integrations[name] as string : "";
    const language = emailLocale(locale);
    const copy = {
      it: {
        subject: "Il tuo biglietto Meraki", heading: "Il tuo biglietto è pronto", intro: "Il prossimo momento Meraki ti aspetta. Qui trovi tutti i dettagli per partecipare.",
        event: "La tua esperienza", participant: "Partecipante", date: "Data", time: "Ora", timezone: "ora italiana", place: "Luogo", package: "Formula", includes: "Il tuo biglietto include", menu: "Menu scelto",
        qr: "Il tuo QR personale", qrHint: "Mostralo allo staff all’ingresso, direttamente dal telefono.", instruction: "Questo biglietto consente un solo ingresso.", activities: "Usa lo stesso QR per le attività incluse. Ogni attività ha un ingresso separato.",
        open: "Apri e salva il biglietto", attachment: "Trovi lo stesso QR anche nell’allegato biglietto-meraki.png.", how: "Come usarlo", stepOne: "Apri e salva", stepOneBody: "Apri il biglietto dal pulsante qui sopra e salvalo sul telefono.", stepTwo: "Mostra il QR all’ingresso", stepTwoBody: "Tieni il codice ben visibile: lo staff lo leggerà per confermare il tuo accesso.",
        guest: "Non serve creare un account. Conserva questa email: puoi riaprire il biglietto dal pulsante quando vuoi.", help: "Hai bisogno di una mano?", contact: "Contattaci", reference: "Riferimento biglietto", footer: "Email di servizio relativa al tuo acquisto. L’invio del biglietto è indipendente dalla scelta sulle comunicazioni promozionali.",
      },
      en: {
        subject: "Your Meraki ticket", heading: "Your ticket is ready", intro: "Your next Meraki moment awaits. Here are all the details for your visit.",
        event: "Your experience", participant: "Participant", date: "Date", time: "Time", timezone: "Italian time", place: "Venue", package: "Package", includes: "Your ticket includes", menu: "Selected menu",
        qr: "Your personal QR code", qrHint: "Show it to the staff at the entrance, straight from your phone.", instruction: "This ticket allows one admission.", activities: "Use the same QR for the included activities. Each activity has its own admission.",
        open: "Open and save your ticket", attachment: "The same QR is also attached as biglietto-meraki.png.", how: "How to use it", stepOne: "Open and save", stepOneBody: "Open your ticket using the button above and save it on your phone.", stepTwo: "Show your QR at the entrance", stepTwoBody: "Keep the code clearly visible: the staff will scan it to confirm your admission.",
        guest: "No account is needed. Keep this email: you can reopen your ticket using the button at any time.", help: "Need a hand?", contact: "Contact us", reference: "Ticket reference", footer: "Service email about your purchase. Ticket delivery is independent of your choice about promotional messages.",
      },
      de: {
        subject: "Dein Meraki-Ticket", heading: "Dein Ticket ist bereit", intro: "Dein nächster Meraki-Moment wartet auf dich. Hier findest du alle Details für deine Teilnahme.",
        event: "Dein Erlebnis", participant: "Teilnehmende Person", date: "Datum", time: "Uhrzeit", timezone: "italienische Zeit", place: "Ort", package: "Paket", includes: "In deinem Ticket enthalten", menu: "Gewähltes Menü",
        qr: "Dein persönlicher QR-Code", qrHint: "Zeige ihn dem Team am Eingang direkt auf deinem Handy.", instruction: "Dieses Ticket erlaubt einen einmaligen Eintritt.", activities: "Nutze denselben QR-Code für die enthaltenen Aktivitäten. Jede Aktivität hat einen eigenen Eintritt.",
        open: "Ticket öffnen und speichern", attachment: "Derselbe QR-Code ist auch als biglietto-meraki.png angehängt.", how: "So funktioniert es", stepOne: "Öffnen und speichern", stepOneBody: "Öffne dein Ticket über den Button oben und speichere es auf deinem Handy.", stepTwo: "QR-Code am Eingang zeigen", stepTwoBody: "Halte den Code gut sichtbar bereit: Das Team scannt ihn, um deinen Eintritt zu bestätigen.",
        guest: "Du brauchst kein Konto. Bewahre diese E-Mail auf: Über den Button kannst du dein Ticket jederzeit wieder öffnen.", help: "Brauchst du Hilfe?", contact: "Kontaktiere uns", reference: "Ticketreferenz", footer: "Service-E-Mail zu deinem Kauf. Die Ticketzustellung ist unabhängig von deiner Wahl zu Werbemitteilungen.",
      },
      es: {
        subject: "Tu entrada Meraki", heading: "Tu entrada está lista", intro: "Tu próximo momento Meraki te espera. Aquí tienes todos los detalles para participar.",
        event: "Tu experiencia", participant: "Participante", date: "Fecha", time: "Hora", timezone: "hora de Italia", place: "Lugar", package: "Paquete", includes: "Tu entrada incluye", menu: "Menú elegido",
        qr: "Tu código QR personal", qrHint: "Muéstralo al equipo en la entrada, directamente desde tu teléfono.", instruction: "Esta entrada permite un solo acceso.", activities: "Usa el mismo QR para las actividades incluidas. Cada actividad tiene su propio acceso.",
        open: "Abrir y guardar la entrada", attachment: "El mismo QR también está adjunto como biglietto-meraki.png.", how: "Cómo usarla", stepOne: "Abrir y guardar", stepOneBody: "Abre tu entrada con el botón de arriba y guárdala en tu teléfono.", stepTwo: "Mostrar el QR en la entrada", stepTwoBody: "Mantén el código bien visible: el equipo lo escaneará para confirmar tu acceso.",
        guest: "No necesitas crear una cuenta. Guarda este email: puedes volver a abrir tu entrada con el botón cuando quieras.", help: "¿Necesitas ayuda?", contact: "Contáctanos", reference: "Referencia de la entrada", footer: "Email de servicio sobre tu compra. El envío de la entrada es independiente de tu elección sobre las comunicaciones promocionales.",
      },
    }[language];
    const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org").origin;
    const url = `${siteUrl}/${language}/biglietto/${ticket.id}?token=${encodeURIComponent(ticket.qr_code)}`;
    const contactUrl = `${siteUrl}/${language}/contatti`;
    const title = getLocalizedText(eventData.titolo, language);
    const participantName = [ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ");
    const eventDate = new Date(eventData.data_inizio);
    const date = new Intl.DateTimeFormat(language, { dateStyle: "full", timeZone: "Europe/Rome" }).format(eventDate);
    const time = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(eventDate);
    const venue = [eventData.location, eventData.indirizzo].filter(Boolean).join(", ");
    const packageName = options?.packageName?.trim();
    const purchasedAccesses: TicketEmailAccess[] = options?.accessDetails?.length ? options.accessDetails : (options?.accessNames || []).map(name => ({ name }));
    const accessDetails = purchasedAccesses.filter(access => access.name.trim()).map(access => ({ name: access.name.trim(), menuChoice: access.menuChoice?.trim() }));
    const accessCopy = accessDetails.length ? copy.activities : copy.instruction;
    let coverUrl: string | undefined;
    if (eventData.copertina_url) {
      try {
        const cover = new URL(eventData.copertina_url, siteUrl);
        if (cover.protocol === "https:" || cover.protocol === "http:") coverUrl = cover.href;
      } catch { /* An unavailable cover must not prevent delivery of the ticket. */ }
    }
    const deliveryId = options?.deliveryId || ticket.id;
    const qr = await QRCode.toBuffer(ticket.qr_code, { width: 512, margin: 3, errorCorrectionLevel: "M" });
    const marketing = marketingEmailSection(language, options?.marketing);
    const labelStyle = "margin:0 0 4px;color:#73806f;font-size:11px;line-height:1.4;font-weight:650;letter-spacing:1px;text-transform:uppercase;";
    const valueStyle = "margin:0;color:#18251f;font-size:15px;line-height:1.6;font-weight:600;overflow-wrap:anywhere;";
    const information = (label: string, value: string) => `<p style="${labelStyle}">${escapeHtml(label)}</p><p style="${valueStyle}">${escapeHtml(value)}</p>`;
    const includedHtml = accessDetails.length ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e0e2d8;"><p style="${labelStyle}">${escapeHtml(copy.includes)}</p><ul style="margin:10px 0 0;padding-left:20px;color:#18251f;font-size:15px;line-height:1.7;">${accessDetails.map(access => `<li style="margin:0 0 7px;padding-left:2px;"><strong>${escapeHtml(access.name)}</strong>${access.menuChoice ? `<br/><span style="color:#626d63;font-size:13px;">${escapeHtml(copy.menu)}: ${escapeHtml(access.menuChoice)}</span>` : ""}</li>`).join("")}</ul></div>` : "";
    const afterCtaHtml = `<div style="margin-top:26px;padding-top:24px;border-top:1px solid #e4e6dc;"><h2 style="margin:0 0 18px;color:#18251f;font-size:19px;line-height:1.35;">${escapeHtml(copy.how)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${[["1", copy.stepOne, copy.stepOneBody], ["2", copy.stepTwo, copy.stepTwoBody]].map(([number, heading, body]) => `<tr><td width="34" valign="top" style="padding:0 10px 18px 0;"><span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#eee9df;color:#826435;text-align:center;font-size:13px;font-weight:700;line-height:26px;">${number}</span></td><td valign="top" style="padding:0 0 18px;"><p style="margin:0 0 4px;color:#18251f;font-size:15px;line-height:1.5;font-weight:650;">${escapeHtml(heading)}</p><p style="margin:0;color:#626d63;font-size:14px;line-height:1.6;">${escapeHtml(body)}</p></td></tr>`).join("")}</table><p style="margin:2px 0 18px;color:#626d63;font-size:13px;line-height:1.65;">${escapeHtml(copy.guest)}</p><p style="margin:0;color:#626d63;font-size:13px;line-height:1.65;">${escapeHtml(copy.help)} <a href="${escapeHtml(contactUrl)}" style="color:#826435;text-decoration:underline;font-weight:650;">${escapeHtml(copy.contact)}</a></p></div>`;
    const htmlContent = renderMerakiEmail({ locale: language, siteUrl, title: copy.heading, preheader: `${copy.subject} · ${title}`,
      bodyHtml: `<p style="margin:0 0 22px;color:#626d63;font-size:15px;line-height:1.65;">${escapeHtml(copy.intro)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e4db;border-radius:20px;background:#f5f4f0;overflow:hidden;">${coverUrl ? `<tr><td><img src="${escapeHtml(coverUrl)}" alt="" width="532" style="display:block;width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:19px 19px 0 0;"/></td></tr>` : ""}<tr><td style="padding:22px;"><p style="margin:0 0 9px;color:#826435;font-size:10px;font-weight:700;line-height:1.5;letter-spacing:1.8px;text-transform:uppercase;">${escapeHtml(copy.event)}</p><h2 style="margin:0 0 24px;color:#18251f;font-size:26px;line-height:1.22;font-weight:750;letter-spacing:-.6px;overflow-wrap:anywhere;">${escapeHtml(title)}</h2>${participantName ? `<div style="margin-bottom:20px;">${information(copy.participant, participantName)}</div>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="62%" valign="top" style="padding:0 14px 20px 0;">${information(copy.date, date)}</td><td width="38%" valign="top" style="padding:0 0 20px;">${information(copy.time, time)}<p style="margin:3px 0 0;color:#73806f;font-size:11px;line-height:1.5;">${escapeHtml(copy.timezone)}</p></td></tr></table>${venue ? `<div style="margin-bottom:${packageName ? "20px" : "0"};">${information(copy.place, venue)}</div>` : ""}${packageName ? information(copy.package, packageName) : ""}${includedHtml}</td></tr></table><div style="padding:27px 0 0;text-align:center;"><h2 style="margin:0 0 8px;color:#18251f;font-size:19px;line-height:1.35;">${escapeHtml(copy.qr)}</h2><p style="margin:0 0 14px;color:#626d63;font-size:13px;line-height:1.6;">${escapeHtml(copy.qrHint)}</p><img src="cid:meraki-ticket" width="256" height="256" alt="QR" style="display:block;width:256px;max-width:100%;height:auto;margin:0 auto;background:#fff;border:1px solid #e4e6dc;border-radius:14px;"/><p style="margin:16px 0 0;color:#626d63;font-size:13px;line-height:1.6;">${escapeHtml(accessCopy)}</p><p style="margin:9px 0 0;color:#73806f;font-size:12px;line-height:1.6;">${escapeHtml(copy.attachment)}</p></div>`,
      cta: { label: copy.open, url }, ctaAtTop: true, afterCtaHtml,
      footerHtml: `${escapeHtml(copy.footer)}<br/><span style="font-size:11px;">${escapeHtml(copy.reference)}: ${escapeHtml(ticket.id)}</span>${marketing.html}`,
    });
    const accessText = accessDetails.map(access => `• ${access.name}${access.menuChoice ? ` — ${copy.menu}: ${access.menuChoice}` : ""}`).join("\n");
    const text = `${copy.heading}\n${copy.intro}\n\n${title}\n${participantName ? `${copy.participant}: ${participantName}\n` : ""}${copy.date}: ${date}\n${copy.time}: ${time} (${copy.timezone})\n${venue ? `${copy.place}: ${venue}\n` : ""}${packageName ? `${copy.package}: ${packageName}\n` : ""}${accessText ? `\n${copy.includes}\n${accessText}\n` : ""}\n${copy.qr}\n${accessCopy}\n${copy.attachment}\n\n${copy.open}: ${url}\n\n${copy.how}\n1. ${copy.stepOne}: ${copy.stepOneBody}\n2. ${copy.stepTwo}: ${copy.stepTwoBody}\n\n${copy.guest}\n${copy.help} ${copy.contact}: ${contactUrl}\n\n${copy.footer}\n${copy.reference}: ${ticket.id}${marketing.text}`;
    if (readSetting("email_provider") === "smtp") {
      const host = readSetting("smtp_host");
      const user = readSetting("smtp_user");
      const pass = readSetting("smtp_pass");
      const port = Number(readSetting("smtp_port")) || 587;
      if (!host || !user || !pass) return { success: false };
      const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
      await transporter.sendMail({
        from: `Meraki <${user}>`, to: ticket.buyer_email, subject: copy.subject,
        html: htmlContent, text, messageId: `<ticket-${deliveryId}@merakiexperience.org>`,
        attachments: [{ filename: "biglietto-meraki.png", content: qr, cid: "meraki-ticket" }],
      });
    } else {
      const key = readSetting("resend_api_key") || defaultResendApiKey;
      if (!key) return { success: false };
      const { error } = await new Resend(key).emails.send({
        from: `Meraki <${FROM_EMAIL}>`, to: ticket.buyer_email, subject: copy.subject,
        html: htmlContent, text,
        attachments: [{ filename: "biglietto-meraki.png", content: qr, contentId: "meraki-ticket" }],
      }, { idempotencyKey: `meraki-ticket-${deliveryId}` });
      if (error) return { success: false };
    }
    return { success: true };
  } catch {
    console.error("Ticket email delivery failed.");
    return { success: false };
  }
}
