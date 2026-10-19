import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Suspense } from "react";
import { FacebookPixelEvents } from "@/components/public/facebook-pixel-events";
import { InstallProvider } from "@/components/pwa/install-provider";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = { themeColor: "#f5f4f0", viewportFit: "cover" };

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const branding = (settings?.value as any)?.branding;

  const title = branding?.meta_title || "ASD Meraki Experience";
  const description = branding?.meta_description || "Benessere, fitness e cambiamento";
  const favicon = branding?.favicon_url || "/icons/meraki-original-192.png";

  return {
    title,
    description,
    applicationName: "Meraki",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Meraki",
      statusBarStyle: "default",
    },
    icons: {
      icon: favicon,
      apple: [{ url: "/icons/meraki-original-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: favicon,
    },
    openGraph: {
      title,
      description,
      siteName: title,
      images: [
        {
          url: branding?.logo_url || "https://www.merakiexperience.org/images/logo.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
  };
}

import { createClient } from "@/lib/supabase/server";
import { JsonLd } from "@/components/seo/json-ld";
import { ModalProvider } from "@/components/ui/modal-provider";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client side
  const messages = await getMessages();

  // Fetch dynamic theme colors
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();
    
  const themeColors = (settings?.value as any)?.theme_colors || null;
  const integrations = (settings?.value as any)?.integrations || null;
  const branding = (settings?.value as any)?.branding || null;

  // Default LocalBusiness Schema
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "name": "ASD Meraki Experience",
    "image": "https://www.merakiexperience.org/images/logo.png",
    "@id": "https://www.merakiexperience.org",
    "url": "https://www.merakiexperience.org",
    "telephone": "+39000000000",
    "email": "info@merakiexperience.org",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Bolzano",
      "addressRegion": "BZ",
      "addressCountry": "IT"
    },
    "sameAs": [
      "https://www.facebook.com/asdmerakiexperience",
      "https://www.instagram.com/merakiexperience_official",
      "https://www.youtube.com/@merakiexperience"
    ]
  };

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        {branding?.favicon_url && (
          <link rel="icon" href={branding.favicon_url} />
        )}
        <JsonLd schema={localBusinessSchema} />
        {themeColors && (
          <style dangerouslySetInnerHTML={{ __html: `
            :root {
              --color-background: ${themeColors.background} !important;
              --color-foreground: ${themeColors.foreground} !important;
              --color-gold: ${themeColors.gold} !important;
              --color-card: ${themeColors.cardBackground} !important;
              --color-secondary: ${themeColors.cardBackground} !important;
            }
            .bg-slate-900 { background-color: ${themeColors.cardBackground} !important; }
          `}} />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <InstallProvider>
            <ModalProvider>
              <Suspense fallback={null}>
                <FacebookPixelEvents />
              </Suspense>
              {children}
            </ModalProvider>
          </InstallProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
