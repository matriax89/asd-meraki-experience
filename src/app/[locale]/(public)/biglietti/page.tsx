import type { Metadata } from "next";
import { walletCopy } from "@/components/meraki/wallet-copy";
import { TicketWallet } from "@/components/meraki/ticket-wallet";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const copy = walletCopy(locale);
  return { title: `${copy.title} · Meraki`, description: copy.intro, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function BigliettiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <TicketWallet locale={locale} siteOrigin={process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org"} />;
}
