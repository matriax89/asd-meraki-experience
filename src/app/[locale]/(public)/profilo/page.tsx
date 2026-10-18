import type { Metadata } from "next";
import { MerakiProfile } from "@/components/meraki/profile";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const titles: Record<string, string> = { it: "Il tuo spazio", en: "Your space", de: "Dein Bereich" };
  return { title: `${titles[locale] ?? titles.it} · Meraki` };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MerakiProfile locale={locale} />;
}
