import type { Metadata } from "next";
import { PaymentStatus } from "./payment-status";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const titles: Record<string, string> = { it: "Il tuo biglietto", en: "Your ticket", de: "Dein Ticket", es: "Tu entrada" };
  return { title: `${titles[locale] || titles.it} | Meraki`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function PaymentPage({ searchParams, params }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const [{ session_id }, { locale }] = await Promise.all([searchParams, params]);
  return <PaymentStatus sessionId={session_id || ""} locale={locale} />;
}
