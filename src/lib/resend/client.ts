import { Resend } from "resend";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { normalizeRegistrationFields } from "@/lib/events/registration-fields";

const defaultResendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = "noreply@merakiexperience.org";
const DEFAULT_ADMIN_EMAIL = "info@merakiexperience.org";
const EMAIL_LOGO_URL = "https://www.merakiexperience.org/images/logo-meraki.png";

function emailHeader(kicker: string) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:24px;margin-bottom:28px;border-bottom:1px solid #e2e8f0;">
      <img src="${EMAIL_LOGO_URL}" width="150" alt="Meraki Experience" style="display:block;width:150px;max-width:46%;height:auto;" />
      <span style="display:inline-block;padding:7px 10px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;text-align:right;">${kicker}</span>
    </div>`;
}

const emailFooter = `
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;line-height:1.6;">
    ASD Meraki Experience · Bolzano · <a href="https://www.merakiexperience.org" style="color:#64748b;text-decoration:none;">merakiexperience.org</a>
  </div>`;

function escapeEmailText(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getEmailTransportSettings() {
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();
  const integrations = (settings?.value as any)?.integrations;
  return {
    integrations,
    provider: integrations?.email_provider || "resend",
    apiKey: integrations?.resend_api_key || defaultResendApiKey,
  };
}

async function sendBrandedEmail(to: string, subject: string, html: string) {
  const { integrations, provider, apiKey } = await getEmailTransportSettings();
  try {
    if (provider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations || {};
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: parseInt(smtp_port) || 587,
        secure: parseInt(smtp_port) === 465,
        auth: { user: smtp_user, pass: smtp_pass },
      });
      await transporter.sendMail({
        from: `"Meraki Experience" <${smtp_user}>`,
        to,
        subject,
        html,
      });
    } else {
      if (!apiKey) return { success: false };
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: `Meraki Experience <${FROM_EMAIL}>`,
        to,
        subject,
        html,
      });
      if (error) throw error;
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to send branded email:", error);
    return { success: false };
  }
}

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
              ${emailHeader("Notifica amministrativa")}
              <h1 style="color: #0f172a; margin: 0 0 8px 0; font-size: 24px; font-weight: 650; letter-spacing: -0.5px;">Nuovo messaggio</h1>
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
              ${emailFooter}
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
              ${emailHeader("Conferma richiesta")}
              <h1 style="color: #0f172a; margin: 0 0 16px 0; font-size: 24px; font-weight: 650; letter-spacing: -0.5px;">${t.title}</h1>
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
              ${emailFooter}
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

  const handDelivery = order.delivery_method === "hand_delivery";
  const translations: Record<string, any> = {
    it: { subject: `Conferma ordine ${order.numero_ordine} - ASD Meraki Experience`, title: "Grazie per il tuo ordine!", body: handDelivery ? "Il pagamento è confermato. Prepareremo il tuo ordine per il ritiro a mano e ti avviseremo quando sarà pronto." : "Il pagamento è confermato. Stiamo preparando il tuo ordine per la spedizione.", orderNum: "Numero ordine", total: "Totale", shipTo: handDelivery ? "Modalità di consegna" : "Indirizzo di spedizione", footer: "A presto", team: "Il Team di ASD Meraki Experience" },
    en: { subject: `Order confirmation ${order.numero_ordine} - ASD Meraki Experience`, title: "Thank you for your order!", body: handDelivery ? "Payment is confirmed. We will prepare your order for collection and notify you when it is ready." : "Payment is confirmed. We are preparing your order for shipment.", orderNum: "Order number", total: "Total", shipTo: handDelivery ? "Delivery method" : "Shipping address", footer: "See you soon", team: "The ASD Meraki Experience Team" },
    de: { subject: `Bestellbestätigung ${order.numero_ordine} - ASD Meraki Experience`, title: "Vielen Dank für Ihre Bestellung!", body: handDelivery ? "Die Zahlung ist bestätigt. Wir bereiten Ihre Bestellung zur Abholung vor und benachrichtigen Sie, sobald sie bereit ist." : "Die Zahlung ist bestätigt. Wir bereiten Ihre Bestellung für den Versand vor.", orderNum: "Bestellnummer", total: "Gesamtbetrag", shipTo: handDelivery ? "Übergabeart" : "Lieferadresse", footer: "Bis bald", team: "Das Team von ASD Meraki Experience" }
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
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <title>${t.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
    <tr><td align="center">
      <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e5ea; overflow: hidden;">
        <tr><td style="padding: 48px 40px; text-align: left;">
          ${emailHeader("Conferma ordine")}
          <h1 style="color: #0f172a; margin: 0 0 16px 0; font-size: 24px; font-weight: 650;">${t.title}</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #1d1d1f; margin: 0 0 32px 0;">${t.body}</p>
          
          <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 16px 0; font-weight: 600;">${t.orderNum}: ${order.numero_ordine}</h2>
          
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
            ${itemsHtml}
            <tr>
              <td style="padding: 16px 0 0 0; text-align: right; color: #86868b; font-size: 14px;">Spedizione:</td>
              <td style="padding: 16px 0 0 0; text-align: right; color: #1d1d1f; font-size: 14px;">€${(order.shipping_cents / 100).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0 0 0; text-align: right; color: #1d1d1f; font-size: 16px; font-weight: 600;">${t.total}:</td>
              <td style="padding: 8px 0 0 0; text-align: right; color: #1d1d1f; font-size: 16px; font-weight: 600;">€${(order.total_cents / 100).toFixed(2)}</td>
            </tr>
          </table>

          <div style="background-color: #f5f5f7; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
            <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #86868b; margin: 0 0 8px 0; font-weight: 600;">${t.shipTo}</h3>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1d1d1f;">
              ${handDelivery
                ? (locale === "de" ? "Abholung vor Ort — wir informieren Sie, sobald die Bestellung bereit ist." : locale === "en" ? "Collection in person — we will notify you when the order is ready." : "Ritiro a mano — ti avviseremo quando l’ordine sarà pronto.")
                : `${order.buyer_nome} ${order.buyer_cognome}<br/>
                  ${order.ship_address_line1}<br/>
                  ${order.ship_address_line2 ? order.ship_address_line2 + '<br/>' : ''}
                  ${order.ship_city}, ${order.ship_postal_code}${order.ship_state ? ` (${order.ship_state})` : ''}<br/>
                  ${order.ship_country}`}
            </p>
          </div>
          
          <p style="font-size: 15px; color: #86868b; margin: 0;">${t.footer},<br/><strong style="color: #1d1d1f;">${t.team}</strong></p>
          ${emailFooter}
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
      await transporter.sendMail({ from: `"Meraki Experience" <${smtp_user}>`, to: order.buyer_email, subject: t.subject, html: htmlContent });
      return { success: true };
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      const { error } = await resend.emails.send({ from: `Meraki Experience <${FROM_EMAIL}>`, to: order.buyer_email, subject: t.subject, html: htmlContent });
      if (error) throw error;
      return { success: true };
    }
  } catch (error) {
    console.error("Failed to send order confirmation:", error);
    return { success: false };
  }
}

export async function sendOrderStatusUpdate(order: any, items: any[], locale: string = "it") {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;
  const language = ["it", "en", "de"].includes(locale) ? locale : "it";

  const copy: Record<string, Record<string, { subject: string; title: string; body: string; kicker: string }>> = {
    it: {
      processing: { subject: `Ordine ${order.numero_ordine} in preparazione`, title: "Stiamo preparando il tuo ordine", body: order.delivery_method === "hand_delivery" ? "Il team Meraki sta preparando i tuoi articoli per il ritiro a mano." : "Il team Meraki sta preparando i tuoi articoli per la spedizione.", kicker: "In preparazione" },
      shipped: { subject: `Il tuo ordine ${order.numero_ordine} è stato spedito`, title: "Il tuo ordine è in viaggio", body: "Abbiamo affidato il pacco al corriere. Qui sotto trovi i dati per seguire la consegna.", kicker: "Ordine spedito" },
      ready_for_pickup: { subject: `Il tuo ordine ${order.numero_ordine} è pronto per il ritiro`, title: "Puoi ritirare il tuo ordine", body: "Il tuo ordine è pronto per il ritiro a mano. Contatta il team Meraki per concordare giorno e orario.", kicker: "Pronto al ritiro" },
      delivered: { subject: `Ordine ${order.numero_ordine} consegnato`, title: "Consegna completata", body: "Il corriere ha indicato il tuo ordine come consegnato. Se riscontri problemi, contatta il team Meraki.", kicker: "Consegnato" },
      completed: { subject: `Ordine ${order.numero_ordine} completato`, title: "Ordine completato", body: order.delivery_method === "hand_delivery" ? "Il ritiro a mano risulta completato. Grazie per aver scelto Meraki Experience." : "Il tuo ordine risulta completato. Grazie per aver scelto Meraki Experience.", kicker: "Completato" },
      cancelled: { subject: `Ordine ${order.numero_ordine} annullato`, title: "Ordine annullato", body: "Il tuo ordine è stato annullato. Per qualsiasi chiarimento, rispondi a questa email.", kicker: "Annullato" },
      refunded: { subject: `Rimborso ordine ${order.numero_ordine}`, title: "Rimborso registrato", body: "Abbiamo registrato il rimborso del tuo ordine. I tempi di accredito dipendono dal metodo di pagamento.", kicker: "Rimborsato" },
    },
    en: {
      processing: { subject: `Order ${order.numero_ordine} is being prepared`, title: "We are preparing your order", body: order.delivery_method === "hand_delivery" ? "The Meraki team is preparing your items for collection." : "The Meraki team is preparing your items for shipment.", kicker: "In preparation" },
      shipped: { subject: `Your order ${order.numero_ordine} has shipped`, title: "Your order is on its way", body: "We have handed your parcel to the carrier. Tracking details are shown below.", kicker: "Order shipped" },
      ready_for_pickup: { subject: `Your order ${order.numero_ordine} is ready for collection`, title: "Your order is ready", body: "Contact the Meraki team to arrange a collection day and time.", kicker: "Ready for collection" },
      delivered: { subject: `Order ${order.numero_ordine} delivered`, title: "Delivery completed", body: "The carrier marked your order as delivered. Contact the Meraki team if there is a problem.", kicker: "Delivered" },
      completed: { subject: `Order ${order.numero_ordine} completed`, title: "Order completed", body: "Your order is complete. Thank you for choosing Meraki Experience.", kicker: "Completed" },
      cancelled: { subject: `Order ${order.numero_ordine} cancelled`, title: "Order cancelled", body: "Your order has been cancelled. Reply to this email if you need assistance.", kicker: "Cancelled" },
      refunded: { subject: `Refund for order ${order.numero_ordine}`, title: "Refund recorded", body: "We have recorded your refund. Credit times depend on the payment method.", kicker: "Refunded" },
    },
    de: {
      processing: { subject: `Bestellung ${order.numero_ordine} wird vorbereitet`, title: "Wir bereiten Ihre Bestellung vor", body: order.delivery_method === "hand_delivery" ? "Das Meraki-Team bereitet Ihre Artikel zur Abholung vor." : "Das Meraki-Team bereitet Ihre Artikel für den Versand vor.", kicker: "In Vorbereitung" },
      shipped: { subject: `Ihre Bestellung ${order.numero_ordine} wurde versandt`, title: "Ihre Bestellung ist unterwegs", body: "Wir haben Ihr Paket dem Versanddienstleister übergeben. Die Sendungsdaten finden Sie unten.", kicker: "Versandt" },
      ready_for_pickup: { subject: `Ihre Bestellung ${order.numero_ordine} ist abholbereit`, title: "Ihre Bestellung ist bereit", body: "Kontaktieren Sie das Meraki-Team, um Tag und Uhrzeit der Abholung zu vereinbaren.", kicker: "Abholbereit" },
      delivered: { subject: `Bestellung ${order.numero_ordine} zugestellt`, title: "Zustellung abgeschlossen", body: "Der Versanddienstleister hat Ihre Bestellung als zugestellt markiert. Kontaktieren Sie uns bei Problemen.", kicker: "Zugestellt" },
      completed: { subject: `Bestellung ${order.numero_ordine} abgeschlossen`, title: "Bestellung abgeschlossen", body: "Ihre Bestellung ist abgeschlossen. Vielen Dank, dass Sie Meraki Experience gewählt haben.", kicker: "Abgeschlossen" },
      cancelled: { subject: `Bestellung ${order.numero_ordine} storniert`, title: "Bestellung storniert", body: "Ihre Bestellung wurde storniert. Antworten Sie auf diese E-Mail, wenn Sie Hilfe benötigen.", kicker: "Storniert" },
      refunded: { subject: `Erstattung für Bestellung ${order.numero_ordine}`, title: "Erstattung erfasst", body: "Wir haben Ihre Erstattung erfasst. Die Gutschriftzeit hängt von der Zahlungsmethode ab.", kicker: "Erstattet" },
    },
  };

  const t = copy[language]?.[order.status];
  if (!t || order.status === "paid" || order.status === "pending") return { success: true };
  const tracking = order.status === "shipped"
    ? `<div style="margin:24px 0;padding:18px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Tracking</div>
        <div style="font-size:14px;color:#0f172a;">${order.tracking_number || "Il codice sarà comunicato appena disponibile."}</div>
        ${order.tracking_url ? `<a href="${order.tracking_url}" style="display:inline-block;margin-top:12px;color:#4f46e5;text-decoration:none;font-weight:600;">Segui la spedizione →</a>` : ""}
      </div>`
    : "";
  const itemsSummary = items.map((item) => `<li style="margin:6px 0;">${item.product_nome} × ${item.quantita}</li>`).join("");
  const htmlContent = `<!DOCTYPE html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table width="100%" cellspacing="0" cellpadding="0" style="padding:40px 20px;"><tr><td align="center">
      <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;"><tr><td style="padding:40px;">
        ${emailHeader(t.kicker)}
        <h1 style="margin:0 0 14px;color:#0f172a;font-size:24px;">${t.title}</h1>
        <p style="margin:0;color:#475569;font-size:15px;line-height:1.65;">${t.body}</p>
        ${tracking}
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;">
          <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">${order.numero_ordine}</div>
          <ul style="margin:12px 0 0;padding-left:20px;color:#334155;font-size:14px;line-height:1.5;">${itemsSummary}</ul>
        </div>
        ${emailFooter}
      </td></tr></table>
    </td></tr></table>
  </body></html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations || {};
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: `"Meraki Experience" <${smtp_user}>`, to: order.buyer_email, subject: t.subject, html: htmlContent });
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      const { error } = await resend.emails.send({ from: `Meraki Experience <${FROM_EMAIL}>`, to: order.buyer_email, subject: t.subject, html: htmlContent });
      if (error) throw error;
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to send order status update:", error);
    return { success: false };
  }
}

