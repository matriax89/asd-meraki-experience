import { emailLocale, escapeEmailHtml, renderMerakiEmail } from "./meraki-template";

type NoticeBase = {
  to: string;
  locale?: string;
  deliveryId: string;
  eventTitle: string;
  reason?: string | null;
};

export type MerakiRefundConfirmation = NoticeBase & {
  /** Only a confirmed Stripe refund can produce a confirmation email. */
  status: "succeeded";
  amountCents: number;
  refundReference: string;
  /** True once the entire payment has been refunded, including earlier refunds. */
  fullRefund: boolean;
  revokedAccessNames?: string[];
  remainingAccessNames?: string[];
  allAccessRevoked?: boolean;
  eventCanceled?: boolean;
};

export type MerakiCancellationNotice = NoticeBase & {
  /** A separate confirmation will follow only after each refund succeeds. */
  refundExpected: boolean;
};

const copy = {
  it: {
    fullTitle: "Rimborso totale confermato", partialTitle: "Rimborso parziale confermato", event: "Evento",
    refundIntro: "Il rimborso indicato qui sotto è stato confermato. L’accredito avverrà sullo stesso metodo usato per il pagamento; i tempi dipendono dalla banca o dal gestore del metodo di pagamento.",
    amount: "Importo di questo rimborso", reference: "Riferimento rimborso", reason: "Motivo", revoked: "Accessi revocati", remaining: "Accessi ancora presenti sul biglietto",
    allRevoked: "Gli accessi relativi a questo rimborso sono stati revocati e non possono essere utilizzati per il check-in.",
    unchanged: "Questo rimborso non modifica gli accessi del biglietto.",
    canceledTitle: "Evento annullato", canceledIntro: "Ci dispiace: questo evento è stato annullato. I relativi biglietti non consentono più l’ingresso.",
    refundPending: "Il rimborso del saldo da restituire è in lavorazione. Riceverai un’email separata con l’importo quando sarà confermato. Non è necessario inviare una richiesta.",
    noRefundExpected: "Per eventuali chiarimenti sul tuo acquisto, contatta il team Meraki.",
    eventCanceled: "L’evento è stato annullato: nessun biglietto dell’evento è utilizzabile per il check-in.",
    contact: "Contatta Meraki", footer: "Comunicazione di servizio sul tuo acquisto. La ricevi anche senza consenso alle promozioni.",
  },
  en: {
    fullTitle: "Full refund confirmed", partialTitle: "Partial refund confirmed", event: "Event",
    refundIntro: "The refund shown below has been confirmed. The funds will be returned to the original payment method; processing time depends on your bank or payment provider.",
    amount: "Amount of this refund", reference: "Refund reference", reason: "Reason", revoked: "Revoked admissions", remaining: "Admissions still on your ticket",
    allRevoked: "The admissions covered by this refund have been revoked and cannot be used for check-in.",
    unchanged: "This refund does not change the admissions on your ticket.",
    canceledTitle: "Event canceled", canceledIntro: "We are sorry: this event has been canceled. Tickets for this event can no longer be used for entry.",
    refundPending: "The remaining refundable balance is being processed. You will receive a separate email with the amount once the refund is confirmed. You do not need to submit a request.",
    noRefundExpected: "If you have any questions about your purchase, please contact the Meraki team.",
    eventCanceled: "The event has been canceled: no ticket for this event can be used for check-in.",
    contact: "Contact Meraki", footer: "Service email about your purchase. You receive it regardless of promotional consent.",
  },
  de: {
    fullTitle: "Vollständige Erstattung bestätigt", partialTitle: "Teilerstattung bestätigt", event: "Veranstaltung",
    refundIntro: "Die unten angegebene Erstattung wurde bestätigt. Der Betrag wird auf das ursprüngliche Zahlungsmittel zurückgebucht; die Bearbeitungszeit hängt von deiner Bank oder deinem Zahlungsanbieter ab.",
    amount: "Betrag dieser Erstattung", reference: "Erstattungsreferenz", reason: "Grund", revoked: "Widerrufene Zutrittsberechtigungen", remaining: "Weiterhin auf deinem Ticket enthaltene Zutritte",
    allRevoked: "Die von dieser Erstattung betroffenen Zutrittsberechtigungen wurden widerrufen und können nicht mehr für den Check-in verwendet werden.",
    unchanged: "Diese Erstattung ändert die Zutrittsberechtigungen deines Tickets nicht.",
    canceledTitle: "Veranstaltung abgesagt", canceledIntro: "Es tut uns leid: Diese Veranstaltung wurde abgesagt. Die zugehörigen Tickets können nicht mehr für den Einlass verwendet werden.",
    refundPending: "Die Erstattung des verbleibenden erstattungsfähigen Betrags wird bearbeitet. Sobald sie bestätigt ist, erhältst du eine separate E-Mail mit dem Betrag. Du musst keinen Antrag stellen.",
    noRefundExpected: "Bei Fragen zu deinem Kauf wende dich bitte an das Meraki-Team.",
    eventCanceled: "Die Veranstaltung wurde abgesagt: Kein Ticket dieser Veranstaltung kann für den Check-in verwendet werden.",
    contact: "Meraki kontaktieren", footer: "Service-E-Mail zu deinem Kauf. Du erhältst sie unabhängig von deiner Einwilligung in Werbemitteilungen.",
  },
  es: {
    fullTitle: "Reembolso total confirmado", partialTitle: "Reembolso parcial confirmado", event: "Evento",
    refundIntro: "Se ha confirmado el reembolso indicado a continuación. El importe se devolverá al mismo método de pago utilizado en la compra; los plazos dependen de tu banco o proveedor de pagos.",
    amount: "Importe de este reembolso", reference: "Referencia del reembolso", reason: "Motivo", revoked: "Accesos anulados", remaining: "Accesos que siguen incluidos en tu entrada",
    allRevoked: "Los accesos correspondientes a este reembolso han sido anulados y ya no pueden utilizarse para el check-in.",
    unchanged: "Este reembolso no modifica los accesos de tu entrada.",
    canceledTitle: "Evento cancelado", canceledIntro: "Lo sentimos: este evento ha sido cancelado. Sus entradas ya no permiten el acceso.",
    refundPending: "Se está tramitando el reembolso del saldo pendiente de devolver. Recibirás un correo por separado con el importe cuando se confirme. No necesitas enviar una solicitud.",
    noRefundExpected: "Si tienes alguna duda sobre tu compra, contacta con el equipo Meraki.",
    eventCanceled: "El evento ha sido cancelado: ninguna entrada de este evento puede utilizarse para el check-in.",
    contact: "Contactar con Meraki", footer: "Correo de servicio sobre tu compra. Lo recibes aunque no hayas aceptado las promociones.",
  },
};

