import type { Metadata } from "next";
import { MerakiProfile } from "@/components/meraki/profile";
import { hasCommerceStaffAccess } from "@/lib/commerce/admin-auth";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const titles: Record<string, string> = { it: "Informazioni", en: "Information", de: "Informationen", es: "Información" };
  return { title: `${titles[locale] ?? titles.it} · Meraki` };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const [{ locale }, staffAccess] = await Promise.all([params, hasCommerceStaffAccess()]);
  return <MerakiProfile locale={locale} staffAccess={staffAccess} />;
}