export async function sendOrderNotification(order: any, items: any[]) {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;
  const targetEmail = integrations?.admin_email || DEFAULT_ADMIN_EMAIL;

  const subject = `Nuovo Ordine Shop: ${order.numero_ordine}`;
  
  const itemsHtml = items.map(i => `<li>${i.product_nome} (${i.variant_descrizione || ''}) x${i.quantita}</li>`).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 16px;">
    ${emailHeader("Notifica amministrativa")}
    <h1 style="color:#0f172a;margin: 0 0 16px; font-size: 22px;">Nuovo ordine ricevuto</h1>
    <p>È stato appena pagato l'ordine <strong>${order.numero_ordine}</strong> da ${order.buyer_nome} ${order.buyer_cognome} (${order.buyer_email}).</p>
    <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
      <strong>${order.delivery_method === "hand_delivery" ? "Ritiro a mano" : "Da spedire"}</strong><br/>
      ${order.delivery_method === "hand_delivery"
        ? "Nessun indirizzo di spedizione: concordare il ritiro con il cliente."
        : `${order.ship_address_line1}${order.ship_address_line2 ? `, ${order.ship_address_line2}` : ""}<br/>${order.ship_postal_code} ${order.ship_city}${order.ship_state ? ` (${order.ship_state})` : ""}, ${order.ship_country}`}
    </div>
    <ul>${itemsHtml}</ul>
    <p>Totale: €${(order.total_cents / 100).toFixed(2)}</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merakiexperience.org'}/it/admin/ordini" style="display: inline-block; background: #1d1d1f; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Gestisci Ordini</a>
    ${emailFooter}
  </div>
</body></html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: `"Sistema" <${smtp_user}>`, to: targetEmail, subject, html: htmlContent });
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      const { error } = await resend.emails.send({ from: `Meraki Experience <${FROM_EMAIL}>`, to: targetEmail, subject, html: htmlContent });
      if (error) throw error;
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to send admin order notification:", error);
    return { success: false };
  }
}

