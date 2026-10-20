import type { Metadata } from "next";
import { EmailPreferences } from "@/components/meraki/email-preferences";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const titles: Record<string, string> = { it: "Preferenze email", en: "Email preferences", de: "E-Mail-Einstellungen", es: "Preferencias de email" };
  return { title: `${titles[locale] || titles.it} · Meraki`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default async function EmailPreferencesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);
  return <EmailPreferences locale={locale} token={typeof token === "string" && /^[a-f0-9]{64}$/i.test(token) ? token : ""} />;
}
