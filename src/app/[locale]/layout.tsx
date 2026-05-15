import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

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
  const favicon = branding?.favicon_url || "/favicon.ico";

  return {
    title,
    description,
    icons: {
      icon: favicon,
      apple: favicon,
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
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
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
        
        {integrations?.facebook_pixel_id && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  !function(f,b,e,v,n,t,s)
                  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;
                  t.src=v;s=b.getElementsByTagName(e)[0];
                  s.parentNode.insertBefore(t,s)}(window, document,'script',
                  'https://connect.facebook.net/en_US/fbevents.js');
                  fbq('init', '${integrations.facebook_pixel_id}');
                  fbq('track', 'PageView');
                `,
              }}
            />
            <noscript>
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                src={`https://www.facebook.com/tr?id=${integrations.facebook_pixel_id}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <ModalProvider>
            {children}
          </ModalProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