export async function sendTicketConfirmation(ticket: any, eventData: any, locale: string = "it") {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;

  const language = ["it", "en", "de"].includes(locale) ? locale : "it";
  const eventTitle = getLocalizedText(eventData.titolo, language) || "Meraki Experience";
  const copy = {
    it: { subject: `Il tuo biglietto per ${eventTitle}`, title: "Il tuo biglietto è pronto", body: "Conserva questa email e mostra il QR code all’ingresso.", date: "Data e luogo" },
    en: { subject: `Your ticket for ${eventTitle}`, title: "Your ticket is ready", body: "Keep this email and show the QR code at the entrance.", date: "Date and venue" },
    de: { subject: `Ihre Eintrittskarte für ${eventTitle}`, title: "Ihre Eintrittskarte ist bereit", body: "Bewahren Sie diese E-Mail auf und zeigen Sie den QR-Code am Eingang.", date: "Datum und Ort" },
  }[language as "it" | "en" | "de"];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org";
  const qrUrl = `${siteUrl}/api/tickets/qr?token=${ticket.access_token}`;
  const ticketUrl = `${siteUrl}/${language}/biglietto/${ticket.id}?token=${ticket.access_token}`;
  const eventDate = new Intl.DateTimeFormat(language, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(eventData.data_inizio));
  const answerRows = buildRegistrationAnswerRows(eventData.registration_fields, ticket.registration_answers);
  
  const htmlContent = `<!DOCTYPE html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border:1px solid #e2e8f0; border-radius: 16px; text-align: center;">
    ${emailHeader("Biglietto digitale")}
    <h1 style="color:#0f172a;margin:0 0 12px;font-size:24px;">${copy.title}</h1>
    <p style="color:#475569;margin:0 0 8px;">${copy.body}</p>
    <h2 style="color:#0f172a;margin:24px 0 8px;font-size:20px;">${eventTitle}</h2>
    <p style="color:#64748b;font-size:14px;line-height:1.5;margin:0;">${copy.date}:<br><strong>${eventDate}</strong>${eventData.location ? `<br>${eventData.location}` : ""}</p>
    ${answerRows}
    <div style="margin:28px auto;padding:18px;border:2px dashed #cbd5e1;border-radius:16px;max-width:260px;">
      <img src="${qrUrl}" width="220" height="220" alt="QR code" style="display:block;width:220px;height:220px;margin:auto;" />
    </div>
    <a href="${ticketUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:600;">Apri biglietto</a>
    ${emailFooter}
  </div>
</body></html>`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: `"Meraki Experience" <${smtp_user}>`, to: ticket.buyer_email, subject: copy.subject, html: htmlContent });
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      const { error } = await resend.emails.send({ from: `Meraki Experience <${FROM_EMAIL}>`, to: ticket.buyer_email, subject: copy.subject, html: htmlContent });
      if (error) throw error;
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to send ticket:", error);
    return { success: false };
  }
}

