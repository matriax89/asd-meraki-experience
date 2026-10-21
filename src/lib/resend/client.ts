import { Resend } from "resend";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { Database } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";
import { emailLocale, escapeEmailHtml, marketingEmailSection, renderMerakiEmail } from "@/lib/email/meraki-template";
import { eventTravelCopy, eventTravelPath } from "@/lib/events/travel-link";
import { activityTimingCopy, activityTimingRows, hasActivityTiming, normalizedActivityTiming, type ActivityTiming } from "@/lib/events/activity-timing";

const defaultResendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = "noreply@merakiexperience.org";
const DEFAULT_ADMIN_EMAIL = "info@merakiexperience.org";
type LeadEmail = Pick<Database["public"]["Tables"]["leads"]["Row"], "nome" | "cognome" | "email" | "telefono" | "messaggio" | "source">;
type ShopOrderEmail = Pick<Database["public"]["Tables"]["orders"]["Row"], "numero_ordine" | "buyer_nome" | "buyer_cognome" | "buyer_email" | "ship_address_line1" | "ship_address_line2" | "ship_city" | "ship_postal_code" | "ship_state" | "ship_country" | "shipping_cents" | "total_cents">;
type ShopItemEmail = Pick<Database["public"]["Tables"]["order_items"]["Row"], "product_nome" | "variant_descrizione" | "quantita" | "totale_cents">;
export type ServiceMessage = { to: string; subject: string; html: string; text: string; replyTo?: string; deliveryId?: string };
const emailAddress = (value: string) => /^[^\s@<>,;\r\n]+@[^\s@<>,;\r\n]+\.[^\s@<>,;\r\n]+$/.test(value);
const html = (value: string | null | undefined) => escapeEmailHtml(value || "");
const multiline = (value: string) => escapeEmailHtml(value).replace(/\r?\n/g, "<br/>");
const eur = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
function siteOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org");
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch { /* A malformed optional origin must not break service email delivery. */ }
  return "https://www.merakiexperience.org";
}

/** Every service email uses the same configured provider; never log credentials or private content. */
export async function sendServiceEmail(build: (adminEmail: string) => ServiceMessage, defaultAdminEmail = DEFAULT_ADMIN_EMAIL) {
  try {
    const { data: settings, error } = await createAdminClient().from("site_settings").select("value").eq("key", "homepage_content").single();
    if (error) return { success: false };
    const value = settings?.value;
    const integrations: Record<string, unknown> = value && typeof value === "object" && !Array.isArray(value)
      && value.integrations && typeof value.integrations === "object" && !Array.isArray(value.integrations) ? value.integrations : {};
    const read = (name: string) => typeof integrations[name] === "string" ? integrations[name] as string : "";
    const message = build(read("admin_email") || defaultAdminEmail);
    if (!emailAddress(message.to) || /[\r\n]/.test(message.subject) || (message.replyTo && !emailAddress(message.replyTo))) return { success: false };
    if (message.deliveryId && !/^[a-zA-Z0-9._:-]{1,160}$/.test(message.deliveryId)) return { success: false };
    if (read("email_provider") === "smtp") {
      const user = read("smtp_user"); const pass = read("smtp_pass"); const host = read("smtp_host");
      const port = Number(read("smtp_port")) || 587;
      if (!host || !emailAddress(user) || !pass) return { success: false };
      const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
      const { deliveryId, ...content } = message;
      const data = await transporter.sendMail({ from: `Meraki Experience <${user}>`, ...content,
        ...(deliveryId ? { messageId: `<meraki-service-${deliveryId}@merakiexperience.org>` } : {}),
      });
      return { success: true, data };
    }
    const key = read("resend_api_key") || defaultResendApiKey;
    if (!key) return { success: false };
    const { data, error: deliveryError } = await new Resend(key).emails.send({
      from: `Meraki Experience <${FROM_EMAIL}>`, to: message.to, subject: message.subject, html: message.html, text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    }, message.deliveryId ? { idempotencyKey: `meraki-service-${message.deliveryId}` } : undefined);
    return deliveryError ? { success: false } : { success: true, data };
  } catch {
    console.error("Meraki service email delivery failed.");
    return { success: false };
  }
}