function origin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org");
    if (["https:", "http:"].includes(url.protocol)) return url.origin;
  } catch { /* Optional malformed settings must not break a service email. */ }
  return "https://www.merakiexperience.org";
}
const escape = escapeEmailHtml;
const paragraph = (value: string) => `<p style="margin:0 0 18px;">${escape(value)}</p>`;
const detail = (label: string, value: string) => `<p style="margin:0 0 14px;"><strong>${escape(label)}:</strong><br/>${escape(value).replace(/\r?\n/g, "<br/>")}</p>`;
function list(label: string, values: string[]) {
  return `<h2 style="margin:24px 0 10px;font-size:17px;line-height:1.4;">${escape(label)}</h2><ul style="padding-left:20px;margin:0 0 20px;">${values.map(value => `<li style="margin:0 0 6px;">${escape(value)}</li>`).join("")}</ul>`;
}
function validateBase(input: NoticeBase) {
  if (!/^[a-zA-Z0-9._:-]{1,145}$/.test(input.deliveryId) || !input.eventTitle.trim() || input.eventTitle.length > 1000 || (input.reason?.length || 0) > 2000) throw new Error("Invalid service email details.");
}

export function renderMerakiRefundConfirmation(input: MerakiRefundConfirmation) {
  validateBase(input);
  if (input.status !== "succeeded" || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || !/^re_[a-zA-Z0-9]+$/.test(input.refundReference)) throw new Error("A confirmed Stripe refund is required.");
  const locale = emailLocale(input.locale || "it"); const t = copy[locale];
  const title = input.fullRefund ? t.fullTitle : t.partialTitle;
  // The financial values follow the same Italian number format as the checkout.
  const amount = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(input.amountCents / 100);
  const revoked = input.revokedAccessNames || []; const remaining = input.remainingAccessNames || [];
  const accessText = input.eventCanceled ? t.eventCanceled : input.allAccessRevoked ? t.allRevoked : !revoked.length ? t.unchanged : "";
  const contactUrl = `${origin()}/${locale}/contatti`;
  return {
    to: input.to, deliveryId: `refund-${input.deliveryId}`,
    subject: `${title} · ${input.eventTitle}`.replace(/[\r\n]+/g, " ").slice(0, 240),
    html: renderMerakiEmail({ locale, siteUrl: origin(), title, preheader: `${t.amount}: ${amount} · ${input.eventTitle}`,
      bodyHtml: paragraph(t.refundIntro) + `<div style="padding:22px;border:1px solid #e3e5dd;border-radius:18px;background:#fffefa;">${detail(t.event, input.eventTitle)}<p style="margin:18px 0 4px;color:#626d63;">${escape(t.amount)}</p><p style="font-size:30px;font-weight:700;margin:0 0 18px;color:#18251f;">${escape(amount)}</p>${detail(t.reference, input.refundReference)}${input.reason ? detail(t.reason, input.reason) : ""}</div>`
        + (accessText ? `<div style="margin-top:22px;">${paragraph(accessText)}</div>` : "")
        + (!input.eventCanceled && revoked.length ? list(t.revoked, revoked) : "")
        + (!input.eventCanceled && remaining.length ? list(t.remaining, remaining) : ""),
      cta: { label: t.contact, url: contactUrl }, footerHtml: escape(t.footer),
    }),
    text: [title, t.refundIntro, `${t.event}: ${input.eventTitle}`, `${t.amount}: ${amount}`, `${t.reference}: ${input.refundReference}`, input.reason ? `${t.reason}: ${input.reason}` : "", accessText,
      !input.eventCanceled && revoked.length ? `${t.revoked}\n${revoked.map(name => `• ${name}`).join("\n")}` : "",
      !input.eventCanceled && remaining.length ? `${t.remaining}\n${remaining.map(name => `• ${name}`).join("\n")}` : "",
      `${t.contact}: ${contactUrl}`, t.footer].filter(Boolean).join("\n\n"),
  };
}

