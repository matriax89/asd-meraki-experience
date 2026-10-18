import type { Metadata } from "next";
import { EmailPreferences } from "@/components/meraki/email-preferences";

export const metadata: Metadata = { title: "Meraki · Email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function EmailPreferencesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);
  return <EmailPreferences locale={locale} token={typeof token === "string" && /^[a-f0-9]{64}$/i.test(token) ? token : ""} />;
}
