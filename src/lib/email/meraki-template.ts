export type EmailLocale = "it" | "en" | "de" | "es";

export function emailLocale(locale: string): EmailLocale {
  return locale === "en" || locale === "de" || locale === "es" ? locale : "it";
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** HTML content blocks must already be escaped by their caller. */
export function renderMerakiEmail({ locale, title, preheader, bodyHtml, cta, ctaAtTop = false, afterCtaHtml, footerHtml, siteUrl }: {
  locale: EmailLocale; title: string; preheader: string; bodyHtml: string;
  cta?: { label: string; url: string }; ctaAtTop?: boolean; afterCtaHtml?: string; footerHtml?: string; siteUrl?: string;
}) {
  const escape = escapeEmailHtml;
  let origin = "https://www.merakiexperience.org";
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") origin = parsed.origin;
    } catch { /* Keep the public Meraki origin for malformed optional settings. */ }
  }
  const logoUrl = `${origin}/images/logo-meraki-email.png`;
  const eventsUrl = `${origin}/${locale}/eventi`;
  const primaryCtaHtml = cta ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;margin-top:22px;border-spacing:0;"><tr><td align="center" bgcolor="#18251f" style="background:#18251f;border-radius:16px;mso-padding-alt:16px 16px;"><a href="${escape(cta.url)}" style="display:block;padding:16px;color:#ffffff;text-align:center;text-decoration:none;font-size:15px;line-height:22px;font-weight:700;border-radius:16px;overflow-wrap:anywhere;">${escape(cta.label)}</a></td></tr></table>` : "";
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;width:100%;background:#f5f4f0;color:#18251f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none!important;visibility:hidden;mso-hide:all;max-height:0;max-width:0;overflow:hidden;font-size:1px;line-height:1px;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4f0" style="width:100%;background:#f5f4f0;border-collapse:collapse;"><tr><td align="center" style="padding:24px 10px 32px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="meraki-email-shell" style="width:100%;max-width:600px;table-layout:fixed;background:#f5f4f0;border:1px solid #e3e5dd;border-radius:28px;border-spacing:0;overflow:hidden;">
<tr><td align="center" bgcolor="#ffffff" style="padding:28px 24px 25px;background:#ffffff;border-radius:27px 27px 0 0;border-bottom:1px solid #e3e5dd;">
<a href="${escape(eventsUrl)}" style="display:inline-block;max-width:100%;text-decoration:none;"><img src="${escape(logoUrl)}" width="220" height="58" alt="Meraki Experience" style="display:block;width:220px;max-width:100%;height:auto;border:0;color:#18251f;font-size:18px;line-height:58px;" /></a>
</td></tr>
<tr><td class="meraki-email-main" style="padding:24px 20px 28px;font-size:15px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#18251f" style="width:100%;table-layout:fixed;background:#18251f;border-radius:22px;border-spacing:0;">
<tr><td style="padding:25px 22px 26px;">
<p style="margin:0 0 12px;color:#c2a36b;font-size:10px;line-height:16px;font-weight:700;letter-spacing:2.2px;">MERAKI EXPERIENCE</p>
<h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.18;font-weight:650;letter-spacing:-.8px;">${escape(title)}</h1>
</td></tr></table>
${ctaAtTop ? primaryCtaHtml : ""}
<div style="padding-top:22px;">${bodyHtml}</div>
${primaryCtaHtml}
${afterCtaHtml ? `<div style="padding-top:22px;">${afterCtaHtml}</div>` : ""}
</td></tr>
<tr><td bgcolor="#fffefa" style="padding:23px 22px 25px;background:#fffefa;border-radius:0 0 27px 27px;border-top:1px solid #e3e5dd;font-size:12px;line-height:1.7;color:#626d63;overflow-wrap:anywhere;word-break:break-word;">${footerHtml || "Meraki Experience"}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
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