export function renderMerakiCancellationNotice(input: MerakiCancellationNotice) {
  validateBase(input);
  const locale = emailLocale(input.locale || "it"); const t = copy[locale];
  const refundText = input.refundExpected ? t.refundPending : t.noRefundExpected;
  const contactUrl = `${origin()}/${locale}/contatti`;
  return {
    to: input.to, deliveryId: `cancel-${input.deliveryId}`,
    subject: `${t.canceledTitle} · ${input.eventTitle}`.replace(/[\r\n]+/g, " ").slice(0, 240),
    html: renderMerakiEmail({ locale, siteUrl: origin(), title: t.canceledTitle, preheader: `${t.canceledTitle} · ${input.eventTitle}`,
      bodyHtml: paragraph(t.canceledIntro) + `<div style="padding:22px;border:1px solid #e3e5dd;border-radius:18px;background:#fffefa;">${detail(t.event, input.eventTitle)}${input.reason ? detail(t.reason, input.reason) : ""}</div><div style="margin-top:22px;">${paragraph(refundText)}</div>`,
      cta: { label: t.contact, url: contactUrl }, footerHtml: escape(t.footer),
    }),
    text: [t.canceledTitle, t.canceledIntro, `${t.event}: ${input.eventTitle}`, input.reason ? `${t.reason}: ${input.reason}` : "", refundText, `${t.contact}: ${contactUrl}`, t.footer].filter(Boolean).join("\n\n"),
  };
}
