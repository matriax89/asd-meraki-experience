import type { Metadata } from "next";
import { getLocalizedText } from "@/lib/i18n-utils";
import { richTextPlainText } from "@/lib/rich-text";

export const MERAKI_SITE_ORIGIN = "https://www.merakiexperience.org";
export const SOCIAL_LOCALES = ["it", "en", "de", "es"] as const;
const ogLocales = { it: "it_IT", en: "en_GB", de: "de_DE", es: "es_ES" };
export type SocialEvent = {
  id: string; slug: string; tipo: string; titolo: unknown;
  sottotitolo?: unknown; descrizione?: unknown; meta_title?: unknown; meta_description?: unknown;
  data_inizio: string; data_fine?: string | null; copertina_url: string | null;
  location: string | null; updated_at?: string | null;
};

const brandDescription = {
  it: "Eventi, workshop ed esperienze da vivere con Meraki Experience.",
  en: "Events, workshops and experiences to enjoy with Meraki Experience.",
  de: "Events, Workshops und Erlebnisse mit Meraki Experience.",
  es: "Eventos, talleres y experiencias para disfrutar con Meraki Experience.",
};
const language = (locale: string) => SOCIAL_LOCALES.find(value => value === locale) || "it";
const plain = (value: unknown, locale: string) => richTextPlainText(getLocalizedText(value, locale)).replace(/\s+/g, " ").trim();

function summary(text: string, length = 180) {
  const characters = Array.from(text);
  if (characters.length <= length) return text;
  const prefix = characters.slice(0, length - 1).join("");
  const boundary = prefix.lastIndexOf(" ");
  return `${boundary > length * 0.65 ? prefix.slice(0, boundary) : prefix}…`;
}

export function eventSocialCopy(event: SocialEvent, locale: string) {
  const title = plain(event.meta_title, locale) || plain(event.titolo, locale) || "Meraki Experience";
  const description = summary(plain(event.meta_description, locale) || plain(event.descrizione, locale)
    || plain(event.sottotitolo, locale) || title);
  return { title, description };
}

function localizedPath(locale: string, path: string) {
  const pathname = path.split(/[?#]/, 1)[0].replace(/^\/(?:it|en|de|es)(?=\/|$)/, "");
  return `/${language(locale)}${!pathname || pathname === "/" ? "" : `/${pathname.replace(/^\/+/, "")}`}`;
}

function socialMetadata(locale: string, path: string | undefined, title: string, description: string, image: {
  url: string; width: number; height: number; alt: string; type: string;
}): Metadata {
  const current = language(locale);
  const url = path === undefined ? undefined : `${MERAKI_SITE_ORIGIN}${localizedPath(current, path)}`;
  return {
    metadataBase: new URL(MERAKI_SITE_ORIGIN), title, description,
    ...(url && { alternates: { canonical: url, languages: Object.fromEntries(SOCIAL_LOCALES.map(code => [code, `${MERAKI_SITE_ORIGIN}${localizedPath(code, path!)}`])) } }),
    openGraph: { type: "website", title, description, siteName: "Meraki Experience", locale: ogLocales[current],
      alternateLocale: SOCIAL_LOCALES.filter(code => code !== current).map(code => ogLocales[code]),
      ...(url && { url }), images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image.url, alt: image.alt, width: image.width, height: image.height }] },
  };
}

export function brandSocialMetadata(locale: string, path?: string, overrides?: { title?: string; description?: string }) {
  const title = overrides?.title || "ASD Meraki Experience";
  const description = overrides?.description || brandDescription[language(locale)];
  return socialMetadata(locale, path, title, description, {
    url: `${MERAKI_SITE_ORIGIN}/images/logo-meraki-email.png`, width: 901, height: 238, type: "image/png", alt: "Meraki Experience",
  });
}

export function eventSocialMetadata(event: SocialEvent, locale: string, path: string): Metadata {
  const { title, description } = eventSocialCopy(event, locale);
  const image = new URL(`/api/social/event/${encodeURIComponent(event.id)}`, MERAKI_SITE_ORIGIN);
  image.searchParams.set("lang", language(locale));
  image.searchParams.set("v", event.updated_at || "1");
  return socialMetadata(locale, path, title, description, {
    url: image.href, width: 1200, height: 630, type: "image/png", alt: title,
  });
}
