import type { Metadata } from "next";
import { PaymentStatus } from "./payment-status";

export const metadata: Metadata = {
  title: "Il tuo biglietto | Meraki",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PaymentPage({ searchParams, params }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const [{ session_id }, { locale }] = await Promise.all([searchParams, params]);
  return <PaymentStatus sessionId={session_id || ""} locale={locale} />;
}