export async function sendLeadNotification(lead: LeadEmail) {
  return sendServiceEmail(adminEmail => {
    const name = [lead.nome, lead.cognome].filter(Boolean).join(" ");
    const contact = lead.source === "contact_form";
    const title = contact ? "Nuovo messaggio dal sito" : "Nuova richiesta di prova gratuita";
    const subject = `${title} · ${name}`.replace(/[\r\n]+/g, " ");
    const message = lead.messaggio || "Nessun messaggio fornito.";
    const fields = [["Nome", name], ["Email", lead.email || ""], ...(lead.telefono && lead.telefono !== "N/A" ? [["Telefono", lead.telefono]] : []), ["Sorgente", contact ? "Modulo contatti" : lead.source]];
    const url = `${siteOrigin()}/it/admin/leads`;
    return { to: adminEmail, ...(lead.email ? { replyTo: lead.email } : {}), subject,
      html: renderMerakiEmail({ locale: "it", siteUrl: siteOrigin(), title, preheader: `${title} · ${name}`,
        bodyHtml: `<p style="margin:0 0 20px;">Hai ricevuto una nuova richiesta su Meraki Experience.</p>${fields.map(([label, value]) => `<p style="margin:0 0 12px;"><strong>${html(label)}:</strong> ${html(value)}</p>`).join("")}<h2 style="font-size:18px;margin:26px 0 12px;">Messaggio</h2><p style="margin:0;">${multiline(message)}</p>`,
        cta: { label: "Gestisci nella dashboard", url }, footerHtml: "Notifica di servizio per l’amministrazione Meraki Experience." }),
      text: `${title}\n\n${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nMessaggio\n${message}\n\nGestisci nella dashboard: ${url}`,
    };
  });
}

const autoReplyCopy = {
  it: { subject: "Abbiamo ricevuto la tua richiesta · Meraki Experience", title: "Grazie per averci contattato", body: "Abbiamo ricevuto la tua richiesta. Il nostro team ti risponderà il prima possibile all’indirizzo email che ci hai fornito.", message: "Il tuo messaggio", trial: "Richiesta di prova gratuita", empty: "Richiesta di informazioni", action: "Scopri gli eventi Meraki", footer: "Questa email conferma la ricezione della tua richiesta. Non è un’iscrizione alle comunicazioni promozionali." },
  en: { subject: "We received your request · Meraki Experience", title: "Thank you for contacting us", body: "We have received your request. Our team will reply as soon as possible to the email address you provided.", message: "Your message", trial: "Free trial request", empty: "Information request", action: "Discover Meraki events", footer: "This email confirms that we received your request. It does not subscribe you to promotional messages." },
  de: { subject: "Wir haben deine Anfrage erhalten · Meraki Experience", title: "Vielen Dank für deine Nachricht", body: "Wir haben deine Anfrage erhalten. Unser Team antwortet dir so bald wie möglich an die angegebene E-Mail-Adresse.", message: "Deine Nachricht", trial: "Anfrage für ein kostenloses Probetraining", empty: "Informationsanfrage", action: "Meraki-Veranstaltungen entdecken", footer: "Diese E-Mail bestätigt den Eingang deiner Anfrage. Du wirst dadurch nicht für Werbemitteilungen angemeldet." },
  es: { subject: "Hemos recibido tu solicitud · Meraki Experience", title: "Gracias por contactar con nosotros", body: "Hemos recibido tu solicitud. Nuestro equipo te responderá lo antes posible a la dirección de correo que nos has facilitado.", message: "Tu mensaje", trial: "Solicitud de clase de prueba gratuita", empty: "Solicitud de información", action: "Descubre los eventos Meraki", footer: "Este correo confirma que hemos recibido tu solicitud. No te suscribe a comunicaciones promocionales." },
};
export async function sendAutoReply(lead: LeadEmail, locale = "it") {
  return sendServiceEmail(() => {
    const language = emailLocale(locale); const t = autoReplyCopy[language];
    const title = `${t.title}${lead.nome ? `, ${lead.nome}` : ""}!`;
    const message = lead.messaggio || (lead.source === "contact_form" ? t.empty : t.trial);
    const url = `${siteOrigin()}/${language}/eventi`;
    return { to: lead.email || "", subject: t.subject,
      html: renderMerakiEmail({ locale: language, siteUrl: siteOrigin(), title, preheader: t.body,
        bodyHtml: `<p style="margin:0 0 24px;">${html(t.body)}</p><h2 style="font-size:18px;margin:0 0 12px;">${html(t.message)}</h2><div style="padding:18px;border-left:3px solid #c2a36b;border-radius:8px;background:#fffefa;">${multiline(message)}</div>`, cta: { label: t.action, url }, footerHtml: html(t.footer) }),
      text: `${title}\n${t.body}\n\n${t.message}\n${message}\n\n${t.action}: ${url}\n\n${t.footer}`,
    };
  });
}