export async function sendTicketNotification(ticket: any, eventData: any) {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const provider = integrations?.email_provider || "resend";
  const apiKey = integrations?.resend_api_key || defaultResendApiKey;
  const targetEmail = integrations?.admin_email || DEFAULT_ADMIN_EMAIL;
  const eventTitle = getLocalizedText(eventData.titolo, "it") || "Evento";
  const subject = `Nuova iscrizione: ${eventTitle}`;
  const answerRows = buildRegistrationAnswerRows(eventData.registration_fields, ticket.registration_answers);
  const html = `<!DOCTYPE html><html lang="it"><body style="margin:0;padding:40px 20px;background:#f5f5f7;font-family:-apple-system,sans-serif;">
    <div style="max-width:600px;margin:auto;background:#fff;padding:40px;border:1px solid #e2e8f0;border-radius:16px;">
      ${emailHeader("Nuova iscrizione")}
      <h1 style="margin:0 0 14px;color:#0f172a;font-size:23px;">${eventTitle}</h1>
      <p style="color:#475569;line-height:1.6;">È stato emesso un biglietto per <strong>${ticket.buyer_email}</strong>.</p>
      <div style="margin:22px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;color:#334155;">
        Importo: <strong>${ticket.amount_cents ? `€${(ticket.amount_cents / 100).toFixed(2)}` : "Iscrizione gratuita"}</strong><br>
        Codice: <strong>${ticket.qr_code}</strong>
      </div>
      ${answerRows}
      <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org"}/it/admin/biglietti" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gestisci partecipanti</a>
      ${emailFooter}
    </div></body></html>`;
  try {
    if (provider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations || {};
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transport = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transport.sendMail({ from: `"Meraki Experience" <${smtp_user}>`, to: targetEmail, subject, html });
    } else {
      if (!apiKey) return { success: false };
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({ from: `Meraki Experience <${FROM_EMAIL}>`, to: targetEmail, subject, html });
      if (error) throw error;
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to send ticket notification:", error);
    return { success: false };
  }
}

function buildRegistrationAnswerRows(fieldsValue: unknown, answersValue: unknown) {
  const fields = normalizeRegistrationFields(fieldsValue);
  const answers = answersValue && typeof answersValue === "object" && !Array.isArray(answersValue)
    ? answersValue as Record<string, unknown>
    : {};
  const rows = fields
    .filter((field) => answers[field.id] !== undefined && answers[field.id] !== "" && answers[field.id] !== false)
    .map((field) => `<tr>
      <td style="padding:7px 10px;color:#64748b;font-size:12px;border-bottom:1px solid #e2e8f0;">${escapeEmailText(field.label)}</td>
      <td style="padding:7px 10px;color:#0f172a;font-size:12px;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeEmailText(answers[field.id] === true ? "Sì" : answers[field.id])}</td>
    </tr>`)
    .join("");
  return rows
    ? `<table width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:10px;border-collapse:collapse;">${rows}</table>`
    : "";
}

export type EventCommunicationType = "reminder" | "update" | "cancelled" | "thank_you";

export async function sendEventCommunication(
  ticket: any,
  eventData: any,
  type: EventCommunicationType,
) {
  const language = ["it", "en", "de"].includes(ticket.locale) ? ticket.locale : "it";
  const eventTitle = getLocalizedText(eventData.titolo, language) || "Meraki Experience";
  const eventDate = new Intl.DateTimeFormat(language, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(eventData.data_inizio));
  const venue = [eventData.location, eventData.indirizzo].filter(Boolean).join(" · ");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org";
  const ticketUrl = ticket.access_token
    ? `${siteUrl}/${language}/biglietto/${ticket.id}?token=${ticket.access_token}`
    : `${siteUrl}/${language}/eventi/${eventData.slug}`;

  const messages = {
    it: {
      reminder: { subject: `Promemoria: ${eventTitle}`, kicker: "Promemoria evento", title: "Ci vediamo presto", body: "Il tuo evento si avvicina. Qui trovi nuovamente data, luogo e accesso al biglietto.", cta: "Apri il biglietto" },
      update: { subject: `Aggiornamento importante: ${eventTitle}`, kicker: "Aggiornamento evento", title: "Sono cambiati alcuni dettagli", body: "Controlla qui sotto le informazioni aggiornate dell’evento. Ti consigliamo di conservarle.", cta: "Controlla il biglietto" },
      cancelled: { subject: `Evento annullato: ${eventTitle}`, kicker: "Evento annullato", title: "L’evento è stato annullato", body: "Ci dispiace comunicarti che questo evento non si svolgerà. Il team Meraki ti contatterà separatamente se sono previste procedure di rimborso.", cta: "Contatta Meraki" },
      thank_you: { subject: `Grazie per aver partecipato a ${eventTitle}`, kicker: "Grazie", title: "È stato bello averti con noi", body: "Grazie per aver partecipato. Speriamo che l’esperienza ti sia piaciuta e di rivederti presto.", cta: "Scopri i prossimi eventi" },
    },
    en: {
      reminder: { subject: `Reminder: ${eventTitle}`, kicker: "Event reminder", title: "See you soon", body: "Your event is approaching. Here are the date, venue and ticket details again.", cta: "Open ticket" },
      update: { subject: `Important update: ${eventTitle}`, kicker: "Event update", title: "Some details have changed", body: "Please review the updated event information below and keep it for reference.", cta: "Review ticket" },
      cancelled: { subject: `Event cancelled: ${eventTitle}`, kicker: "Event cancelled", title: "The event has been cancelled", body: "We are sorry to let you know that this event will not take place. The Meraki team will contact you separately if a refund process applies.", cta: "Contact Meraki" },
      thank_you: { subject: `Thank you for joining ${eventTitle}`, kicker: "Thank you", title: "It was great to have you with us", body: "Thank you for taking part. We hope you enjoyed the experience and look forward to seeing you again.", cta: "Discover upcoming events" },
    },
    de: {
      reminder: { subject: `Erinnerung: ${eventTitle}`, kicker: "Veranstaltungserinnerung", title: "Bis bald", body: "Ihre Veranstaltung rückt näher. Hier finden Sie Datum, Ort und Ticket erneut.", cta: "Ticket öffnen" },
      update: { subject: `Wichtige Aktualisierung: ${eventTitle}`, kicker: "Veranstaltungsupdate", title: "Einige Details haben sich geändert", body: "Bitte prüfen Sie die aktualisierten Veranstaltungsinformationen unten.", cta: "Ticket prüfen" },
      cancelled: { subject: `Veranstaltung abgesagt: ${eventTitle}`, kicker: "Veranstaltung abgesagt", title: "Die Veranstaltung wurde abgesagt", body: "Leider findet diese Veranstaltung nicht statt. Das Meraki-Team kontaktiert Sie separat, falls eine Rückerstattung vorgesehen ist.", cta: "Meraki kontaktieren" },
      thank_you: { subject: `Danke für Ihre Teilnahme an ${eventTitle}`, kicker: "Vielen Dank", title: "Schön, dass Sie dabei waren", body: "Vielen Dank für Ihre Teilnahme. Wir hoffen, dass Ihnen das Erlebnis gefallen hat und freuen uns auf ein Wiedersehen.", cta: "Weitere Veranstaltungen" },
    },
  } as const;
  const copy = messages[language as "it" | "en" | "de"][type];
  const targetUrl = type === "cancelled"
    ? "mailto:info@merakiexperience.org"
    : type === "thank_you"
      ? `${siteUrl}/${language}/eventi`
      : ticketUrl;
  const safeName = escapeEmailText(
    `${ticket.buyer_nome || ""} ${ticket.buyer_cognome || ""}`.trim(),
  );
  const html = `<!DOCTYPE html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:40px 20px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:600px;margin:auto;background:#fff;padding:40px;border:1px solid #e2e8f0;border-radius:16px;">
      ${emailHeader(copy.kicker)}
      <p style="margin:0 0 10px;color:#64748b;font-size:14px;">${safeName ? `${language === "de" ? "Hallo" : language === "en" ? "Hello" : "Ciao"} ${safeName},` : ""}</p>
      <h1 style="margin:0 0 14px;color:#0f172a;font-size:25px;line-height:1.2;">${escapeEmailText(copy.title)}</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.65;">${escapeEmailText(copy.body)}</p>
      <div style="margin:26px 0;padding:18px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <strong style="display:block;color:#0f172a;font-size:17px;margin-bottom:8px;">${escapeEmailText(eventTitle)}</strong>
        <span style="display:block;color:#475569;font-size:14px;line-height:1.6;">${escapeEmailText(eventDate)}${venue ? `<br>${escapeEmailText(venue)}` : ""}</span>
      </div>
      <a href="${targetUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:650;">${escapeEmailText(copy.cta)}</a>
      ${emailFooter}
    </div>
  </body></html>`;
  return sendBrandedEmail(ticket.buyer_email, copy.subject, html);
}
