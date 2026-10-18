export type EmailLocale = "it" | "en" | "de" | "es";

export function emailLocale(locale: string): EmailLocale {
  return locale === "en" || locale === "de" || locale === "es" ? locale : "it";
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** All content interpolated into bodyHtml must already be escaped. */
export function renderMerakiEmail({ locale, title, preheader, bodyHtml, cta, footerHtml }: {
  locale: EmailLocale; title: string; preheader: string; bodyHtml: string;
  cta?: { label: string; url: string }; footerHtml?: string;
}) {
  const escape = escapeEmailHtml;
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f4f0;color:#18251f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border:1px solid #e4e6dc;border-radius:24px;overflow:hidden;">
<tr><td style="padding:28px 24px;border-bottom:1px solid #e4e6dc;"><p style="margin:0;font-size:30px;line-height:1.1;font-weight:750;letter-spacing:-1.5px;color:#18251f;">meraki<span style="color:#c2a36b;">.</span></p></td></tr>
<tr><td style="padding:28px 24px;font-size:15px;line-height:1.65;"><h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;letter-spacing:-.6px;">${escape(title)}</h1>${bodyHtml}
${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;"><tr><td style="border-radius:14px;background:#18251f;"><a href="${escape(cta.url)}" style="display:inline-block;padding:15px 22px;color:#fff;text-decoration:none;font-size:15px;font-weight:650;border-radius:14px;">${escape(cta.label)}</a></td></tr></table>` : ""}
</td></tr><tr><td style="padding:22px 24px;background:#fbfbf8;border-top:1px solid #e4e6dc;font-size:12px;line-height:1.65;color:#626d63;">${footerHtml || "Meraki Experience"}</td></tr></table>
</td></tr></table></body></html>`;
}

export const marketingEmailCopy = {
  it: { title: "Le novità Meraki, solo se le vuoi", body: "Hai richiesto di ricevere via email novità, eventi e offerte di Meraki Experience. Conferma la tua scelta: il tuo indirizzo entrerà nella lista per queste comunicazioni soltanto dopo la conferma.", confirm: "Conferma le comunicazioni Meraki", ignore: "Se non hai richiesto queste comunicazioni, ignora questa sezione. Il biglietto e l’acquisto rimangono validi.", unsubscribe: "Gestisci o revoca il consenso", expiry: "Il link di conferma è valido per 30 giorni. Puoi revocare il consenso in qualsiasi momento." },
  en: { title: "Meraki news, only if you want it", body: "You requested email news, events and offers from Meraki Experience. Confirm your choice: your address will join the mailing list only after confirmation.", confirm: "Confirm Meraki updates", ignore: "If you did not request these messages, ignore this section. Your ticket and purchase remain valid.", unsubscribe: "Manage or withdraw consent", expiry: "The confirmation link is valid for 30 days. You can withdraw consent at any time." },
  de: { title: "Meraki-Neuigkeiten, wenn du sie möchtest", body: "Du hast Neuigkeiten, Events und Angebote von Meraki Experience per E-Mail angefragt. Bestätige deine Wahl: Erst nach deiner Bestätigung wird deine Adresse in den Verteiler aufgenommen.", confirm: "Meraki-Mitteilungen bestätigen", ignore: "Falls du diese Mitteilungen nicht angefragt hast, ignoriere diesen Abschnitt. Dein Ticket und dein Kauf bleiben gültig.", unsubscribe: "Einwilligung verwalten oder widerrufen", expiry: "Der Bestätigungslink ist 30 Tage gültig. Du kannst deine Einwilligung jederzeit widerrufen." },
  es: { title: "Novedades Meraki, solo si las quieres", body: "Has solicitado recibir por email novedades, eventos y ofertas de Meraki Experience. Confirma tu elección: tu dirección entrará en la lista únicamente después de la confirmación.", confirm: "Confirmar comunicaciones Meraki", ignore: "Si no has solicitado estas comunicaciones, ignora esta sección. Tu entrada y tu compra siguen siendo válidas.", unsubscribe: "Gestionar o retirar el consentimiento", expiry: "El enlace de confirmación es válido durante 30 días. Puedes retirar tu consentimiento en cualquier momento." },
};

export function marketingEmailSection(locale: EmailLocale, links?: { confirmUrl?: string; unsubscribeUrl: string }) {
  if (!links) return { html: "", text: "" };
  const t = marketingEmailCopy[locale];
  const escape = escapeEmailHtml;
  return {
    html: `<div style="margin-top:28px;padding-top:22px;border-top:1px solid #e4e6dc;"><h2 style="margin:0 0 12px;font-size:18px;">${escape(t.title)}</h2>${links.confirmUrl ? `<p style="font-size:14px;">${escape(t.body)}</p><p><a href="${escape(links.confirmUrl)}" style="display:inline-block;padding:14px 18px;border-radius:12px;background:#18251f;color:#fff;font-size:14px;line-height:1.5;text-decoration:none;font-weight:650;">${escape(t.confirm)}</a></p><p style="font-size:13px;color:#626d63;">${escape(t.ignore)} ${escape(t.expiry)}</p>` : ""}<p><a href="${escape(links.unsubscribeUrl)}" style="display:inline-block;padding:12px 0;color:#626d63;">${escape(t.unsubscribe)}</a></p></div>`,
    text: `\n\n${t.title}\n${links.confirmUrl ? `${t.body}\n${t.confirm}: ${links.confirmUrl}\n${t.ignore}\n${t.expiry}\n` : ""}${t.unsubscribe}: ${links.unsubscribeUrl}`,
  };
}
