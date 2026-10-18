import type { Metadata } from "next";
import { TicketWallet } from "@/components/meraki/ticket-wallet";

export const metadata: Metadata = {
  title: "I miei biglietti · Meraki",
  description: "I tuoi eventi Meraki, sempre a portata di mano.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BigliettiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <TicketWallet locale={locale} siteOrigin={process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org"} />;
}