const orderCopy = {
  it: { subject: "Conferma ordine", title: "Grazie per il tuo ordine!", body: "Il pagamento è confermato. Qui trovi il riepilogo del tuo acquisto e l’indirizzo di spedizione.", number: "Numero ordine", shipping: "Spedizione", total: "Totale pagato", subtotal: "Totale prodotti", saving: "Sconto applicato", address: "Indirizzo di spedizione", help: "Hai bisogno di aiuto?", contact: "Contattaci", footer: "Email di servizio relativa al tuo acquisto. Non è necessario il consenso alle comunicazioni promozionali per riceverla." },
  en: { subject: "Order confirmation", title: "Thank you for your order!", body: "Your payment is confirmed. Here are your purchase summary and shipping address.", number: "Order number", shipping: "Shipping", total: "Total paid", subtotal: "Product total", saving: "Discount applied", address: "Shipping address", help: "Need help?", contact: "Contact us", footer: "Service email about your purchase. Promotional consent is not required to receive it." },
  de: { subject: "Bestellbestätigung", title: "Vielen Dank für deine Bestellung!", body: "Deine Zahlung ist bestätigt. Hier findest du die Zusammenfassung deines Kaufs und die Lieferadresse.", number: "Bestellnummer", shipping: "Versand", total: "Bezahlter Gesamtbetrag", subtotal: "Warensumme", saving: "Angewandter Rabatt", address: "Lieferadresse", help: "Brauchst du Hilfe?", contact: "Kontaktiere uns", footer: "Service-E-Mail zu deinem Kauf. Du erhältst sie unabhängig von deiner Einwilligung in Werbemitteilungen." },
  es: { subject: "Confirmación del pedido", title: "¡Gracias por tu pedido!", body: "Tu pago está confirmado. Aquí tienes el resumen de tu compra y la dirección de envío.", number: "Número de pedido", shipping: "Envío", total: "Total pagado", subtotal: "Total de productos", saving: "Descuento aplicado", address: "Dirección de envío", help: "¿Necesitas ayuda?", contact: "Contáctanos", footer: "Correo de servicio sobre tu compra. No se necesita consentimiento para promociones para recibirlo." },
};
const itemText = (item: ShopItemEmail) => `${item.product_nome}${item.variant_descrizione ? ` · ${item.variant_descrizione}` : ""} × ${item.quantita}: ${eur(item.totale_cents)}`;
function orderItemsHtml(items: ShopItemEmail[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(item => `<tr><td style="padding:14px 10px 14px 0;border-bottom:1px solid #e3e5dd;"><strong>${html(item.product_nome)}</strong><br/><span style="font-size:13px;color:#626d63;">${html(item.variant_descrizione)} × ${item.quantita}</span></td><td style="padding:14px 0;border-bottom:1px solid #e3e5dd;text-align:right;white-space:nowrap;font-weight:650;">${html(eur(item.totale_cents))}</td></tr>`).join("")}</table>`;
}
export async function sendOrderConfirmation(order: ShopOrderEmail, items: ShopItemEmail[], locale = "it") {
  return sendServiceEmail(() => {
    const language = emailLocale(locale); const t = orderCopy[language];
    const name = [order.buyer_nome, order.buyer_cognome].filter(Boolean).join(" ");
    const address = [name, order.ship_address_line1, order.ship_address_line2, `${order.ship_postal_code} ${order.ship_city}${order.ship_state ? ` (${order.ship_state})` : ""}`, order.ship_country].filter(Boolean).join("\n");
    const productTotal = items.reduce((sum, item) => sum + item.totale_cents, 0);
    const savings = Math.max(0, productTotal + order.shipping_cents - order.total_cents);
    const totals = [[t.subtotal, eur(productTotal)], ...(savings ? [[t.saving, `−${eur(savings)}`]] : []), [t.shipping, eur(order.shipping_cents)], [t.total, eur(order.total_cents)]];
    const url = `${siteOrigin()}/${language}/contatti`;
    return { to: order.buyer_email, subject: `${t.subject} ${order.numero_ordine} · Meraki Experience`.replace(/[\r\n]+/g, " "),
      html: renderMerakiEmail({ locale: language, siteUrl: siteOrigin(), title: t.title, preheader: `${t.number}: ${order.numero_ordine}`,
        bodyHtml: `<p style="margin:0 0 20px;">${html(t.body)}</p><p style="margin:0 0 18px;"><strong>${html(t.number)}:</strong> ${html(order.numero_ordine)}</p>${orderItemsHtml(items)}${totals.map(([label, value], index) => `<p style="margin:16px 0 0;text-align:right;${index === totals.length - 1 ? "font-size:18px;font-weight:700;" : "font-size:14px;"}">${html(label)}: <strong>${html(value)}</strong></p>`).join("")}<div style="margin:24px 0;padding:20px;border:1px solid #e3e5dd;border-radius:16px;background:#fffefa;"><h2 style="font-size:18px;margin:0 0 12px;">${html(t.address)}</h2><p style="margin:0;">${multiline(address)}</p></div><p style="margin:0;">${html(t.help)}</p>`, cta: { label: t.contact, url }, footerHtml: html(t.footer) }),
      text: `${t.title}\n${t.body}\n\n${t.number}: ${order.numero_ordine}\n\n${items.map(itemText).join("\n")}\n\n${totals.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${t.address}\n${address}\n\n${t.contact}: ${url}\n\n${t.footer}`,
    };
  });
}
export async function sendOrderNotification(order: ShopOrderEmail, items: ShopItemEmail[]) {
  return sendServiceEmail(adminEmail => {
    const title = "Nuovo ordine shop ricevuto";
    const name = [order.buyer_nome, order.buyer_cognome].filter(Boolean).join(" ");
    const url = `${siteOrigin()}/it/admin/ordini`;
    return { to: adminEmail, subject: `Nuovo ordine shop: ${order.numero_ordine}`.replace(/[\r\n]+/g, " "),
      html: renderMerakiEmail({ locale: "it", siteUrl: siteOrigin(), title, preheader: `Ordine ${order.numero_ordine} · ${eur(order.total_cents)}`,
        bodyHtml: `<p style="margin:0 0 18px;">È stato pagato l’ordine <strong>${html(order.numero_ordine)}</strong>.</p><p style="margin:0 0 18px;"><strong>Cliente:</strong> ${html(name)}<br/><strong>Email:</strong> ${html(order.buyer_email)}</p>${orderItemsHtml(items)}<p style="margin:20px 0 0;font-size:18px;"><strong>Totale pagato: ${html(eur(order.total_cents))}</strong></p>`, cta: { label: "Gestisci ordini", url }, footerHtml: "Notifica di servizio per l’amministrazione Meraki Experience." }),
      text: `${title}\nOrdine: ${order.numero_ordine}\nCliente: ${name}\nEmail: ${order.buyer_email}\n\n${items.map(itemText).join("\n")}\n\nTotale pagato: ${eur(order.total_cents)}\n\nGestisci ordini: ${url}`,
    };
  }, "amministrazione.meraki@gmail.com");
}

type TicketEmail = Pick<Database["public"]["Tables"]["tickets"]["Row"], "id" | "qr_code" | "buyer_email" | "buyer_nome" | "buyer_cognome">;
type TicketEventEmail = Pick<Database["public"]["Tables"]["events"]["Row"], "titolo" | "data_inizio" | "location" | "indirizzo"> & { copertina_url?: string | null; check_in_starts_at?: string | null; slug?: string; tipo?: string; logistics?: unknown; attivo?: boolean | null };
type TicketEmailAccess = ActivityTiming & { name: string; menuChoice?: string | null };

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
        event: "La tua esperienza", participant: "Partecipante", date: "Data", time: "Inizio evento", checkInOpens: "Apertura check-in", timezone: "ora italiana", place: "Luogo", package: "Formula", includes: "Il tuo biglietto include", menu: "Menu scelto",
        qr: "Il tuo QR personale", qrHint: "Mostralo allo staff all’ingresso, direttamente dal telefono.", instruction: "Questo biglietto consente un solo ingresso.", activities: "Usa lo stesso QR per le attività incluse. Ogni attività ha un ingresso separato.",
        open: "Apri e salva il biglietto", attachment: "Trovi lo stesso QR anche nell’allegato biglietto-meraki.png.", how: "Come usarlo", stepOne: "Apri e salva", stepOneBody: "Apri il biglietto dal pulsante qui sopra e salvalo sul telefono.", stepTwo: "Mostra il QR all’ingresso", stepTwoBody: "Tieni il codice ben visibile: lo staff lo leggerà per confermare il tuo accesso.",
        guest: "Non serve creare un account. Conserva questa email: puoi riaprire il biglietto dal pulsante quando vuoi.", help: "Hai bisogno di una mano?", contact: "Contattaci", reference: "Riferimento biglietto", footer: "Email di servizio relativa al tuo acquisto. L’invio del biglietto è indipendente dalla scelta sulle comunicazioni promozionali.",
      },
      en: {
        subject: "Your Meraki ticket", heading: "Your ticket is ready", intro: "Your next Meraki moment awaits. Here are all the details for your visit.",
        event: "Your experience", participant: "Participant", date: "Date", time: "Event starts", checkInOpens: "Check-in opens", timezone: "Italian time", place: "Venue", package: "Package", includes: "Your ticket includes", menu: "Selected menu",
        qr: "Your personal QR code", qrHint: "Show it to the staff at the entrance, straight from your phone.", instruction: "This ticket allows one admission.", activities: "Use the same QR for the included activities. Each activity has its own admission.",
        open: "Open and save your ticket", attachment: "The same QR is also attached as biglietto-meraki.png.", how: "How to use it", stepOne: "Open and save", stepOneBody: "Open your ticket using the button above and save it on your phone.", stepTwo: "Show your QR at the entrance", stepTwoBody: "Keep the code clearly visible: the staff will scan it to confirm your admission.",
        guest: "No account is needed. Keep this email: you can reopen your ticket using the button at any time.", help: "Need a hand?", contact: "Contact us", reference: "Ticket reference", footer: "Service email about your purchase. Ticket delivery is independent of your choice about promotional messages.",
      },
      de: {
        subject: "Dein Meraki-Ticket", heading: "Dein Ticket ist bereit", intro: "Dein nächster Meraki-Moment wartet auf dich. Hier findest du alle Details für deine Teilnahme.",
        event: "Dein Erlebnis", participant: "Teilnehmende Person", date: "Datum", time: "Beginn", checkInOpens: "Check-in öffnet", timezone: "italienische Zeit", place: "Ort", package: "Paket", includes: "In deinem Ticket enthalten", menu: "Gewähltes Menü",
        qr: "Dein persönlicher QR-Code", qrHint: "Zeige ihn dem Team am Eingang direkt auf deinem Handy.", instruction: "Dieses Ticket erlaubt einen einmaligen Eintritt.", activities: "Nutze denselben QR-Code für die enthaltenen Aktivitäten. Jede Aktivität hat einen eigenen Eintritt.",
        open: "Ticket öffnen und speichern", attachment: "Derselbe QR-Code ist auch als biglietto-meraki.png angehängt.", how: "So funktioniert es", stepOne: "Öffnen und speichern", stepOneBody: "Öffne dein Ticket über den Button oben und speichere es auf deinem Handy.", stepTwo: "QR-Code am Eingang zeigen", stepTwoBody: "Halte den Code gut sichtbar bereit: Das Team scannt ihn, um deinen Eintritt zu bestätigen.",
        guest: "Du brauchst kein Konto. Bewahre diese E-Mail auf: Über den Button kannst du dein Ticket jederzeit wieder öffnen.", help: "Brauchst du Hilfe?", contact: "Kontaktiere uns", reference: "Ticketreferenz", footer: "Service-E-Mail zu deinem Kauf. Die Ticketzustellung ist unabhängig von deiner Wahl zu Werbemitteilungen.",
      },
      es: {
        subject: "Tu entrada Meraki", heading: "Tu entrada está lista", intro: "Tu próximo momento Meraki te espera. Aquí tienes todos los detalles para participar.",
        event: "Tu experiencia", participant: "Participante", date: "Fecha", time: "Inicio del evento", checkInOpens: "Apertura del check-in", timezone: "hora de Italia", place: "Lugar", package: "Paquete", includes: "Tu entrada incluye", menu: "Menú elegido",
        qr: "Tu código QR personal", qrHint: "Muéstralo al equipo en la entrada, directamente desde tu teléfono.", instruction: "Esta entrada permite un solo acceso.", activities: "Usa el mismo QR para las actividades incluidas. Cada actividad tiene su propio acceso.",
        open: "Abrir y guardar la entrada", attachment: "El mismo QR también está adjunto como biglietto-meraki.png.", how: "Cómo usarla", stepOne: "Abrir y guardar", stepOneBody: "Abre tu entrada con el botón de arriba y guárdala en tu teléfono.", stepTwo: "Mostrar el QR en la entrada", stepTwoBody: "Mantén el código bien visible: el equipo lo escaneará para confirmar tu acceso.",
        guest: "No necesitas crear una cuenta. Guarda este email: puedes volver a abrir tu entrada con el botón cuando quieras.", help: "¿Necesitas ayuda?", contact: "Contáctanos", reference: "Referencia de la entrada", footer: "Email de servicio sobre tu compra. El envío de la entrada es independiente de tu elección sobre las comunicaciones promocionales.",
      },
    }[language];
    const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org").origin;
    const url = `${siteUrl}/${language}/biglietto/${ticket.id}?token=${encodeURIComponent(ticket.qr_code)}`;
    const contactUrl = `${siteUrl}/${language}/contatti`;
    const travelPath = eventTravelPath(eventData, language);
    const travelUrl = travelPath ? `${siteUrl}${travelPath}` : null;
    const travelCopy = eventTravelCopy[language];
    const travelHtml = travelUrl ? `<div style="margin-top:24px;padding:20px;border:1px solid #e0e2d8;border-radius:16px;background:#f5f4f0;"><h2 style="margin:0 0 8px;color:#18251f;font-size:18px;line-height:1.4;">${escapeHtml(travelCopy.heading)}</h2><p style="margin:0 0 14px;color:#626d63;font-size:14px;line-height:1.6;">${escapeHtml(travelCopy.body)}</p><a href="${escapeHtml(travelUrl)}" style="display:inline-block;padding:12px 18px;border:1px solid #b5a07c;border-radius:12px;color:#263a2c;font-size:14px;font-weight:650;text-decoration:none;">${escapeHtml(travelCopy.action)}</a></div>` : "";
    const title = getLocalizedText(eventData.titolo, language);
    const participantName = [ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ");
    const eventDate = new Date(eventData.data_inizio);
    const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "full", timeZone: "Europe/Rome" }).format(eventDate);
    const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(eventDate);
    const checkInDate = eventData.check_in_starts_at ? new Date(eventData.check_in_starts_at) : null;
    const checkInOpening = checkInDate && Number.isFinite(checkInDate.getTime()) ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(checkInDate) : null;
    const venue = [eventData.location, eventData.indirizzo].filter(Boolean).join(", ");
    const packageName = options?.packageName?.trim();
    const purchasedAccesses: TicketEmailAccess[] = options?.accessDetails?.length ? options.accessDetails : (options?.accessNames || []).map(name => ({ name }));
    const accessDetails = purchasedAccesses.filter(access => access.name.trim()).map(access => ({ ...normalizedActivityTiming(access), name: access.name.trim(), menuChoice: access.menuChoice?.trim() }));
    const individualSchedule = accessDetails.some(hasActivityTiming);
    const timingCopy = activityTimingCopy(language);
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
    const includedHtml = accessDetails.length ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e0e2d8;"><p style="${labelStyle}">${escapeHtml(copy.includes)}</p><ul style="margin:10px 0 0;padding-left:20px;color:#18251f;font-size:15px;line-height:1.7;">${accessDetails.map(access => {
      const rows = activityTimingRows(access, language);
      const schedule = rows.map(row => `<p style="margin:4px 0 0;color:#263a2c;font-size:13px;line-height:1.6;"><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</p>`).join("");
      return `<li style="margin:0 0 15px;padding-left:2px;"><strong>${escapeHtml(access.name)}</strong>${access.menuChoice ? `<br/><span style="color:#626d63;font-size:13px;">${escapeHtml(copy.menu)}: ${escapeHtml(access.menuChoice)}</span>` : ""}${schedule}${rows.length ? `<p style="margin:4px 0 0;color:#73806f;font-size:11px;line-height:1.5;">${escapeHtml(timingCopy.timezone)}</p>` : ""}</li>`;
    }).join("")}</ul></div>` : "";
    const generalScheduleHtml = individualSchedule
      ? `<div style="margin-bottom:20px;">${information(copy.date, date)}</div>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="62%" valign="top" style="padding:0 14px 20px 0;">${information(copy.date, date)}</td><td width="38%" valign="top" style="padding:0 0 20px;">${information(copy.time, time)}<p style="margin:3px 0 0;color:#73806f;font-size:11px;line-height:1.5;">${escapeHtml(copy.timezone)}</p></td></tr></table>${checkInOpening ? `<div style="margin-bottom:20px;padding:14px 16px;background:#eee9df;border-radius:12px;">${information(copy.checkInOpens, checkInOpening)}</div>` : ""}`;
    const afterCtaHtml = `<div style="margin-top:26px;padding-top:24px;border-top:1px solid #e4e6dc;"><h2 style="margin:0 0 18px;color:#18251f;font-size:19px;line-height:1.35;">${escapeHtml(copy.how)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${[["1", copy.stepOne, copy.stepOneBody], ["2", copy.stepTwo, copy.stepTwoBody]].map(([number, heading, body]) => `<tr><td width="34" valign="top" style="padding:0 10px 18px 0;"><span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#eee9df;color:#826435;text-align:center;font-size:13px;font-weight:700;line-height:26px;">${number}</span></td><td valign="top" style="padding:0 0 18px;"><p style="margin:0 0 4px;color:#18251f;font-size:15px;line-height:1.5;font-weight:650;">${escapeHtml(heading)}</p><p style="margin:0;color:#626d63;font-size:14px;line-height:1.6;">${escapeHtml(body)}</p></td></tr>`).join("")}</table><p style="margin:2px 0 18px;color:#626d63;font-size:13px;line-height:1.65;">${escapeHtml(copy.guest)}</p><p style="margin:0;color:#626d63;font-size:13px;line-height:1.65;">${escapeHtml(copy.help)} <a href="${escapeHtml(contactUrl)}" style="color:#826435;text-decoration:underline;font-weight:650;">${escapeHtml(copy.contact)}</a></p></div>`;
    const htmlContent = renderMerakiEmail({ locale: language, siteUrl, title: copy.heading, preheader: `${copy.subject} · ${title}`,
      bodyHtml: `<p style="margin:0 0 22px;color:#626d63;font-size:15px;line-height:1.65;">${escapeHtml(copy.intro)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e4db;border-radius:20px;background:#f5f4f0;overflow:hidden;">${coverUrl ? `<tr><td align="center" style="padding:18px 18px 0;"><img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title)}" width="320" style="display:block;width:100%;max-width:320px;height:auto;margin:0 auto;border-radius:12px;"/></td></tr>` : ""}<tr><td style="padding:22px;"><p style="margin:0 0 9px;color:#826435;font-size:10px;font-weight:700;line-height:1.5;letter-spacing:1.8px;text-transform:uppercase;">${escapeHtml(copy.event)}</p><h2 style="margin:0 0 24px;color:#18251f;font-size:26px;line-height:1.22;font-weight:750;letter-spacing:-.6px;overflow-wrap:anywhere;">${escapeHtml(title)}</h2>${participantName ? `<div style="margin-bottom:20px;">${information(copy.participant, participantName)}</div>` : ""}${generalScheduleHtml}${venue ? `<div style="margin-bottom:${packageName ? "20px" : "0"};">${information(copy.place, venue)}</div>` : ""}${packageName ? information(copy.package, packageName) : ""}${includedHtml}</td></tr></table><div style="padding:27px 0 0;text-align:center;"><h2 style="margin:0 0 8px;color:#18251f;font-size:19px;line-height:1.35;">${escapeHtml(copy.qr)}</h2><p style="margin:0 0 14px;color:#626d63;font-size:13px;line-height:1.6;">${escapeHtml(copy.qrHint)}</p><img src="cid:meraki-ticket" width="256" height="256" alt="QR" style="display:block;width:256px;max-width:100%;height:auto;margin:0 auto;background:#fff;border:1px solid #e4e6dc;border-radius:14px;"/><p style="margin:16px 0 0;color:#626d63;font-size:13px;line-height:1.6;">${escapeHtml(accessCopy)}</p><p style="margin:9px 0 0;color:#73806f;font-size:12px;line-height:1.6;">${escapeHtml(copy.attachment)}</p></div>`,
      cta: { label: copy.open, url }, ctaAtTop: true, afterCtaHtml: travelHtml + afterCtaHtml,
      footerHtml: `${escapeHtml(copy.footer)}<br/><span style="font-size:11px;">${escapeHtml(copy.reference)}: ${escapeHtml(ticket.id)}</span>${marketing.html}`,
    });
    const accessText = accessDetails.map(access => {
      const rows = activityTimingRows(access, language);
      return `• ${access.name}${access.menuChoice ? ` — ${copy.menu}: ${access.menuChoice}` : ""}${rows.length ? `\n${rows.map(row => `  ${row.label}: ${row.value}`).join("\n")}\n  ${timingCopy.timezone}` : ""}`;
    }).join("\n");
    const text = `${copy.heading}\n${copy.intro}\n\n${title}\n${participantName ? `${copy.participant}: ${participantName}\n` : ""}${copy.date}: ${date}\n${!individualSchedule ? `${copy.time}: ${time} (${copy.timezone})\n${checkInOpening ? `${copy.checkInOpens}: ${checkInOpening} (${copy.timezone})\n` : ""}` : ""}${venue ? `${copy.place}: ${venue}\n` : ""}${packageName ? `${copy.package}: ${packageName}\n` : ""}${accessText ? `\n${copy.includes}\n${accessText}\n` : ""}\n${copy.qr}\n${accessCopy}\n${copy.attachment}\n\n${copy.open}: ${url}\n${travelUrl ? `\n${travelCopy.heading}\n${travelCopy.action}: ${travelUrl}\n` : ""}\n${copy.how}\n1. ${copy.stepOne}: ${copy.stepOneBody}\n2. ${copy.stepTwo}: ${copy.stepTwoBody}\n\n${copy.guest}\n${copy.help} ${copy.contact}: ${contactUrl}\n\n${copy.footer}\n${copy.reference}: ${ticket.id}${marketing.text}`;
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
