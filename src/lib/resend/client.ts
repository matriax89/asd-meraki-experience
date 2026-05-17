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

  const htmlContent = \`<!DOCTYPE html>
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
</body></html>\`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: \`"Meraki Experience" <\${smtp_user}>\`, to: order.buyer_email, subject: t.subject, html: htmlContent });
      return { success: true };
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      await resend.emails.send({ from: \`Meraki Experience <\${FROM_EMAIL}>\`, to: order.buyer_email, subject: t.subject, html: htmlContent });
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

  const subject = \`Nuovo Ordine Shop: \${order.numero_ordine}\`;
  
  const itemsHtml = items.map(i => \`<li>\${i.product_nome} (\${i.variant_descrizione || ''}) x\${i.quantita}</li>\`).join('');

  const htmlContent = \`<!DOCTYPE html>
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
</body></html>\`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: \`"Sistema" <\${smtp_user}>\`, to: targetEmail, subject, html: htmlContent });
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      await resend.emails.send({ from: \`Sistema <\${FROM_EMAIL}>\`, to: targetEmail, subject, html: htmlContent });
    }
  } catch (error) {
    console.error("Failed to send admin order notification:", error);
  }
}

export async function sendTicketConfirmation(ticket: any, eventData: any, locale: string = "it") {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const integrations = (settings?.value as any)?.integrations;
  const emailProvider = integrations?.email_provider || "resend";
  const activeApiKey = integrations?.resend_api_key || defaultResendApiKey;

  const subject = locale === 'it' ? "Il tuo biglietto - ASD Meraki Experience" : "Your Ticket - ASD Meraki Experience";
  
  const htmlContent = \`<!DOCTYPE html>
<html lang="\${locale}">
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 16px; text-align: center;">
    <h1 style="margin: 0 0 16px; font-size: 24px;">\${locale === 'it' ? 'Ecco il tuo biglietto!' : 'Here is your ticket!'}</h1>
    <p>\${eventData.titolo}</p>
    <div style="margin: 32px 0; padding: 24px; border: 2px dashed #e5e5ea; border-radius: 16px;">
      <h2 style="font-size: 32px; font-family: monospace; letter-spacing: 2px; margin: 0;">\${ticket.qr_code}</h2>
    </div>
    <p style="color: #86868b; font-size: 14px;">\${locale === 'it' ? 'Mostra questo codice all\\'ingresso.' : 'Show this code at the entrance.'}</p>
  </div>
</body></html>\`;

  try {
    if (emailProvider === "smtp") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass } = integrations;
      if (!smtp_host || !smtp_user || !smtp_pass) return { success: false };
      const transporter = nodemailer.createTransport({ host: smtp_host, port: parseInt(smtp_port) || 587, secure: parseInt(smtp_port) === 465, auth: { user: smtp_user, pass: smtp_pass } });
      await transporter.sendMail({ from: \`"Meraki Experience" <\${smtp_user}>\`, to: ticket.buyer_email, subject, html: htmlContent });
    } else {
      if (!activeApiKey) return { success: false };
      const resend = new Resend(activeApiKey);
      await resend.emails.send({ from: \`Meraki Experience <\${FROM_EMAIL}>\`, to: ticket.buyer_email, subject, html: htmlContent });
    }
  } catch (error) {
    console.error("Failed to send ticket:", error);
  }
}

